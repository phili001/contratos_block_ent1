"""Calculo de progreso. Es un espejo exacto de MilestoneRegistry.sol.

Si estos numeros no coinciden con los de la cadena, la verificacion pierde sentido:
el test test_progress.py compara ambas implementaciones contra el mismo ejemplo.
"""
from enum import IntEnum
from typing import Dict, Iterable, List

BPS = 10_000


class Status(IntEnum):
    """Mismo orden y mismos valores que el enum Status del contrato."""

    PENDING = 0
    IN_PROGRESS = 1
    AT_RISK = 2
    ACHIEVED = 3
    NOT_ACHIEVED = 4


LABELS: Dict[Status, str] = {
    Status.PENDING: "Pendiente",
    Status.IN_PROGRESS: "En progreso",
    Status.AT_RISK: "En riesgo",
    Status.ACHIEVED: "Alcanzado",
    Status.NOT_ACHIEVED: "No alcanzado",
}

WEIGHTS_BPS: Dict[Status, int] = {
    Status.ACHIEVED: BPS,
    Status.IN_PROGRESS: BPS // 2,
    Status.AT_RISK: BPS // 4,
    Status.PENDING: 0,
    Status.NOT_ACHIEVED: 0,
}

# Secciones del reporte, como las pide la propuesta.
SECTIONS = {
    "alcanzados": [Status.ACHIEVED],
    "requieren_trabajo": [Status.IN_PROGRESS, Status.NOT_ACHIEVED],
    "en_riesgo": [Status.AT_RISK],
    "pendientes": [Status.PENDING],
}


def status_weight_bps(status: Status) -> int:
    return WEIGHTS_BPS[Status(status)]


def progress_bps(statuses: Iterable[Status]) -> int:
    """Suma de pesos / numero de hitos, truncado igual que la division entera de Solidity."""
    values: List[int] = [status_weight_bps(s) for s in statuses]
    if not values:
        return 0
    return sum(values) // len(values)


def progress_percent(statuses: Iterable[Status]) -> float:
    """El mismo valor en porcentaje legible: 6250 bps -> 62.5."""
    return progress_bps(statuses) / 100


def status_breakdown(statuses: Iterable[Status]) -> Dict[str, int]:
    counts = {label: 0 for label in LABELS.values()}
    for status in statuses:
        counts[LABELS[Status(status)]] += 1
    return counts
