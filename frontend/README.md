# Frontend — Milestone Verification

React 19 + TypeScript + Vite + Tailwind 4. Cuatro vistas sobre la API de FastAPI.

## Correr

El backend debe estar arriba en el puerto 8000:

```bash
cd ../backend && venv/bin/uvicorn app.main:app --reload
```

```bash
npm install && npm run dev
```

Abre http://localhost:5173. Vite hace proxy de `/api` hacia `http://127.0.0.1:8000`,
así que el navegador nunca cruza orígenes y no dependemos de CORS.

```bash
npm run build     # tsc -b + vite build
```

## Vistas

| Ruta | Qué hace |
|---|---|
| `/` | Lista de proyectos con progreso y si están anclados |
| `/projects/:id` | Resumen: anillo de progreso, tarjeta de Ethereum, documento, hitos |
| `/projects/:id/milestones` | Crear hitos, cambiar estado con nota y **fotos de evidencia**, galería e historial |
| `/projects/:id/report` | Secciones del reporte, versiones, anclaje y verificación de archivos |

## Decisiones de diseño

- **La cadena siempre visible.** El header muestra red, contrato y saldo en vivo. Si la
  conexión cae, el punto se pone rojo: sin cadena la app pierde su razón de ser y el
  usuario debe notarlo antes de intentar anclar algo.
- **Los hashes son ciudadanos de primera.** Truncados a `0xabc…1234`, en monoespaciado,
  con botón de copiar y link a Etherscan cuando corresponde. Son la evidencia del
  sistema, no un detalle técnico que esconder.
- **Local y cadena se distinguen siempre.** Cada hito muestra `on-chain #n` o `sin anclar`,
  y si su estado local difiere del anclado aparece "cambio sin anclar" en ámbar. El mismo
  aviso sale a nivel de proyecto cuando los porcentajes divergen.
- **Anclar es un acto deliberado.** Un botón explícito, con su texto cambiando a
  "Enviando transacciones…", porque puede tardar minutos y gasta ETH real.
- **Barra segmentada además del porcentaje.** Un bloque por hito, coloreado por estado:
  62.5% no dice si son cuatro hitos medio hechos o dos perfectos y dos sin empezar.
- **Las fotos se ven, no se listan.** La evidencia aparece como miniaturas en el historial
  del hito; al pasar el cursor se ve el nombre y su hash, y al hacer clic se abre en grande.
  Una obra se revisa mirando fotos, no leyendo nombres de archivo.
- **Colores con significado fijo:** verde alcanzado, azul en progreso, ámbar en riesgo,
  gris pendiente, rojo no alcanzado. Los mismos en pills, barras y gráficos.
