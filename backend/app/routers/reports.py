from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import resolve_path
from app.database import get_db
from app.report import build_report
from app.routers.projects import get_project

router = APIRouter(prefix="/projects/{project_id}/reports", tags=["reportes"])


@router.post("", response_model=schemas.ReportOut, status_code=201)
def generate_report(project_id: str, db: Session = Depends(get_db)):
    """Genera el reporte HTML, lo guarda y calcula su hash (aun sin anclar)."""
    project = get_project(project_id, db)
    if not project.milestones:
        raise HTTPException(400, "El proyecto no tiene hitos; no hay nada que reportar")

    version = len(project.reports) + 1
    path, report_hash, bps = build_report(project, project.milestones, project.document, version)

    report = models.Report(
        project_id=project.id,
        version=version,
        progress_bps=bps,
        keccak256=report_hash,
        stored_path=path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("", response_model=List[schemas.ReportOut])
def list_reports(project_id: str, db: Session = Depends(get_db)):
    return get_project(project_id, db).reports


@router.get("/latest/html")
def latest_report_html(project_id: str, db: Session = Depends(get_db)):
    project = get_project(project_id, db)
    if not project.reports:
        raise HTTPException(404, "El proyecto no tiene reportes generados")
    return FileResponse(resolve_path(project.reports[-1].stored_path), media_type="text/html")
