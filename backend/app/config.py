"""Configuracion del backend. Todo se puede sobreescribir por variables de entorno."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

# Almacenamiento local: los PDFs y reportes NO van a la cadena, solo su hash.
STORAGE_DIR = Path(os.getenv("STORAGE_DIR", BASE_DIR / "storage"))
DOCUMENTS_DIR = STORAGE_DIR / "documents"
REPORTS_DIR = STORAGE_DIR / "reports"
EVIDENCE_DIR = STORAGE_DIR / "evidence"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'app.db'}")

# Red y despliegue del contrato. El archivo lo genera `npm run deploy:<red>`.
CHAIN_NETWORK = os.getenv("CHAIN_NETWORK", "sepolia")
DEPLOYMENTS_DIR = Path(os.getenv("DEPLOYMENTS_DIR", PROJECT_ROOT / "contracts" / "deployments"))

# Se leen del .env de contracts/ si no estan definidas aqui.
RPC_URL = os.getenv("SEPOLIA_RPC_URL") or ""
PRIVATE_KEY = os.getenv("DEPLOYER_PRIVATE_KEY") or ""

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", 20 * 1024 * 1024))
MAX_EVIDENCE_BYTES = int(os.getenv("MAX_EVIDENCE_BYTES", 10 * 1024 * 1024))
MAX_EVIDENCE_FILES = int(os.getenv("MAX_EVIDENCE_FILES", 10))
ALLOWED_EVIDENCE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/gif", "application/pdf"}

for directory in (DOCUMENTS_DIR, REPORTS_DIR, EVIDENCE_DIR):
    directory.mkdir(parents=True, exist_ok=True)


def store_path(path: Path) -> str:
    """Guarda la ruta relativa a STORAGE_DIR.

    Antes se guardaba absoluta y renombrar la carpeta del proyecto rompia todos los
    archivos. Relativa, la base sobrevive a mover o renombrar el directorio.
    """
    return str(Path(path).resolve().relative_to(STORAGE_DIR.resolve()))


def resolve_path(stored: str) -> Path:
    """Convierte lo guardado en una ruta usable, aceptando el formato viejo absoluto."""
    path = Path(stored)
    if path.is_absolute():
        # Registro antiguo: se rescata por el nombre de archivo bajo STORAGE_DIR.
        candidato = STORAGE_DIR / path.parent.name / path.name
        return candidato if candidato.exists() else path
    return STORAGE_DIR / path


def load_contracts_env() -> None:
    """Reutiliza contracts/.env para no duplicar credenciales en dos archivos."""
    global RPC_URL, PRIVATE_KEY
    env_file = PROJECT_ROOT / "contracts" / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key == "SEPOLIA_RPC_URL" and value and not RPC_URL:
            RPC_URL = value
        elif key == "DEPLOYER_PRIVATE_KEY" and value and not PRIVATE_KEY:
            PRIVATE_KEY = value


load_contracts_env()
