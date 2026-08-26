# Ethereum-Based Milestone Verification System

MVP del proyecto de Redes. Aplicación web para seguir el cumplimiento de los compromisos
de un documento de proyecto, dejando evidencia verificable en Ethereum.

Responde tres preguntas: **¿qué se prometió?**, **¿qué se ha cumplido?** y **¿qué falta?**

Los PDFs, las notas y las evidencias **nunca** salen del servidor. A la cadena solo suben
hashes: identificador del proyecto, hash del documento, estados de los hitos y hash del
reporte. Ethereum se usa como capa de verificación, no de almacenamiento.

## Estado

| Componente | Estado |
|---|---|
| Contrato Solidity | Desplegado en Sepolia, 21 tests |
| Backend FastAPI | 20 endpoints, 22 tests |
| Frontend React | 4 vistas |
| Evidencia fotográfica | Fotos por hito, resumidas en un hash |
| Reporte HTML | Generado y anclado |
| Reporte PDF | Pendiente |

**Contrato en vivo:** [`0xb33F9D4eb191e06B30565EAa9822e6E46132D06F`](https://sepolia.etherscan.io/address/0xb33F9D4eb191e06B30565EAa9822e6E46132D06F)

## Arrancar

Tres terminales:

```bash
cd contracts && npm install && npm test
```

```bash
cd backend && python3 -m venv venv && venv/bin/pip install -r requirements.txt && venv/bin/python -m uvicorn app.main:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

La app queda en http://localhost:5173 y la API documentada en http://127.0.0.1:8000/docs.

## Arquitectura

```
PDF ─────────► keccak256 ──┐
hitos manuales ────────────┤
fotos de evidencia ────────┼──► SQLite + disco ──► reporte HTML ──► keccak256 ──┐
                           │                                                    │
                           └──► Ethereum: projectId, docHash, hitos,             │
                                estados, evidenceHash, reportHash ◄──────────────┘
```

Ejemplo: en un contrato de obra, el hito "Cocina terminada" se marca como Alcanzado con
tres fotos. Las fotos se quedan en el servidor; la cadena recibe un `bytes32` que las
resume. Meses después, cualquiera puede subir una de esas fotos y comprobar que es
exactamente la que se presentó como prueba ese día.

- **[contracts/](contracts)** — `MilestoneRegistry.sol`, un contrato multi-proyecto que
  guarda hashes y calcula el progreso on-chain. Hardhat, tests y scripts de despliegue.
- **[backend/](backend)** — FastAPI + SQLite. Calcula hashes, gestiona hitos, genera el
  reporte y habla con la cadena vía web3.py.
- **[frontend/](frontend)** — React + Tailwind. Cuatro vistas sobre la API.

## Por qué es verificable

El progreso se calcula **en los dos lados**: `backend/app/progress.py` es un espejo exacto
de `MilestoneRegistry.sol`, con la misma división entera. Cualquiera puede llamar
`progressBps` en Etherscan y comprobar el porcentaje sin confiar en el servidor.

Para verificar un documento, la app recalcula su hash y lo compara con el anclado. Si
coinciden, el archivo es idéntico al registrado; si no, fue modificado.

## Fuera del MVP

Inteligencia artificial, extracción automática de hitos, comparación semántica de
evidencias, IPFS, Mainnet, autenticación por billetera, múltiples roles, app móvil,
notificaciones y colaboración en tiempo real.
