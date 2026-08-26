import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Alert, Button, EmptyState, Hash, Skeleton, StatusPill } from "../components/ui";
import type { ChainView, Report, Summary, Verification } from "../types";

const SECTION_TITLES: Record<string, string> = {
  alcanzados: "Objetivos alcanzados",
  requieren_trabajo: "Requieren trabajo adicional",
  en_riesgo: "En riesgo",
  pendientes: "Pendientes",
};

export function ReportPage() {
  const { id = "" } = useParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [chain, setChain] = useState<ChainView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.summary(id), api.listReports(id)]);
      setSummary(s);
      setReports(r);
      api.chainView(id).then(setChain).catch(() => setChain(null));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy("generate");
    setError("");
    try {
      await api.generateReport(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function anchor() {
    setBusy("anchor");
    setError("");
    try {
      await api.anchorReport(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!summary) return <Skeleton className="h-64" />;

  const latest = reports.at(-1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reporte y verificacion</h1>
          <p className="mt-1 text-sm text-slate-500">
            Que se prometio, que se cumplio y que falta — con prueba de que nada fue alterado.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generate} loading={busy === "generate"} variant="secondary">
            Generar reporte
          </Button>
          {latest && !latest.chain_tx_hash && (
            <Button onClick={anchor} loading={busy === "anchor"}>
              Anclar hash
            </Button>
          )}
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card space-y-4 p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Estado actual</h2>
            <span className="text-3xl font-bold tabular-nums text-slate-900">
              {summary.progress_percent.toFixed(2)}%
            </span>
          </div>
          {Object.entries(summary.sections).map(([key, items]) => (
            <div key={key}>
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {SECTION_TITLES[key]}
                </h3>
                <span className="rounded-full bg-slate-100 px-1.5 text-[0.65rem] font-medium text-slate-500">
                  {items.length}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-slate-300">—</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700">{m.name}</span>
                      <StatusPill status={m.status} size="xs" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-5">
          <div className="card space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Reportes generados</h2>
            {reports.length === 0 ? (
              <p className="text-xs text-slate-400">Aun no has generado ninguno.</p>
            ) : (
              <ul className="space-y-2.5">
                {[...reports].reverse().map((r) => (
                  <li key={r.id} className="space-y-1 border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">v{r.version}</span>
                      <span className="text-xs tabular-nums text-slate-500">{(r.progress_bps / 100).toFixed(2)}%</span>
                    </div>
                    <Hash value={r.keccak256} label="hash" />
                    <div>
                      {r.chain_tx_hash ? (
                        <Hash
                          value={r.chain_tx_hash}
                          label="anclado"
                          href={`https://sepolia.etherscan.io/tx/${r.chain_tx_hash}`}
                        />
                      ) : (
                        <span className="text-[0.68rem] text-amber-600">sin anclar</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {latest && (
              <a href={api.reportUrl(id)} target="_blank" rel="noreferrer">
                <Button variant="secondary" className="w-full">
                  Abrir reporte v{latest.version}
                </Button>
              </a>
            )}
          </div>

          {chain?.anclado && (
            <div className="card space-y-2 p-5 text-xs">
              <h2 className="text-sm font-semibold text-slate-900">Segun la cadena</h2>
              <div className="flex justify-between">
                <span className="text-slate-400">progreso</span>
                <span className="font-medium tabular-nums text-slate-700">
                  {(chain.progress_bps_onchain! / 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">version del reporte</span>
                <span className="tabular-nums text-slate-700">{chain.proyecto?.report_version}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">docHash</span>
                <Hash value={chain.proyecto?.doc_hash} />
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">reportHash</span>
                <Hash value={chain.proyecto?.report_hash} />
              </div>
              {chain.coinciden === false && (
                <Alert kind="warning">El progreso local no coincide con el de la cadena.</Alert>
              )}
            </div>
          )}
        </div>
      </div>

      <VerifyCard projectId={id} anclado={Boolean(chain?.anclado)} />
    </div>
  );
}

function VerifyCard({ projectId, anclado }: { projectId: string; anclado: boolean }) {
  const [kind, setKind] = useState<"document" | "report" | "evidence">("document");
  const [result, setResult] = useState<Verification | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function verify(file: File) {
    setChecking(true);
    setError("");
    setResult(null);
    try {
      setResult(await api.verify(projectId, kind, file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  if (!anclado) {
    return (
      <EmptyState
        title="Verificacion no disponible"
        description="Primero ancla el proyecto en Ethereum: sin hash registrado no hay nada contra que comparar."
      />
    );
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Verificar un archivo</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Se recalcula su hash y se compara con el registrado en Ethereum. Para las fotos se
          comprueba ademas que pertenezcan al paquete de evidencia anclado del hito.
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {(["document", "report", "evidence"] as const).map((option) => (
            <button
              key={option}
              onClick={() => {
                setKind(option);
                setResult(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                kind === option ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {option === "document" ? "Documento" : option === "report" ? "Reporte" : "Foto de evidencia"}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-6 py-8 text-center transition hover:border-brand-300 hover:bg-brand-50/40">
        <input
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])}
        />
        <span className="text-sm text-slate-600">
          {checking
            ? "Calculando hash…"
            : kind === "evidence"
              ? "Selecciona una foto de evidencia para verificar"
              : `Selecciona el ${kind === "document" ? "documento" : "reporte"} a verificar`}
        </span>
      </label>

      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {result && (
        <div
          className={`mt-4 rounded-lg p-4 ring-1 ring-inset ${
            result.matches ? "bg-brand-50 ring-brand-200" : "bg-rose-50 ring-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-white ${
                result.matches ? "bg-brand-600" : "bg-rose-600"
              }`}
            >
              {result.matches ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <p className={`text-sm font-medium ${result.matches ? "text-brand-900" : "text-rose-900"}`}>
              {result.detail}
            </p>
          </div>
          {result.milestone_name && (
            <p className="mt-2 text-xs text-slate-600">
              Hito: <span className="font-medium">{result.milestone_name}</span>
              {result.filename && <span className="text-slate-400"> · {result.filename}</span>}
            </p>
          )}
          <dl className="mt-3 space-y-1">
            <div className="flex gap-2">
              <dt className="label w-28">calculado</dt>
              <dd>
                <Hash value={result.computed_hash} />
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="label w-28">registrado</dt>
              <dd>
                <Hash value={result.registered_hash} />
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
