from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import ALLOWED_EVIDENCE_TYPES, EVIDENCE_DIR, MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES
from app.database import get_db
from app.hashing import evidence_bundle_hash, evidence_hash, keccak_bytes
from app.progress import Status
from app.routers.projects import get_project

router = APIRouter(prefix="/projects/{project_id}/milestones", tags=["hitos"])


def _get_milestone(project: models.Project, milestone_id: str) -> models.Milestone:
    for milestone in project.milestones:
        if milestone.id == milestone_id:
            return milestone
    raise HTTPException(404, f"Hito {milestone_id} no encontrado en el proyecto")


@router.post("", response_model=schemas.MilestoneOut, status_code=201)
def create_milestone(project_id: str, payload: schemas.MilestoneCreate, db: Session = Depends(get_db)):
    project = get_project(project_id, db)
    milestone = models.Milestone(
        project_id=project.id,
        name=payload.name,
        description=payload.description,
        due_date=payload.due_date,
        order_index=len(project.milestones),
    )
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return schemas.MilestoneOut.build(milestone)


@router.get("", response_model=List[schemas.MilestoneOut])
def list_milestones(project_id: str, db: Session = Depends(get_db)):
    return [schemas.MilestoneOut.build(m) for m in get_project(project_id, db).milestones]


@router.patch("/{milestone_id}", response_model=schemas.MilestoneOut)
def update_status(
    project_id: str,
    milestone_id: str,
    payload: schemas.MilestoneStatusUpdate,
    db: Session = Depends(get_db),
):
    """Cambia el estado y deja registro en el historial con el hash de la nota.

    Solo toca la base local: el anclaje en Ethereum es un paso aparte y explicito
    (POST /projects/{id}/chain/sync), para no gastar gas en cada edicion.
    """
    project = get_project(project_id, db)
    milestone = _get_milestone(project, milestone_id)

    previous = milestone.status
    new_status = int(payload.status)
    if previous == new_status and not payload.note:
        raise HTTPException(400, "No hay cambios: mismo estado y sin nota nueva")

    milestone.status = new_status
    db.add(
        models.MilestoneUpdate(
            milestone_id=milestone.id,
            previous_status=previous,
            status=new_status,
            note=payload.note,
            evidence_hash=evidence_hash(payload.note),
        )
    )
    db.commit()
    db.refresh(milestone)
    return schemas.MilestoneOut.build(milestone)


@router.post("/{milestone_id}/updates", response_model=schemas.MilestoneOut, status_code=201)
async def update_with_evidence(
    project_id: str,
    milestone_id: str,
    status: int = Form(...),
    note: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    """Cambia el estado adjuntando fotos como prueba.

    Ejemplo: el hito es "Cocina terminada", se marca Alcanzado y se suben tres fotos.
    Las fotos se quedan en este servidor; a la cadena sube un solo bytes32 que resume
    la nota y los hashes de las fotos, en orden (ver evidence_bundle_hash).
    """
    project = get_project(project_id, db)
    milestone = _get_milestone(project, milestone_id)

    archivos = [f for f in files if f.filename]
    if len(archivos) > MAX_EVIDENCE_FILES:
        raise HTTPException(400, f"Maximo {MAX_EVIDENCE_FILES} archivos por actualizacion")

    previous = milestone.status
    new_status = int(Status(status))
    if previous == new_status and not note and not archivos:
        raise HTTPException(400, "No hay cambios: mismo estado, sin nota y sin archivos")

    # Se leen todos antes de escribir nada, para no dejar adjuntos a medias.
    leidos = []
    for archivo in archivos:
        data = await archivo.read()
        if not data:
            raise HTTPException(400, f"{archivo.filename} esta vacio")
        if len(data) > MAX_EVIDENCE_BYTES:
            raise HTTPException(413, f"{archivo.filename} supera {MAX_EVIDENCE_BYTES} bytes")
        if archivo.content_type not in ALLOWED_EVIDENCE_TYPES:
            raise HTTPException(415, f"Tipo no permitido: {archivo.content_type}")
        leidos.append((archivo, data))

    update = models.MilestoneUpdate(
        milestone_id=milestone.id,
        previous_status=previous,
        status=new_status,
        note=note,
        evidence_hash=evidence_hash(note),  # se recalcula abajo con los archivos
    )
    db.add(update)
    db.flush()

    hashes = []
    for position, (archivo, data) in enumerate(leidos):
        file_hash = keccak_bytes(data)
        destino = EVIDENCE_DIR / f"{update.id}-{position}-{archivo.filename}"
        destino.write_bytes(data)
        hashes.append(file_hash)
        db.add(
            models.EvidenceFile(
                update_id=update.id,
                filename=archivo.filename,
                content_type=archivo.content_type,
                size_bytes=len(data),
                keccak256=file_hash,
                stored_path=str(destino),
                position=position,
            )
        )

    update.evidence_hash = evidence_bundle_hash(note, hashes)
    milestone.status = new_status
    db.commit()
    db.refresh(milestone)
    return schemas.MilestoneOut.build(milestone, project_id)


@router.get("/{milestone_id}/evidence/{file_id}")
def download_evidence(project_id: str, milestone_id: str, file_id: str, db: Session = Depends(get_db)):
    """Sirve el archivo de evidencia. Vive solo aqui: la cadena nunca lo tuvo."""
    milestone = _get_milestone(get_project(project_id, db), milestone_id)
    for update in milestone.updates:
        for archivo in update.files:
            if archivo.id == file_id:
                return FileResponse(
                    archivo.stored_path,
                    media_type=archivo.content_type or "application/octet-stream",
                    filename=archivo.filename,
                )
    raise HTTPException(404, "Archivo de evidencia no encontrado")


@router.get("/{milestone_id}/history", response_model=List[schemas.MilestoneUpdateOut])
def milestone_history(project_id: str, milestone_id: str, db: Session = Depends(get_db)):
    milestone = _get_milestone(get_project(project_id, db), milestone_id)
    return [schemas.MilestoneUpdateOut.build(u, project_id, milestone_id) for u in milestone.updates]
