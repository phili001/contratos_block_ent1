"""Esquemas de entrada/salida de la API."""
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.progress import LABELS, Status


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None


class MilestoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    description: Optional[str] = None
    due_date: Optional[date] = None


class MilestoneStatusUpdate(BaseModel):
    status: Status
    note: Optional[str] = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    size_bytes: int
    keccak256: str
    sha256: str
    uploaded_at: datetime


class EvidenceFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    content_type: Optional[str]
    size_bytes: int
    keccak256: str
    position: int
    url: str = ""


class MilestoneUpdateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    previous_status: Optional[int]
    status: int
    note: Optional[str]
    evidence_hash: str
    created_at: datetime
    chain_tx_hash: Optional[str]
    files: List[EvidenceFileOut] = []

    @classmethod
    def build(cls, update, project_id: str, milestone_id: str) -> "MilestoneUpdateOut":
        out = cls.model_validate(update)
        for archivo in out.files:
            out_url = f"/projects/{project_id}/milestones/{milestone_id}/evidence/{archivo.id}"
            archivo.url = out_url
        return out


class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str]
    due_date: Optional[date]
    status: int
    status_label: str = ""
    order_index: int
    title_hash: str = ""
    chain_index: Optional[int]
    chain_status: Optional[int]
    updated_at: datetime
    updates: List[MilestoneUpdateOut] = []

    @classmethod
    def build(cls, milestone, project_id: Optional[str] = None) -> "MilestoneOut":
        out = cls.model_validate(milestone)
        out.status_label = LABELS[Status(milestone.status)]
        out.title_hash = milestone.title_hash
        pid = project_id or milestone.project_id
        for update in out.updates:
            for archivo in update.files:
                archivo.url = f"/projects/{pid}/milestones/{milestone.id}/evidence/{archivo.id}"
        return out


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    version: int
    progress_bps: int
    keccak256: str
    created_at: datetime
    chain_tx_hash: Optional[str]


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str]
    created_at: datetime
    chain_project_id: Optional[str]
    chain_tx_hash: Optional[str]
    chain_registered_at: Optional[datetime]
    document: Optional[DocumentOut] = None
    milestone_count: int = 0
    progress_bps: int = 0
    progress_percent: float = 0.0


class SummaryOut(BaseModel):
    """Lo que alimenta la vista de reporte: progreso + hitos por seccion."""

    project_id: str
    project_name: str
    progress_bps: int
    progress_percent: float
    milestone_count: int
    breakdown: Dict[str, int]
    sections: Dict[str, List[MilestoneOut]]
    document: Optional[DocumentOut] = None
    latest_report: Optional[ReportOut] = None
    chain: Optional[Dict[str, Any]] = None


class TxOut(BaseModel):
    tx_hash: str
    block_number: int
    gas_used: int
    explorer_url: Optional[str] = None


class VerificationOut(BaseModel):
    matches: bool
    computed_hash: str
    registered_hash: Optional[str]
    kind: str
    detail: str
    milestone_name: Optional[str] = None
    filename: Optional[str] = None
