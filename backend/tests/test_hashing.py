"""Los hashes deben ser identicos a los que produce ethers en los scripts."""
from app.hashing import ZERO_HASH, evidence_hash, keccak_text, milestone_title_hash, project_id_hash


def test_keccak_conocido():
    # ethers: id("proyecto-1")
    assert project_id_hash("proyecto-1") == "0xab91e395b8093fb90b533c9594d78cba23792f45114085f4d71cf848217e5ed7"


def test_title_hash_concatena_con_salto_de_linea():
    assert milestone_title_hash("Modelo de datos", "Crear entidades") == keccak_text(
        "Modelo de datos\nCrear entidades"
    )


def test_title_hash_sin_descripcion():
    assert milestone_title_hash("Backend") == keccak_text("Backend\n")


def test_evidencia_vacia_es_hash_cero():
    assert evidence_hash(None) == ZERO_HASH
    assert evidence_hash("   ") == ZERO_HASH
    assert evidence_hash("nota real") != ZERO_HASH
