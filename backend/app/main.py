import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.chain import get_chain
from app.database import init_db
from app.routers import chain, milestones, projects, reports

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    estado = get_chain().status()
    if estado["enabled"]:
        logging.info("Contrato %s en %s", estado["address"], estado["network"])
    else:
        logging.warning("Blockchain deshabilitada: %s", estado["error"])
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Milestone Verification API",
    description=(
        "Seguimiento de hitos de un documento de proyecto, con anclaje de hashes en Ethereum. "
        "Los archivos se quedan aqui; a la cadena solo suben huellas digitales."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(milestones.router)
app.include_router(reports.router)
app.include_router(chain.router)


@app.get("/health", tags=["salud"])
def health():
    return {"status": "ok"}
