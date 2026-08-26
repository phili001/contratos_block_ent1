"""Generacion del reporte. El HTML se guarda en disco y su keccak256 se ancla."""
from datetime import datetime
from html import escape
from typing import Dict, List

from app.config import REPORTS_DIR
from app.hashing import keccak_bytes
from app.progress import LABELS, SECTIONS, Status, progress_bps, status_breakdown

SECTION_TITLES = {
    "alcanzados": "Objetivos alcanzados",
    "requieren_trabajo": "Requieren trabajo adicional",
    "en_riesgo": "En riesgo",
    "pendientes": "Pendientes",
}


def split_sections(milestones) -> Dict[str, List]:
    """Agrupa los hitos en las secciones que pide la propuesta."""
    grouped: Dict[str, List] = {key: [] for key in SECTIONS}
    for milestone in milestones:
        for key, statuses in SECTIONS.items():
            if Status(milestone.status) in statuses:
                grouped[key].append(milestone)
                break
    return grouped


def render_html(project, milestones, document) -> str:
    bps = progress_bps([m.status for m in milestones])
    breakdown = status_breakdown([m.status for m in milestones])
    sections = split_sections(milestones)
    generated = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    def rows(items) -> str:
        if not items:
            return '<tr><td colspan="3" class="vacio">Sin hitos en esta seccion</td></tr>'
        return "".join(
            "<tr>"
            f"<td>{escape(m.name)}</td>"
            f"<td>{escape(LABELS[Status(m.status)])}</td>"
            f"<td class='hash'>{escape(m.title_hash)}</td>"
            "</tr>"
            for m in items
        )

    bloques = "".join(
        f"<h2>{escape(SECTION_TITLES[key])} <span class='conteo'>{len(sections[key])}</span></h2>"
        "<table><thead><tr><th>Hito</th><th>Estado</th><th>titleHash</th></tr></thead>"
        f"<tbody>{rows(sections[key])}</tbody></table>"
        for key in SECTIONS
    )

    resumen = "".join(
        f"<li><strong>{escape(label)}:</strong> {count}</li>" for label, count in breakdown.items() if count
    )

    doc_block = (
        f"<li><strong>Documento:</strong> {escape(document.filename)}</li>"
        f"<li><strong>Hash del documento:</strong> <code>{escape(document.keccak256)}</code></li>"
        if document
        else "<li><strong>Documento:</strong> no cargado</li>"
    )

    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Reporte - {escape(project.name)}</title>
<style>
 body {{ font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }}
 h1 {{ margin-bottom: .25rem; }} .meta {{ color: #666; font-size: .9rem; }}
 .progreso {{ font-size: 2.5rem; font-weight: 700; margin: 1rem 0; }}
 .barra {{ background: #eee; border-radius: 6px; height: 14px; overflow: hidden; }}
 .barra > div {{ background: #2f6f4f; height: 100%; }}
 table {{ border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; font-size: .9rem; }}
 th, td {{ border-bottom: 1px solid #ddd; padding: .5rem; text-align: left; }}
 th {{ background: #f6f6f6; }}
 .hash {{ font-family: ui-monospace, monospace; font-size: .72rem; color: #666; word-break: break-all; }}
 .vacio {{ color: #999; font-style: italic; }}
 .conteo {{ background: #eee; border-radius: 10px; padding: 0 .5rem; font-size: .8rem; vertical-align: middle; }}
 ul {{ line-height: 1.7; }} code {{ font-size: .78rem; word-break: break-all; }}
</style></head><body>
<h1>{escape(project.name)}</h1>
<p class="meta">Reporte generado el {generated} &middot; proyecto <code>{escape(project.id)}</code></p>
<div class="progreso">{bps / 100:.2f}%</div>
<div class="barra"><div style="width:{bps / 100:.2f}%"></div></div>
<h2>Resumen</h2>
<ul>
 <li><strong>Hitos totales:</strong> {len(milestones)}</li>
 {resumen}
 {doc_block}
</ul>
{bloques}
<p class="meta">Los estados fueron asignados manualmente por el equipo. El porcentaje se calcula
con pesos fijos (Alcanzado 100%, En progreso 50%, En riesgo 25%) y es reproducible on-chain
llamando <code>progressBps</code> en el contrato.</p>
</body></html>"""


def build_report(project, milestones, document, version: int):
    """Genera el HTML, lo guarda y devuelve (ruta, hash, progreso_bps)."""
    html = render_html(project, milestones, document)
    data = html.encode("utf-8")
    path = REPORTS_DIR / f"{project.id}-v{version}.html"
    path.write_bytes(data)
    return path, keccak_bytes(data), progress_bps([m.status for m in milestones])
