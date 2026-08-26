# MilestoneRegistry — capa de verificación en Ethereum

Contrato único del MVP *Ethereum-Based Milestone Verification and Document Analysis System*.
Guarda **solo datos pequeños y de tamaño fijo**: hashes de documentos, hitos y sus estados.
Los PDFs, las descripciones y las notas de evidencia viven en el backend; a la cadena solo
sube su huella digital.

## Uso rápido

```bash
npm install
npm test            # 21 tests
npm run demo        # flujo completo en un nodo efímero
```

Para trabajar contra un nodo local persistente (dos terminales):

```bash
npm run node
```

```bash
npm run deploy:local && npm run demo:local
```

## Desplegar en Sepolia

1. `npm run wallet:new` — genera una wallet desechable y la guarda en `.env`. Imprime
   solo la dirección pública; la llave privada nunca se muestra. No necesitas MetaMask.
   (Si prefieres usar una wallet tuya, pon su llave privada en `.env` a mano.)
2. Pide ETH en un faucet de Sepolia (ver abajo) para la dirección que te imprimió.
3. `SEPOLIA_RPC_URL` es opcional: si la dejas vacía se usa un RPC público.
4. `npm run check:sepolia` — valida .env, conexión, chainId, saldo y estima el costo. No envía nada.
5. `npm run deploy:sepolia` — despliega y escribe `deployments/sepolia.json`.
6. `npm run demo:sepolia` — opcional, corre el flujo completo con transacciones reales
   e imprime los links a Etherscan.

Faucets: [Google Cloud Web3](https://cloud.google.com/application/web3/faucet/ethereum/sepolia),
[pk910 PoW faucet](https://sepolia-faucet.pk910.de/) (no pide cuenta, mina en el navegador).

Para verificar el código en Etherscan añade `ETHERSCAN_API_KEY` al `.env` y corre
`npm run verify:sepolia -- <direccion>` (el contrato no tiene argumentos de constructor).

> `.env` está en `.gitignore`. Nunca subas la llave privada al repo ni la pegues en un chat.

Cada despliegue escribe `deployments/<red>.json` con la dirección, el chainId y el ABI —
ese es el archivo que el backend lee para conectarse.

## Estados y progreso

El enum `Status` sigue el orden de la propuesta y los pesos se calculan **on-chain** en
basis points (10000 = 100%), sin decimales:

| Enum | Estado | Peso |
|---|---|---|
| `0 Pending` | Pendiente | 0 |
| `1 InProgress` | En progreso | 5000 |
| `2 AtRisk` | En riesgo | 2500 |
| `3 Achieved` | Alcanzado | 10000 |
| `4 NotAchieved` | No alcanzado | 0 |

`progressBps(projectId)` = suma de pesos / número de hitos. El ejemplo del documento
(Alcanzado, Alcanzado, En progreso, Pendiente) devuelve `6250`, es decir 62.5% — está
cubierto por un test. Como el cálculo también existe en la cadena, el porcentaje del
reporte es verificable por un tercero sin confiar en el backend.

## Convención de hashes (backend ↔ contrato)

El contrato solo ve `bytes32`. Para que la verificación funcione, el backend debe generar
las huellas **siempre igual**:

| Campo | Cómo se calcula |
|---|---|
| `projectId` | `keccak256(utf8(uuid_del_proyecto))` |
| `docHash` | `keccak256(bytes_del_PDF)` |
| `titleHash` | `keccak256(utf8(nombre + "\n" + descripción))` |
| `evidenceHash` | `keccak256(utf8(texto_de_la_nota))`, o `0x00..00` si no hay nota |
| `reportHash` | `keccak256(bytes_del_reporte_generado)` |

En Python: `Web3.keccak(...)` o `eth_utils.keccak(...)`.

## API del contrato

**Escritura** (solo el `owner` del proyecto, es decir la wallet del backend):

- `registerProject(bytes32 projectId, bytes32 docHash)` — ancla el documento original. Es irrepetible e inmutable.
- `addMilestone(bytes32 projectId, bytes32 titleHash, uint64 dueDate) → uint32 index` — nace en `Pending`. `dueDate = 0` si no hay fecha.
- `addMilestones(bytes32 projectId, bytes32[] titleHashes, uint64[] dueDates)` — carga inicial en una sola transacción.
- `updateMilestoneStatus(bytes32 projectId, uint32 index, Status newStatus, bytes32 evidenceHash)` — rechaza actualizaciones que no cambian nada.
- `registerReport(bytes32 projectId, bytes32 reportHash)` — se puede volver a llamar; cada llamada sube `reportVersion` y deja el histórico en los eventos.

**Lectura** (gratis, sin transacción):

- `progressBps`, `statusWeightBps`, `statusBreakdown` (conteo por estado, para las secciones del reporte)
- `getProject`, `getMilestone`, `getMilestones`, `milestoneCount`, `projectCount`, `projectIdAt`
- `verifyDocument(projectId, candidateHash) → bool` y `verifyReport(projectId, candidateHash) → bool`

**Eventos** — la bitácora de trazabilidad que se muestra en el frontend:
`ProjectRegistered`, `MilestoneAdded`, `MilestoneStatusChanged`, `ReportRegistered`.

## Decisiones de diseño

- **Un solo contrato multi-proyecto.** Se despliega una vez y todos los proyectos viven adentro, indexados por `bytes32`. Evita el costo y la complejidad de un factory.
- **Wallet única del backend.** El campo `owner` se guarda por proyecto (no global), así que migrar a firma con MetaMask más adelante no requiere cambiar el modelo de datos, solo quién manda la transacción.
- **Títulos hasheados, no en texto plano.** Tamaño fijo, gas predecible y el contenido del documento no queda público en una cadena.
- **`docHash` inmutable.** Volver a anclar un documento distinto obligaría a crear otro proyecto: eso es justamente lo que hace útil la verificación.
- **Errores personalizados** (`ProjectNotFound`, `NotProjectOwner`, …) en vez de `require` con strings: menos gas y mensajes que el backend puede mapear a códigos HTTP.
