"""Aisla la base y el almacenamiento antes de importar la app."""
import os
import tempfile
from pathlib import Path

TMP = Path(tempfile.mkdtemp(prefix="milestone-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{TMP / 'test.db'}"
os.environ["STORAGE_DIR"] = str(TMP / "storage")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
