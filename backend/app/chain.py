"""Puente entre el backend y MilestoneRegistry en Ethereum.

Lee contracts/deployments/<red>.json (direccion + ABI) que genera el script de
deploy, asi que no hay direcciones ni ABIs duplicados en el codigo Python.

Si no hay despliegue, RPC o llave privada, el cliente queda deshabilitado y la API
sigue funcionando: todo lo local opera igual y solo fallan los endpoints de anclaje.
Eso permite desarrollar sin red y sin gastar ETH.
"""
import json
import logging
from typing import Any, Dict, List, Optional

from app.config import CHAIN_NETWORK, DEPLOYMENTS_DIR, PRIVATE_KEY, RPC_URL

logger = logging.getLogger(__name__)

FALLBACK_RPC = "https://ethereum-sepolia-rpc.publicnode.com"
EXPLORERS = {"sepolia": "https://sepolia.etherscan.io"}


class ChainError(RuntimeError):
    """Falla al hablar con la cadena; los routers la traducen a HTTP 503/502."""


class ChainClient:
    def __init__(self) -> None:
        self.network = CHAIN_NETWORK
        self.deployment: Optional[Dict[str, Any]] = None
        self.w3 = None
        self.contract = None
        self.account = None
        self.error: Optional[str] = None
        self._connect()

    # ------------------------------------------------------------------
    # Arranque
    # ------------------------------------------------------------------
    def _connect(self) -> None:
        path = DEPLOYMENTS_DIR / f"{self.network}.json"
        if not path.exists():
            self.error = f"No existe {path}. Corre `npm run deploy:{self.network}` en contracts/."
            return

        self.deployment = json.loads(path.read_text())

        if not PRIVATE_KEY:
            self.error = "Falta DEPLOYER_PRIVATE_KEY (contracts/.env). Solo lectura deshabilitada."
            return

        try:
            from web3 import Web3
            from web3.middleware import ExtraDataToPOAMiddleware

            self.w3 = Web3(Web3.HTTPProvider(RPC_URL or FALLBACK_RPC, request_kwargs={"timeout": 30}))
            self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
            self.account = self.w3.eth.account.from_key(PRIVATE_KEY)
            self.contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(self.deployment["address"]),
                abi=self.deployment["abi"],
            )
        except Exception as exc:  # pragma: no cover - depende de la red
            self.error = f"No se pudo inicializar web3: {exc}"
            logger.warning(self.error)

    @property
    def enabled(self) -> bool:
        return self.contract is not None and self.account is not None

    def _require(self):
        if not self.enabled:
            raise ChainError(self.error or "Cliente de blockchain no disponible")
        return self.contract

    def explorer_tx(self, tx_hash: str) -> Optional[str]:
        base = EXPLORERS.get(self.network)
        return f"{base}/tx/{tx_hash}" if base else None

    def status(self) -> Dict[str, Any]:
        """Diagnostico para GET /chain/status: no revienta si la red esta caida."""
        info: Dict[str, Any] = {
            "enabled": self.enabled,
            "network": self.network,
            "error": self.error,
            "address": (self.deployment or {}).get("address"),
            "chain_id": (self.deployment or {}).get("chainId"),
            "rpc": RPC_URL or FALLBACK_RPC,
        }
        if not self.enabled:
            return info

        info["account"] = self.account.address
        try:
            info["connected"] = self.w3.is_connected()
            info["block_number"] = self.w3.eth.block_number
            balance = self.w3.eth.get_balance(self.account.address)
            info["balance_eth"] = float(self.w3.from_wei(balance, "ether"))
            info["project_count"] = self.contract.functions.projectCount().call()
        except Exception as exc:
            info["connected"] = False
            info["error"] = f"RPC no responde: {exc}"
        return info

    # ------------------------------------------------------------------
    # Escritura
    # ------------------------------------------------------------------
    def _send(self, fn) -> Dict[str, Any]:
        """Firma y envia una transaccion, y espera el recibo."""
        self._require()
        try:
            nonce = self.w3.eth.get_transaction_count(self.account.address, "pending")
            tx = fn.build_transaction({"from": self.account.address, "nonce": nonce})
            signed = self.account.sign_transaction(tx)
            raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
            tx_hash = self.w3.eth.send_raw_transaction(raw)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
        except Exception as exc:
            raise ChainError(str(exc)) from exc

        if receipt.status != 1:
            raise ChainError(f"La transaccion revirtio: {receipt.transactionHash.hex()}")

        tx_hex = receipt.transactionHash.hex()
        if not tx_hex.startswith("0x"):
            tx_hex = "0x" + tx_hex
        return {
            "tx_hash": tx_hex,
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "explorer_url": self.explorer_tx(tx_hex),
        }

    def register_project(self, project_id: str, doc_hash: str) -> Dict[str, Any]:
        c = self._require()
        return self._send(c.functions.registerProject(_b32(project_id), _b32(doc_hash)))

    def add_milestones(self, project_id: str, title_hashes: List[str], due_dates: List[int]) -> Dict[str, Any]:
        c = self._require()
        return self._send(
            c.functions.addMilestones(_b32(project_id), [_b32(h) for h in title_hashes], due_dates)
        )

    def update_milestone_status(
        self, project_id: str, index: int, status: int, evidence_hash: str
    ) -> Dict[str, Any]:
        c = self._require()
        return self._send(
            c.functions.updateMilestoneStatus(_b32(project_id), index, int(status), _b32(evidence_hash))
        )

    def register_report(self, project_id: str, report_hash: str) -> Dict[str, Any]:
        c = self._require()
        return self._send(c.functions.registerReport(_b32(project_id), _b32(report_hash)))

    # ------------------------------------------------------------------
    # Lectura (gratis, sin transaccion)
    # ------------------------------------------------------------------
    def read_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        c = self._require()
        try:
            raw = c.functions.getProject(_b32(project_id)).call()
        except Exception:
            return None  # ProjectNotFound: aun no esta anclado
        return {
            "owner": raw[0],
            "doc_hash": _hex(raw[1]),
            "report_hash": _hex(raw[2]),
            "created_at": raw[3],
            "report_registered_at": raw[4],
            "report_version": raw[5],
        }

    def read_milestones(self, project_id: str) -> List[Dict[str, Any]]:
        c = self._require()
        raw = c.functions.getMilestones(_b32(project_id)).call()
        return [
            {
                "index": i,
                "title_hash": _hex(m[0]),
                "evidence_hash": _hex(m[1]),
                "due_date": m[2],
                "updated_at": m[3],
                "status": m[4],
            }
            for i, m in enumerate(raw)
        ]

    def progress_bps(self, project_id: str) -> int:
        return self._require().functions.progressBps(_b32(project_id)).call()

    def verify_document(self, project_id: str, candidate_hash: str) -> bool:
        return self._require().functions.verifyDocument(_b32(project_id), _b32(candidate_hash)).call()

    def verify_report(self, project_id: str, candidate_hash: str) -> bool:
        return self._require().functions.verifyReport(_b32(project_id), _b32(candidate_hash)).call()


def _b32(value: str) -> bytes:
    """Hex string -> bytes32, que es lo que espera el contrato."""
    data = bytes.fromhex(value[2:] if value.startswith("0x") else value)
    if len(data) != 32:
        raise ValueError(f"Se esperaban 32 bytes, llegaron {len(data)}: {value}")
    return data


def _hex(value: bytes) -> str:
    return "0x" + value.hex()


_client: Optional[ChainClient] = None


def get_chain() -> ChainClient:
    """Singleton perezoso: una sola conexion para toda la app."""
    global _client
    if _client is None:
        _client = ChainClient()
    return _client
