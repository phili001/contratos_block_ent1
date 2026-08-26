from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependencia de FastAPI: una sesion por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columnas agregadas despues del primer despliegue. Sin Alembic en el MVP, se
# aplican a mano: SQLite acepta ALTER TABLE ADD COLUMN sin reescribir la tabla.
MIGRATIONS = [
    ("milestones", "chain_evidence_hash", "VARCHAR(66)"),
]


def _apply_migrations() -> None:
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, tipo in MIGRATIONS:
            if table not in existing:
                continue
            columnas = {c["name"] for c in inspector.get_columns(table)}
            if column not in columnas:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {tipo}"))


def init_db() -> None:
    from app import models  # noqa: F401  (registra las tablas antes de crearlas)

    Base.metadata.create_all(bind=engine)
    _apply_migrations()
