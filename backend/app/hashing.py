"""Convencion de hashes compartida con el contrato.

El contrato solo ve bytes32. Para que verifyDocument/verifyReport funcionen, estas
funciones deben producir exactamente los mismos valores que produjo el script que
ancla los datos. Ver contracts/README.md, seccion "Convencion de hashes".
"""
import hashlib
from typing import Optional, Sequence

from eth_utils import keccak

ZERO_HASH = "0x" + "00" * 32


def _hex(value: bytes) -> str:
    return "0x" + value.hex()


def keccak_text(text: str) -> str:
    """keccak256 de un texto UTF-8."""
    return _hex(keccak(text.encode("utf-8")))


def keccak_bytes(data: bytes) -> str:
    """keccak256 de un archivo o cualquier binario."""
    return _hex(keccak(data))


def sha256_bytes(data: bytes) -> str:
    """SHA-256, guardado solo como referencia legible para el usuario."""
    return "0x" + hashlib.sha256(data).hexdigest()


def project_id_hash(project_uuid: str) -> str:
    """projectId on-chain = keccak256(utf8(uuid))."""
    return keccak_text(project_uuid)


def milestone_title_hash(name: str, description: Optional[str] = None) -> str:
    """titleHash = keccak256(utf8(nombre + "\\n" + descripcion))."""
    return keccak_text(f"{name}\n{description or ''}")


def evidence_hash(note: Optional[str]) -> str:
    """evidenceHash = keccak256(utf8(nota)), o bytes32(0) si no hay nota."""
    if not note or not note.strip():
        return ZERO_HASH
    return keccak_text(note)


def evidence_bundle_hash(note: Optional[str], file_hashes: Sequence[str]) -> str:
    """Hash de un paquete de evidencia: una nota mas N archivos adjuntos.

    Se ancla un solo bytes32 por hito, asi que hay que resumir nota y fotos en un
    valor. La regla es:

        bundle = keccak256( keccak256(nota) || hash_archivo_1 || ... || hash_archivo_n )

    Con los archivos en el orden en que se subieron. Es reproducible por cualquiera
    que tenga la nota y los archivos, que es justo lo que hace verificable la evidencia.

    Sin nota ni archivos devuelve bytes32(0): para el contrato significa "sin evidencia".
    """
    if not file_hashes:
        return evidence_hash(note)

    parts = bytes.fromhex(evidence_hash(note)[2:])
    for file_hash in file_hashes:
        parts += bytes.fromhex(file_hash[2:] if file_hash.startswith("0x") else file_hash)
    return _hex(keccak(parts))
