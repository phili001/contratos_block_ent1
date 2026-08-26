"""El calculo local debe dar exactamente lo mismo que MilestoneRegistry.sol."""
import pytest

from app.progress import Status, progress_bps, status_breakdown, status_weight_bps


def test_pesos_iguales_al_contrato():
    assert status_weight_bps(Status.ACHIEVED) == 10000
    assert status_weight_bps(Status.IN_PROGRESS) == 5000
    assert status_weight_bps(Status.AT_RISK) == 2500
    assert status_weight_bps(Status.PENDING) == 0
    assert status_weight_bps(Status.NOT_ACHIEVED) == 0


def test_ejemplo_del_documento():
    """Alcanzado, Alcanzado, En progreso, Pendiente -> 62.5%"""
    estados = [Status.ACHIEVED, Status.ACHIEVED, Status.IN_PROGRESS, Status.PENDING]
    assert progress_bps(estados) == 6250


def test_sin_hitos_es_cero():
    assert progress_bps([]) == 0


@pytest.mark.parametrize(
    "estados,esperado",
    [
        ([Status.ACHIEVED], 10000),
        ([Status.PENDING, Status.PENDING], 0),
        ([Status.AT_RISK, Status.ACHIEVED], 6250),
        # Division entera igual que Solidity: 10000/3 = 3333, no 3333.33
        ([Status.ACHIEVED, Status.PENDING, Status.PENDING], 3333),
    ],
)
def test_casos(estados, esperado):
    assert progress_bps(estados) == esperado


def test_breakdown():
    estados = [Status.ACHIEVED, Status.AT_RISK, Status.ACHIEVED]
    assert status_breakdown(estados)["Alcanzado"] == 2
    assert status_breakdown(estados)["En riesgo"] == 1
