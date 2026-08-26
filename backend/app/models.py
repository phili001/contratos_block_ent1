"""Entidades del MVP: Proyecto, Documento, Hito, Actualizacion y Reporte.

Los campos que empiezan por `chain_` son el rastro de lo anclado en Ethereum:
si estan en NULL, ese dato existe solo en la base local todavia.
"""
import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.progress import Status


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Rastro on-chain
    chain_project_id: Mapped[Optional[str]] = mapped_column(String(66), default=None)
    chain_tx_hash: Mapped[Optional[str]] = mapped_column(String(66), default=None)
    chain_registered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=None)

    document: Mapped[Optional["Document"]] = relationship(
        back_populates="project", uselist=False, cascade="all, delete-orphan"
    )
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Milestone.order_index"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Report.version"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    filename: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[Optional[str]] = mapped_column(String(120), default=None)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    keccak256: Mapped[str] = mapped_column(String(66))  # el que se ancla
    sha256: Mapped[str] = mapped_column(String(66))  # referencia legible
    stored_path: Mapped[str] = mapped_column(String(500))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    project: Mapped["Project"] = relationship(back_populates="document")


class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(String(300))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    due_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    status: Mapped[int] = mapped_column(Integer, default=int(Status.PENDING))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    # Indice del hito dentro del contrato; NULL = todavia no esta anclado.
    chain_index: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    chain_status: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    # Ultimo bundle de evidencia anclado: si difiere del actual, hay fotos sin anclar.
    chain_evidence_hash: Mapped[Optional[str]] = mapped_column(String(66), default=None)

    project: Mapped["Project"] = relationship(back_populates="milestones")
    updates: Mapped[list["MilestoneUpdate"]] = relationship(
        back_populates="milestone", cascade="all, delete-orphan", order_by="MilestoneUpdate.created_at"
    )

    @property
    def title_hash(self) -> str:
        from app.hashing import milestone_title_hash

        return milestone_title_hash(self.name, self.description)


class MilestoneUpdate(Base):
    """Historial de cambios de estado con su nota de evidencia."""

    __tablename__ = "milestone_updates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    milestone_id: Mapped[str] = mapped_column(ForeignKey("milestones.id"))
    previous_status: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    status: Mapped[int] = mapped_column(Integer)
    note: Mapped[Optional[str]] = mapped_column(Text, default=None)
    evidence_hash: Mapped[str] = mapped_column(String(66))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    chain_tx_hash: Mapped[Optional[str]] = mapped_column(String(66), default=None)

    milestone: Mapped["Milestone"] = relationship(back_populates="updates")
    files: Mapped[list["EvidenceFile"]] = relationship(
        back_populates="update", cascade="all, delete-orphan", order_by="EvidenceFile.position"
    )


class EvidenceFile(Base):
    """Foto o archivo adjunto como prueba de un cambio de estado.

    El archivo se queda en disco; a la cadena solo va su hash, combinado con el de
    la nota y el de los demas adjuntos en un solo bytes32 (ver evidence_bundle_hash).
    """

    __tablename__ = "evidence_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    update_id: Mapped[str] = mapped_column(ForeignKey("milestone_updates.id"))
    filename: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[Optional[str]] = mapped_column(String(120), default=None)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    keccak256: Mapped[str] = mapped_column(String(66))
    stored_path: Mapped[str] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    update: Mapped["MilestoneUpdate"] = relationship(back_populates="files")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    progress_bps: Mapped[int] = mapped_column(Integer, default=0)
    keccak256: Mapped[str] = mapped_column(String(66))
    stored_path: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    chain_tx_hash: Mapped[Optional[str]] = mapped_column(String(66), default=None)

    project: Mapped["Project"] = relationship(back_populates="reports")
