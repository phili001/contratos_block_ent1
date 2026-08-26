"""Evidencia fotografica: varios archivos por cambio de estado, resumidos en un bytes32."""
from app.hashing import ZERO_HASH, evidence_bundle_hash, evidence_hash, keccak_bytes

FOTO_1 = b"\x89PNG\r\n\x1a\n foto de la cocina terminada"
FOTO_2 = b"\x89PNG\r\n\x1a\n foto de los acabados"


def _proyecto_con_hito(client):
    pid = client.post("/projects", json={"name": "Construccion de casa"}).json()["id"]
    mid = client.post(f"/projects/{pid}/milestones", json={"name": "Cocina terminada"}).json()["id"]
    return pid, mid


def test_bundle_de_nota_sola_es_el_hash_de_la_nota():
    assert evidence_bundle_hash("Cocina lista", []) == evidence_hash("Cocina lista")


def test_bundle_sin_nada_es_cero():
    assert evidence_bundle_hash(None, []) == ZERO_HASH


def test_el_orden_de_los_archivos_importa():
    a, b = keccak_bytes(FOTO_1), keccak_bytes(FOTO_2)
    assert evidence_bundle_hash("x", [a, b]) != evidence_bundle_hash("x", [b, a])


def test_subir_fotos_como_evidencia(client):
    pid, mid = _proyecto_con_hito(client)

    r = client.post(
        f"/projects/{pid}/milestones/{mid}/updates",
        data={"status": "3", "note": "Cocina terminada, faltan detalles de pintura"},
        files=[
            ("files", ("cocina1.png", FOTO_1, "image/png")),
            ("files", ("cocina2.png", FOTO_2, "image/png")),
        ],
    )
    assert r.status_code == 201
    hito = r.json()
    assert hito["status_label"] == "Alcanzado"

    historial = client.get(f"/projects/{pid}/milestones/{mid}/history").json()
    assert len(historial) == 1
    update = historial[0]
    assert len(update["files"]) == 2
    assert [f["filename"] for f in update["files"]] == ["cocina1.png", "cocina2.png"]
    assert update["files"][0]["keccak256"] == keccak_bytes(FOTO_1)

    # El hash anclado resume nota + fotos en orden.
    esperado = evidence_bundle_hash(
        "Cocina terminada, faltan detalles de pintura", [keccak_bytes(FOTO_1), keccak_bytes(FOTO_2)]
    )
    assert update["evidence_hash"] == esperado


def test_descargar_la_foto(client):
    pid, mid = _proyecto_con_hito(client)
    client.post(
        f"/projects/{pid}/milestones/{mid}/updates",
        data={"status": "3"},
        files=[("files", ("cocina.png", FOTO_1, "image/png"))],
    )
    archivo = client.get(f"/projects/{pid}/milestones/{mid}/history").json()[0]["files"][0]
    assert archivo["url"].endswith(archivo["id"])

    descarga = client.get(archivo["url"])
    assert descarga.status_code == 200
    assert descarga.content == FOTO_1


def test_solo_fotos_sin_cambiar_estado(client):
    """Subir evidencia sin mover el estado tambien es un cambio: el bundle es distinto."""
    pid, mid = _proyecto_con_hito(client)
    r = client.post(
        f"/projects/{pid}/milestones/{mid}/updates",
        data={"status": "0"},
        files=[("files", ("avance.png", FOTO_1, "image/png"))],
    )
    assert r.status_code == 201
    update = client.get(f"/projects/{pid}/milestones/{mid}/history").json()[0]
    assert update["evidence_hash"] != ZERO_HASH


def test_sin_estado_nota_ni_archivos_falla(client):
    pid, mid = _proyecto_con_hito(client)
    r = client.post(f"/projects/{pid}/milestones/{mid}/updates", data={"status": "0"})
    assert r.status_code == 400


def test_tipo_de_archivo_no_permitido(client):
    pid, mid = _proyecto_con_hito(client)
    r = client.post(
        f"/projects/{pid}/milestones/{mid}/updates",
        data={"status": "3"},
        files=[("files", ("script.exe", b"MZ", "application/x-msdownload"))],
    )
    assert r.status_code == 415


def test_demasiados_archivos(client):
    pid, mid = _proyecto_con_hito(client)
    r = client.post(
        f"/projects/{pid}/milestones/{mid}/updates",
        data={"status": "3"},
        files=[("files", (f"f{i}.png", FOTO_1, "image/png")) for i in range(11)],
    )
    assert r.status_code == 400
