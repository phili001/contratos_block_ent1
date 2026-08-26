"""Flujo completo de la API, sin tocar la cadena."""
from app.hashing import keccak_bytes

PDF_FALSO = b"%PDF-1.4 contenido de la propuesta"


def _crear_proyecto(client, nombre="Proyecto de Redes"):
    r = client.post("/projects", json={"name": nombre, "description": "MVP"})
    assert r.status_code == 201
    return r.json()


def test_crear_proyecto_deriva_el_id_onchain(client):
    from app.hashing import project_id_hash

    data = _crear_proyecto(client)
    assert data["chain_project_id"] == project_id_hash(data["id"])
    assert data["chain_tx_hash"] is None  # aun no se ancla nada
    assert data["progress_bps"] == 0


def test_subir_documento_calcula_el_hash(client):
    pid = _crear_proyecto(client)["id"]
    r = client.post(f"/projects/{pid}/document", files={"file": ("propuesta.pdf", PDF_FALSO, "application/pdf")})
    assert r.status_code == 201
    assert r.json()["keccak256"] == keccak_bytes(PDF_FALSO)
    assert r.json()["size_bytes"] == len(PDF_FALSO)


def test_documento_es_inmutable(client):
    pid = _crear_proyecto(client)["id"]
    files = {"file": ("propuesta.pdf", PDF_FALSO, "application/pdf")}
    assert client.post(f"/projects/{pid}/document", files=files).status_code == 201
    r = client.post(f"/projects/{pid}/document", files={"file": ("otro.pdf", b"otro", "application/pdf")})
    assert r.status_code == 409


def test_flujo_completo_da_62_5_por_ciento(client):
    pid = _crear_proyecto(client)["id"]
    client.post(f"/projects/{pid}/document", files={"file": ("p.pdf", PDF_FALSO, "application/pdf")})

    ids = []
    for nombre in ["Modelo de datos", "Backend", "Contrato", "Reporte"]:
        r = client.post(f"/projects/{pid}/milestones", json={"name": nombre})
        assert r.status_code == 201
        assert r.json()["status_label"] == "Pendiente"
        ids.append(r.json()["id"])

    # Alcanzado, Alcanzado, En progreso, Pendiente -> 62.5%
    client.patch(f"/projects/{pid}/milestones/{ids[0]}", json={"status": 3, "note": "listo"})
    client.patch(f"/projects/{pid}/milestones/{ids[1]}", json={"status": 3, "note": "8 endpoints"})
    client.patch(f"/projects/{pid}/milestones/{ids[2]}", json={"status": 1, "note": "falta desplegar"})

    resumen = client.get(f"/projects/{pid}/summary").json()
    assert resumen["progress_bps"] == 6250
    assert resumen["progress_percent"] == 62.5
    assert resumen["breakdown"]["Alcanzado"] == 2
    assert len(resumen["sections"]["alcanzados"]) == 2
    assert len(resumen["sections"]["requieren_trabajo"]) == 1
    assert len(resumen["sections"]["pendientes"]) == 1


def test_historial_guarda_hash_de_la_nota(client):
    from app.hashing import evidence_hash

    pid = _crear_proyecto(client)["id"]
    mid = client.post(f"/projects/{pid}/milestones", json={"name": "Backend"}).json()["id"]
    client.patch(f"/projects/{pid}/milestones/{mid}", json={"status": 1, "note": "avance parcial"})
    client.patch(f"/projects/{pid}/milestones/{mid}", json={"status": 3, "note": "terminado"})

    historial = client.get(f"/projects/{pid}/milestones/{mid}/history").json()
    assert len(historial) == 2
    assert historial[0]["previous_status"] == 0 and historial[0]["status"] == 1
    assert historial[1]["evidence_hash"] == evidence_hash("terminado")


def test_actualizacion_sin_cambios_falla(client):
    pid = _crear_proyecto(client)["id"]
    mid = client.post(f"/projects/{pid}/milestones", json={"name": "X"}).json()["id"]
    assert client.patch(f"/projects/{pid}/milestones/{mid}", json={"status": 0}).status_code == 400


def test_reporte_se_genera_y_su_hash_corresponde_al_archivo(client):
    from app import models
    from app.config import resolve_path
    from app.database import SessionLocal

    pid = _crear_proyecto(client)["id"]
    client.post(f"/projects/{pid}/document", files={"file": ("p.pdf", PDF_FALSO, "application/pdf")})
    mid = client.post(f"/projects/{pid}/milestones", json={"name": "Unico"}).json()["id"]
    client.patch(f"/projects/{pid}/milestones/{mid}", json={"status": 3, "note": "ok"})

    reporte = client.post(f"/projects/{pid}/reports").json()
    assert reporte["version"] == 1
    assert reporte["progress_bps"] == 10000

    db = SessionLocal()
    guardado = db.query(models.Report).filter_by(id=reporte["id"]).one()
    contenido = resolve_path(guardado.stored_path).read_bytes()
    db.close()
    # El hash anclado debe ser el del archivo tal como quedo en disco.
    assert reporte["keccak256"] == keccak_bytes(contenido)
    assert b"100.00%" in contenido

    html = client.get(f"/projects/{pid}/reports/latest/html")
    assert html.status_code == 200


def test_reporte_sin_hitos_falla(client):
    pid = _crear_proyecto(client)["id"]
    assert client.post(f"/projects/{pid}/reports").status_code == 400


def test_proyecto_inexistente(client):
    assert client.get("/projects/no-existe").status_code == 404


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_las_rutas_se_guardan_relativas(client):
    """Renombrar la carpeta del proyecto no debe romper los archivos guardados."""
    from app import models
    from app.config import resolve_path
    from app.database import SessionLocal

    pid = _crear_proyecto(client)["id"]
    client.post(f"/projects/{pid}/document", files={"file": ("p.pdf", PDF_FALSO, "application/pdf")})

    db = SessionLocal()
    doc = db.query(models.Document).filter_by(project_id=pid).one()
    db.close()

    assert not doc.stored_path.startswith("/"), "la ruta no debe ser absoluta"
    assert doc.stored_path.startswith("documents/")
    assert resolve_path(doc.stored_path).exists()
