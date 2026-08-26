# Backend — Milestone Verification API

FastAPI + SQLite. Guarda proyectos, documentos, hitos y reportes; calcula el progreso
y ancla hashes en el contrato `MilestoneRegistry` desplegado en Sepolia.

Los PDFs y las notas **nunca** salen de aquí. A la cadena solo suben hashes.

## Correr

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python -m uvicorn app.main:app --reload
```

> Usa `python -m uvicorn`, no `venv/bin/uvicorn`. Los ejecutables del venv llevan la
> ruta absoluta grabada en su shebang: si mueves o renombras la carpeta del proyecto,
> dejan de funcionar con `bad interpreter`. Invocarlos como módulo es inmune a eso.
> Si ya te pasó, recrea el venv: `rm -rf venv && python3 -m venv venv && venv/bin/pip install -r requirements.txt`

Documentación interactiva en http://127.0.0.1:8000/docs — desde ahí se puede probar
todo el flujo sin frontend.

```bash
venv/bin/python -m pytest tests -q    # 22 tests
```

## Configuración

No necesita `.env` propio: lee `contracts/.env` para el RPC y la llave, y
`contracts/deployments/sepolia.json` para la dirección y el ABI. Variables opcionales:

| Variable | Default |
|---|---|
| `DATABASE_URL` | `sqlite:///backend/app.db` |
| `STORAGE_DIR` | `backend/storage` |
| `CHAIN_NETWORK` | `sepolia` |
| `MAX_UPLOAD_BYTES` | 20 MB |

Si falta el despliegue o la llave, la API arranca igual y solo fallan los endpoints
de blockchain con 503. Eso permite desarrollar sin red y sin gastar ETH.

## Flujo

```
POST /projects                      crear proyecto (deriva chain_project_id)
POST /projects/{id}/document        subir PDF -> keccak256 + sha256
POST /projects/{id}/milestones      registrar hitos (nacen en Pendiente)
PATCH .../milestones/{mid}          cambiar estado + nota (queda en historial)
POST .../milestones/{mid}/updates   cambiar estado + nota + FOTOS de evidencia
GET  .../milestones/{mid}/evidence/{fid}  descargar una foto
GET  /projects/{id}/summary         progreso y hitos por sección
POST /projects/{id}/reports         generar reporte HTML + su hash
POST /projects/{id}/chain/sync      anclar proyecto, hitos y estados pendientes
POST /projects/{id}/chain/report    anclar el hash del último reporte
GET  /projects/{id}/chain           leer la cadena y comparar con lo local
POST /projects/{id}/verify/document subir un archivo y verificar contra la cadena
POST /projects/{id}/verify/evidence subir una foto y verificar que este anclada
GET  /chain/status                  diagnóstico: red, saldo, bloque, contrato
```

## Evidencia fotográfica

Un hito como "Cocina terminada" puede llevar fotos como prueba. Las imágenes se guardan
en `storage/evidence/`; a la cadena sube **un solo `bytes32`** que las resume junto con la
nota:

```
bundle = keccak256( keccak256(nota) || hash_foto_1 || … || hash_foto_n )
```

Con las fotos en el orden en que se subieron. Cualquiera que tenga la nota y las fotos
puede recalcular ese valor y compararlo con el anclado — que es lo que hace
`POST /verify/evidence`: busca la foto por su hash y comprueba que su paquete sea el que
el contrato tiene registrado para ese hito.

Retocar una foto cambia su hash y rompe el bundle. Reemplazarla después del anclaje
también: la foto aparece, pero el paquete ya no coincide.

Subir fotos **sin** cambiar el estado también cuenta como cambio, porque el `evidenceHash`
es distinto y el contrato lo acepta.

## Decisiones

- **El anclaje es explícito, no automático.** Editar un hito solo toca SQLite; subirlo
  a la cadena es una llamada aparte. Así una sesión de trabajo no dispara veinte
  transacciones, y el usuario decide cuándo gastar gas.
- **`chain/sync` es idempotente.** Compara `chain_status` contra `status` y `chain_index`
  contra NULL para saber qué falta. Correrlo dos veces seguidas no envía nada.
- **El progreso se calcula en dos lados a propósito.** `app/progress.py` es un espejo
  exacto de `MilestoneRegistry.sol`, división entera incluida; `GET /projects/{id}/chain`
  compara ambos y devuelve `coinciden: false` si alguien editó la base sin re-anclar.
- **El hash del reporte es el del archivo en disco**, no el de una representación
  intermedia. Verificar significa volver a leer ese archivo y comparar.
- **El `chain_project_id` es `keccak256(uuid)`**, no un contador. No se puede adivinar
  ni enumerar, aunque el contrato sea público y sin permisos globales.
