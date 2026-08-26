from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import DOCUMENTS_DIR, MAX_UPLOAD_BYTES, store_path
from app.database import get_db
from app.hashing import keccak_bytes, project_id_hash, sha256_bytes
from app.progress import progress_bps, status_breakdown
from app.report import split_sections

router = APIRouter(prefix="/projects", tags=["proyectos"])


def get_project(project_id: str, db: Session) -> models.Project:
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, f"Proyecto {project_id} no encontrado")
    return project


def _to_out(project: models.Project) -> schemas.ProjectOut:
    out = schemas.ProjectOut.model_validate(project)
    statuses = [m.status for m in project.milestones]
    out.milestone_count = len(statuses)
    out.progress_bps = progress_bps(statuses)
    out.progress_percent = out.progress_bps / 100
    return out


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    project = models.Project(name=payload.name, description=payload.description)
    # El id on-chain se deriva del uuid: keccak256(utf8(uuid)). No se puede adivinar.
    db.add(project)
    db.flush()
    project.chain_project_id = project_id_hash(project.id)
    db.commit()
    db.refresh(project)
    return _to_out(project)


@router.get("", response_model=List[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return [_to_out(p) for p in db.query(models.Project).order_by(models.Project.created_at.desc()).all()]


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def read_project(project_id: str, db: Session = Depends(get_db)):
    return _to_out(get_project(project_id, db))


@router.post("/{project_id}/document", response_model=schemas.DocumentOut, status_code=201)
async def upload_document(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Sube el documento inicial y calcula su hash. El archivo se queda local."""
    project = get_project(project_id, db)
    if project.document is not None:
        raise HTTPException(409, "El proyecto ya tiene un documento; el hash original es inmutable")

    data = await file.read()
    if not data:
        raise HTTPException(400, "El archivo esta vacio")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"El archivo supera {MAX_UPLOAD_BYTES} bytes")

    stored = DOCUMENTS_DIR / f"{project.id}-{file.filename}"
    stored.write_bytes(data)

    document = models.Document(
        project_id=project.id,
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=len(data),
        keccak256=keccak_bytes(data),  # este es el que se ancla
        sha256=sha256_bytes(data),
        stored_path=store_path(stored),
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.get("/{project_id}/summary", response_model=schemas.SummaryOut)
def project_summary(project_id: str, db: Session = Depends(get_db)):
    """Resumen que alimenta la vista de reporte: progreso y hitos por seccion."""
    project = get_project(project_id, db)
    milestones = project.milestones
    statuses = [m.status for m in milestones]
    sections = split_sections(milestones)
    latest: Optional[models.Report] = project.reports[-1] if project.reports else None

    return schemas.SummaryOut(
        project_id=project.id,
        project_name=project.name,
        progress_bps=progress_bps(statuses),
        progress_percent=progress_bps(statuses) / 100,
        milestone_count=len(milestones),
        breakdown=status_breakdown(statuses),
        sections={k: [schemas.MilestoneOut.build(m) for m in v] for k, v in sections.items()},
        document=schemas.DocumentOut.model_validate(project.document) if project.document else None,
        latest_report=schemas.ReportOut.model_validate(latest) if latest else None,
    )
