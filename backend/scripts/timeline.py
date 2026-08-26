"""Linea de tiempo de un proyecto leida desde Ethereum, con los hashes traducidos.

    cd backend && venv/bin/python scripts/timeline.py [projectId|nombre]

Lee los eventos del contrato y los cruza con la base local para mostrar a que hito
corresponde cada hash. No gasta gas: todo son llamadas de lectura.
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import models  # noqa: E402
from app.chain import get_chain  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.progress import LABELS, Status  # noqa: E402

CHUNK = 5000  # los RPC publicos limitan el rango de bloques por consulta


def fecha(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def main() -> None:
    client = get_chain()
    if not client.enabled:
        print(f"Sin conexion a la cadena: {client.error}")
        return

    try:
        client.w3.eth.block_number
    except Exception as exc:
        print(f"\nEl RPC no responde: {type(exc).__name__}")
        print("Prueba otro endpoint:  cd ../contracts && npm run rpc:find\n")
        return

    db = SessionLocal()
    argumento = " ".join(sys.argv[1:]).strip()

    proyectos = db.query(models.Project).all()
    if argumento:
        proyectos = [p for p in proyectos if argumento.lower() in p.name.lower() or argumento == p.chain_project_id]
    proyectos = [p for p in proyectos if p.chain_tx_hash]
    if not proyectos:
        print("No hay proyectos anclados que coincidan.")
        return

    w3 = client.w3
    for project in proyectos:
        # Diccionarios para traducir hashes -> texto legible.
        por_title = {m.title_hash: m for m in project.milestones}
        por_evidencia = {}
        for m in project.milestones:
            for u in m.updates:
                por_evidencia[u.evidence_hash] = u

        recibo = w3.eth.get_transaction_receipt(project.chain_tx_hash)
        desde = recibo["blockNumber"]
        hasta = w3.eth.block_number

        print(f"\n{'=' * 78}")
        print(f"{project.name}")
        print(f"{'=' * 78}")
        print(f"contrato  {client.deployment['address']}")
        print(f"projectId {project.chain_project_id}")
        print(f"bloques   {desde} → {hasta}\n")

        eventos = []
        for evento in ("ProjectRegistered", "MilestoneAdded", "MilestoneStatusChanged", "ReportRegistered"):
            handler = client.contract.events[evento]()
            inicio = desde
            while inicio <= hasta:
                fin = min(inicio + CHUNK, hasta)
                try:
                    for log in handler.get_logs(from_block=inicio, to_block=fin):
                        if log["args"].get("projectId") == bytes.fromhex(project.chain_project_id[2:]):
                            eventos.append(log)
                except Exception as exc:
                    print(f"  (no se pudieron leer bloques {inicio}-{fin}: {exc})")
                inicio = fin + 1

        eventos.sort(key=lambda e: (e["blockNumber"], e["logIndex"]))
        print(f"{len(eventos)} eventos on-chain\n")

        for log in eventos:
            args = log["args"]
            nombre = log["event"]
            bloque = w3.eth.get_block(log["blockNumber"])
            cabecera = f"[{fecha(bloque['timestamp'])}] bloque {log['blockNumber']}"
            tx = log["transactionHash"].hex()
            tx = tx if tx.startswith("0x") else "0x" + tx

            if nombre == "ProjectRegistered":
                doc = project.document
                print(f"{cabecera}  PROYECTO REGISTRADO")
                print(f"    docHash  0x{args['docHash'].hex()}")
                print(f"    archivo  {doc.filename if doc else '(no esta en la base local)'}")
                print(f"    owner    {args['owner']}")
            elif nombre == "MilestoneAdded":
                th = "0x" + args["titleHash"].hex()
                m = por_title.get(th)
                print(f"{cabecera}  HITO AGREGADO  #{args['index']}")
                print(f"    titleHash {th}")
                print(f"    significa \"{m.name}\"" if m else "    (hash sin correspondencia local)")
            elif nombre == "MilestoneStatusChanged":
                eh = "0x" + args["evidenceHash"].hex()
                m = next((x for x in project.milestones if x.chain_index == args["index"]), None)
                u = por_evidencia.get(eh)
                anterior = LABELS[Status(args["previousStatus"])]
                nuevo = LABELS[Status(args["newStatus"])]
                print(f"{cabecera}  CAMBIO DE ESTADO  #{args['index']}")
                print(f"    {anterior} → {nuevo}")
                if m:
                    print(f"    hito      \"{m.name}\"")
                print(f"    evidencia {eh}")
                if u:
                    if u.note:
                        print(f"    nota      \"{u.note}\"")
                    if u.files:
                        print(f"    fotos     {', '.join(f.filename for f in u.files)}")
                else:
                    print("    (sin evidencia registrada localmente)")
            elif nombre == "ReportRegistered":
                print(f"{cabecera}  REPORTE ANCLADO  v{args['version']}")
                print(f"    reportHash 0x{args['reportHash'].hex()}")
                print(f"    progreso   {args['progressBps'] / 100}%")

            print(f"    tx        https://sepolia.etherscan.io/tx/{tx}\n")

    db.close()


if __name__ == "__main__":
    main()
