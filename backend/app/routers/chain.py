"""Endpoints de anclaje y verificacion en Ethereum.

El anclaje es explicito y no automatico: la app guarda todo localmente y solo sube
a la cadena cuando se pide, para controlar cuando se gasta gas.
"""
import calendar
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models, schemas
from app.chain import ChainError, get_chain
from app.database import get_db
from app.hashing import ZERO_HASH, keccak_bytes
from app.progress import LABELS, Status
from app.routers.projects import get_project

router = APIRouter(tags=["blockchain"])


def _due_timestamp(due_date) -> int:
    """date -> unix timestamp UTC. 0 significa "sin fecha objetivo" para el contrato."""
    if due_date is None:
        return 0
    return calendar.timegm(due_date.timetuple())


def _chain():
    client = get_chain()
    if not client.enabled:
        raise HTTPException(503, client.error or "Cliente de blockchain no disponible")
    return client


@router.get("/chain/status")
def chain_status() -> Dict[str, Any]:
    """Diagnostico: red, contrato, saldo y bloque actual. No requiere que todo funcione."""
    return get_chain().status()


@router.post("/projects/{project_id}/chain/sync")
def sync_to_chain(project_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Sube a Ethereum lo que falte: proyecto, hitos nuevos y cambios de estado.

    Es idempotente: lo ya anclado no se vuelve a enviar.
    """
    client = _chain()
    project = get_project(project_id, db)
    if project.document is None:
        raise HTTPException(400, "Sube primero el documento: su hash es lo que se ancla")

    acciones = []
    chain_id = project.chain_project_id

    try:
        # 1. El proyecto y el hash del documento.
        if project.chain_tx_hash is None:
            result = client.register_project(chain_id, project.document.keccak256)
            project.chain_tx_hash = result["tx_hash"]
            project.chain_registered_at = models._now()
            acciones.append({"accion": "registerProject", **result})
            db.commit()

        # 2. Los hitos que aun no tienen indice on-chain.
        pendientes = [m for m in project.milestones if m.chain_index is None]
        if pendientes:
            base = len([m for m in project.milestones if m.chain_index is not None])
            result = client.add_milestones(
                chain_id,
                [m.title_hash for m in pendientes],
                [_due_timestamp(m.due_date) for m in pendientes],
            )
            for offset, milestone in enumerate(pendientes):
                milestone.chain_index = base + offset
                milestone.chain_status = int(Status.PENDING)
                milestone.chain_evidence_hash = ZERO_HASH
            acciones.append({"accion": f"addMilestones ({len(pendientes)})", **result})
            db.commit()

        # 3. Estados y evidencia que cambiaron desde el ultimo anclaje.
        #    Subir fotos sin cambiar el estado tambien cuenta: el bundle hash cambia.
        for milestone in project.milestones:
            if milestone.chain_index is None:
                continue
            ultima = milestone.updates[-1] if milestone.updates else None
            evidencia = ultima.evidence_hash if ultima else ZERO_HASH
            sin_cambios = milestone.chain_status == milestone.status and milestone.chain_evidence_hash == evidencia
            if sin_cambios:
                continue
            result = client.update_milestone_status(
                chain_id,
                milestone.chain_index,
                milestone.status,
                evidencia,
            )
            milestone.chain_status = milestone.status
            milestone.chain_evidence_hash = evidencia
            if ultima:
                ultima.chain_tx_hash = result["tx_hash"]
            acciones.append(
                {"accion": f"updateMilestoneStatus[{milestone.chain_index}] -> {LABELS[Status(milestone.status)]}",
                 **result}
            )
            db.commit()
    except ChainError as exc:
        db.commit()  # conserva lo que si alcanzo a anclarse
        raise HTTPException(502, f"Error en la cadena: {exc}. Anclado parcial: {len(acciones)} acciones")

    return {
        "project_id": project.id,
        "chain_project_id": chain_id,
        "acciones": acciones,
        "sin_cambios": len(acciones) == 0,
        "progress_bps_onchain": client.progress_bps(chain_id),
    }


@router.post("/projects/{project_id}/chain/report", response_model=schemas.TxOut)
def anchor_report(project_id: str, db: Session = Depends(get_db)):
    """Ancla el hash del ultimo reporte generado."""
    client = _chain()
    project = get_project(project_id, db)
    if not project.reports:
        raise HTTPException(400, "Genera primero un reporte")
    if project.chain_tx_hash is None:
        raise HTTPException(400, "El proyecto no esta anclado todavia: usa /chain/sync")

    report = project.reports[-1]
    if report.chain_tx_hash:
        raise HTTPException(409, f"El reporte v{report.version} ya fue anclado en {report.chain_tx_hash}")

    try:
        result = client.register_report(project.chain_project_id, report.keccak256)
    except ChainError as exc:
        raise HTTPException(502, f"Error en la cadena: {exc}")

    report.chain_tx_hash = result["tx_hash"]
    db.commit()
    return schemas.TxOut(**result)


@router.get("/projects/{project_id}/chain")
def read_from_chain(project_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Estado del proyecto segun la cadena, comparado con el local.

    Si `coinciden` es false, alguien edito la base sin re-anclar.
    """
    client = _chain()
    project = get_project(project_id, db)
    onchain = client.read_project(project.chain_project_id)
    if onchain is None:
        return {"anclado": False, "detalle": "El proyecto no esta registrado en el contrato"}

    hitos = client.read_milestones(project.chain_project_id)
    bps_onchain = client.progress_bps(project.chain_project_id)
    from app.progress import progress_bps as local_bps

    bps_local = local_bps([m.status for m in project.milestones])
    return {
        "anclado": True,
        "contrato": client.deployment["address"],
        "red": client.network,
        "explorer": f"https://sepolia.etherscan.io/address/{client.deployment['address']}",
        "proyecto": onchain,
        "hitos": [{**h, "estado": LABELS[Status(h["status"])]} for h in hitos],
        "progress_bps_onchain": bps_onchain,
        "progress_bps_local": bps_local,
        "coinciden": bps_onchain == bps_local,
    }


@router.post("/projects/{project_id}/verify/document", response_model=schemas.VerificationOut)
async def verify_document(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Recalcula el hash del archivo subido y lo compara con el anclado en la cadena."""
    client = _chain()
    project = get_project(project_id, db)
    data = await file.read()
    computed = keccak_bytes(data)

    onchain = client.read_project(project.chain_project_id)
    if onchain is None:
        raise HTTPException(400, "El proyecto no esta anclado en la cadena todavia")

    matches = client.verify_document(project.chain_project_id, computed)
    return schemas.VerificationOut(
        matches=matches,
        computed_hash=computed,
        registered_hash=onchain["doc_hash"],
        kind="documento",
        detail=(
            "El archivo coincide exactamente con la version registrada en Ethereum."
            if matches
            else "El archivo NO coincide: fue modificado o no es la version registrada."
        ),
    )


@router.post("/projects/{project_id}/verify/evidence", response_model=schemas.VerificationOut)
async def verify_evidence(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Verifica una foto de evidencia contra la cadena.

    Busca el archivo por su hash entre la evidencia del proyecto y comprueba que el
    bundle al que pertenece sea el que el contrato tiene anclado para ese hito. Si la
    foto fue retocada, su hash cambia y no aparece; si fue reemplazada despues del
    anclaje, aparece pero el bundle ya no coincide.
    """
    client = _chain()
    project = get_project(project_id, db)
    data = await file.read()
    computed = keccak_bytes(data)

    encontrado = None
    for milestone in project.milestones:
        for update in milestone.updates:
            for archivo in update.files:
                if archivo.keccak256 == computed:
                    encontrado = (milestone, update, archivo)
                    break

    if encontrado is None:
        return schemas.VerificationOut(
            matches=False,
            computed_hash=computed,
            registered_hash=None,
            kind="evidencia",
            detail="Ninguna evidencia de este proyecto tiene ese hash: el archivo no corresponde o fue modificado.",
            filename=file.filename,
        )

    milestone, update, archivo = encontrado
    if milestone.chain_index is None:
        return schemas.VerificationOut(
            matches=False,
            computed_hash=computed,
            registered_hash=None,
            kind="evidencia",
            detail=f"La evidencia existe en '{milestone.name}', pero ese hito no esta anclado todavia.",
            milestone_name=milestone.name,
            filename=archivo.filename,
        )

    onchain = client.read_milestones(project.chain_project_id)
    anclado = onchain[milestone.chain_index]["evidence_hash"] if milestone.chain_index < len(onchain) else None
    coincide = anclado == update.evidence_hash

    return schemas.VerificationOut(
        matches=coincide,
        computed_hash=computed,
        registered_hash=anclado,
        kind="evidencia",
        detail=(
            f"Foto verificada: forma parte de la evidencia anclada del hito '{milestone.name}'."
            if coincide
            else f"La foto pertenece a '{milestone.name}', pero ese paquete de evidencia no es el anclado en la cadena."
        ),
        milestone_name=milestone.name,
        filename=archivo.filename,
    )


@router.post("/projects/{project_id}/verify/report", response_model=schemas.VerificationOut)
async def verify_report(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    client = _chain()
    project = get_project(project_id, db)
    data = await file.read()
    computed = keccak_bytes(data)

    onchain = client.read_project(project.chain_project_id)
    if onchain is None:
        raise HTTPException(400, "El proyecto no esta anclado en la cadena todavia")

    matches = client.verify_report(project.chain_project_id, computed)
    return schemas.VerificationOut(
        matches=matches,
        computed_hash=computed,
        registered_hash=onchain["report_hash"],
        kind="reporte",
        detail=(
            "El reporte coincide con el hash anclado."
            if matches
            else "El reporte NO coincide con el ultimo hash anclado."
        ),
    )
