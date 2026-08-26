import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import {
  Alert,
  Button,
  EmptyState,
  Hash,
  ProgressRing,
  SegmentedBar,
  Skeleton,
  StatusPill,
} from "../components/ui";
import type { ChainView, Project, Summary } from "../types";

export function ProjectDetail() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chain, setChain] = useState<ChainView | null>(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api.getProject(id), api.summary(id)]);
      setProject(p);
      setSummary(s);
      api.chainView(id).then(setChain).catch(() => setChain(null));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File) {
    setError("");
    try {
      await api.uploadDocument(id, file);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function sync() {
    setSyncing(true);
    setError("");
    setSyncMsg("");
    try {
      const result = await api.sync(id);
      setSyncMsg(
        result.sin_cambios
          ? "Todo estaba anclado: no se envio ninguna transaccion."
          : `${result.acciones.length} transacciones enviadas. Progreso on-chain: ${result.progress_bps_onchain / 100}%`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  if (!project || !summary) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  const statuses = Object.values(summary.sections).flat().map((m) => m.status);
  const desincronizado = chain?.anclado && chain.coinciden === false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{project.name}</h1>
        {project.description && <p className="mt-1 text-sm text-slate-500">{project.description}</p>}
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {syncMsg && <Alert kind="success">{syncMsg}</Alert>}
      {desincronizado && (
        <Alert kind="warning">
          La cadena dice {(chain!.progress_bps_onchain! / 100).toFixed(2)}% y la base local{" "}
          {(chain!.progress_bps_local! / 100).toFixed(2)}%. Hay cambios sin anclar.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card flex items-center gap-6 p-6 lg:col-span-2">
          <ProgressRing bps={summary.progress_bps} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {Object.entries(summary.breakdown)
                .filter(([, count]) => count > 0)
                .map(([label, count]) => (
                  <span key={label} className="text-slate-600">
                    <span className="font-semibold tabular-nums text-slate-900">{count}</span> {label.toLowerCase()}
                  </span>
                ))}
            </div>
            <SegmentedBar statuses={statuses} />
            <p className="text-xs text-slate-400">
              {summary.milestone_count} hitos · pesos fijos: alcanzado 100%, en progreso 50%, en riesgo 25%
            </p>
          </div>
        </div>

        <ChainCard project={project} chain={chain} syncing={syncing} onSync={sync} />
      </div>

      <DocumentCard project={project} onUpload={upload} />

      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Hitos</h2>
          <Link to={`/projects/${id}/milestones`} className="text-sm font-medium text-brand-600 hover:underline">
            Gestionar →
          </Link>
        </div>
        {summary.milestone_count === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Sin hitos todavia"
              description="Registra los compromisos que aparecen en el documento."
              action={
                <Link to={`/projects/${id}/milestones`}>
                  <Button>Agregar hitos</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {Object.values(summary.sections)
              .flat()
              .sort((a, b) => a.order_index - b.order_index)
              .map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{m.name}</p>
                    <Hash value={m.title_hash} label="titleHash" />
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {m.chain_index !== null && (
                      <span className="hash">#{m.chain_index}</span>
                    )}
                    <StatusPill status={m.status} size="xs" />
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChainCard({
  project,
  chain,
  syncing,
  onSync,
}: {
  project: Project;
  chain: ChainView | null;
  syncing: boolean;
  onSync: () => void;
}) {
  const anclado = chain?.anclado;
  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Ethereum</h2>
        {anclado ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-[0.68rem] font-medium text-brand-700 ring-1 ring-brand-100 ring-inset">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            anclado
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-medium text-slate-500">
            sin anclar
          </span>
        )}
      </div>

      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-400">projectId</dt>
          <dd>
            <Hash value={project.chain_project_id} />
          </dd>
        </div>
        {chain?.contrato && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">contrato</dt>
            <dd>
              <Hash value={chain.contrato} href={chain.explorer} />
            </dd>
          </div>
        )}
        {project.chain_tx_hash && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">registro</dt>
            <dd>
              <Hash
                value={project.chain_tx_hash}
                href={`https://sepolia.etherscan.io/tx/${project.chain_tx_hash}`}
              />
            </dd>
          </div>
        )}
        {anclado && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">progreso on-chain</dt>
            <dd className="font-medium tabular-nums text-slate-700">
              {(chain!.progress_bps_onchain! / 100).toFixed(2)}%
            </dd>
          </div>
        )}
      </dl>

      <Button onClick={onSync} loading={syncing} className="w-full" variant={anclado ? "secondary" : "primary"}>
        {syncing ? "Enviando transacciones…" : anclado ? "Sincronizar cambios" : "Anclar en Ethereum"}
      </Button>
      <p className="text-[0.7rem] leading-relaxed text-slate-400">
        Sube solo lo que falte. Cada cambio de estado es una transaccion con su propio evento.
      </p>
    </div>
  );
}

function DocumentCard({ project, onUpload }: { project: Project; onUpload: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const doc = project.document;

  if (doc) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
              <path d="M14 2v6h6" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{doc.filename}</p>
            <p className="text-xs text-slate-400">{(doc.size_bytes / 1024).toFixed(0)} KB · inmutable</p>
          </div>
        </div>
        <div className="space-y-1">
          <Hash value={doc.keccak256} label="keccak256" />
          <br />
          <Hash value={doc.sha256} label="sha256" />
        </div>
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onUpload(file);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
        dragging ? "border-brand-400 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-300"
      }`}
    >
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
      />
      <span className="text-sm font-medium text-slate-700">Arrastra el documento del proyecto</span>
      <span className="mt-1 text-xs text-slate-400">
        PDF. Se calcula su hash y se queda en este servidor; solo el hash va a la cadena.
      </span>
    </label>
  );
}
