import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Alert, Button, EmptyState, Field, Hash, inputClass, Skeleton, StatusPill } from "../components/ui";
import { STATUS_META, type EvidenceFile, type Milestone } from "../types";

const ESTADOS = [3, 1, 2, 0, 4]; // orden util: lo mas frecuente primero

export function MilestonesPage() {
  const { id = "" } = useParams();
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(
    () =>
      api
        .listMilestones(id)
        .then(setMilestones)
        .catch((e) => setError(e.message)),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hitos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Los compromisos que aparecen en el documento, con su estado y evidencia.
          </p>
        </div>
        <Button onClick={() => setOpen((v) => !v)} variant={open ? "secondary" : "primary"}>
          {open ? "Cancelar" : "Nuevo hito"}
        </Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {open && (
        <NewMilestoneForm
          projectId={id}
          onCreated={() => {
            setOpen(false);
            load();
          }}
          onError={setError}
        />
      )}

      {milestones === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : milestones.length === 0 ? (
        <EmptyState
          title="Sin hitos"
          description="Lee el documento y registra cada compromiso como un hito."
          action={<Button onClick={() => setOpen(true)}>Agregar el primero</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {milestones.map((m) => (
            <MilestoneRow key={m.id} projectId={id} milestone={m} onChanged={load} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewMilestoneForm({
  projectId,
  onCreated,
  onError,
}: {
  projectId: string;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createMilestone(projectId, name, description, dueDate);
      onCreated();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Nombre del hito">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Construir el backend basico"
              required
              autoFocus
            />
          </Field>
        </div>
        <Field label="Fecha objetivo" hint="Opcional">
          <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Descripcion" hint="Se combina con el nombre para calcular el titleHash que se ancla.">
        <textarea
          className={inputClass}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Button type="submit" loading={saving}>
        Crear hito
      </Button>
    </form>
  );
}

function MilestoneRow({
  projectId,
  milestone,
  onChanged,
  onError,
}: {
  projectId: string;
  milestone: Milestone;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(milestone.status);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  const desincronizado = milestone.chain_index !== null && milestone.chain_status !== milestone.status;
  const fotos = milestone.updates.reduce((total, u) => total + u.files.length, 0);

  async function save() {
    setSaving(true);
    try {
      if (photos.length > 0) {
        await api.updateWithEvidence(projectId, milestone.id, status, note, photos);
      } else {
        await api.updateStatus(projectId, milestone.id, status, note);
      }
      setNote("");
      setPhotos([]);
      setEditing(false);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-slate-300">
              {String(milestone.order_index + 1).padStart(2, "0")}
            </span>
            <h3 className="font-medium text-slate-900">{milestone.name}</h3>
          </div>
          {milestone.description && <p className="mt-1 text-sm text-slate-500">{milestone.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Hash value={milestone.title_hash} label="titleHash" />
            {milestone.due_date && <span className="text-xs text-slate-400">vence {milestone.due_date}</span>}
            {milestone.chain_index !== null ? (
              <span className="text-xs text-brand-600">on-chain #{milestone.chain_index}</span>
            ) : (
              <span className="text-xs text-slate-400">sin anclar</span>
            )}
            {fotos > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" strokeLinejoin="round" />
                </svg>
                {fotos} {fotos === 1 ? "foto" : "fotos"}
              </span>
            )}
            {desincronizado && <span className="text-xs font-medium text-amber-600">cambio sin anclar</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={milestone.status} />
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cerrar" : "Cambiar"}
          </Button>
        </div>
      </div>

      {editing && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-5">
          <div>
            <span className="label mb-2 block">Nuevo estado</span>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${
                    status === value
                      ? `${STATUS_META[value].pill} ring-2`
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {STATUS_META[value].label}
                  <span className="ml-1.5 text-[0.65rem] opacity-60">{STATUS_META[value].weight}</span>
                </button>
              ))}
            </div>
          </div>
          <Field label="Nota" hint="Se guarda aqui; a la cadena sube solo su hash.">
            <textarea
              className={inputClass}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cocina terminada, faltan detalles de pintura"
            />
          </Field>

          <PhotoPicker photos={photos} onChange={setPhotos} />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} loading={saving}>
              {photos.length > 0 ? `Guardar con ${photos.length} ${photos.length === 1 ? "foto" : "fotos"}` : "Guardar cambio"}
            </Button>
            <span className="text-xs text-slate-400">Solo local. Anclalo despues desde Resumen.</span>
          </div>
        </div>
      )}

      {milestone.updates.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs font-medium text-slate-500 hover:text-brand-600"
          >
            {showHistory ? "Ocultar" : "Ver"} historial ({milestone.updates.length})
          </button>
          {showHistory && (
            <ul className="mt-3 space-y-2.5">
              {milestone.updates.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-2 text-xs">
                  {u.previous_status !== null && (
                    <>
                      <StatusPill status={u.previous_status} size="xs" />
                      <span className="text-slate-300">→</span>
                    </>
                  )}
                  <StatusPill status={u.status} size="xs" />
                  {u.note && <span className="text-slate-600">{u.note}</span>}
                  <Hash
                    value={u.chain_tx_hash}
                    href={u.chain_tx_hash ? `https://sepolia.etherscan.io/tx/${u.chain_tx_hash}` : undefined}
                  />
                  <span className="text-slate-300">{new Date(u.created_at).toLocaleString()}</span>
                  {u.files.length > 0 && <EvidenceGallery files={u.files} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** Selector de fotos con vista previa antes de subirlas. */
function PhotoPicker({ photos, onChange }: { photos: File[]; onChange: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);

  const add = (incoming: FileList | null) => {
    if (!incoming) return;
    onChange([...photos, ...Array.from(incoming)].slice(0, 10));
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">Fotos de evidencia</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-3 transition ${
          dragging ? "border-brand-400 bg-brand-50" : "border-slate-300 bg-white"
        }`}
      >
        {photos.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {photos.map((file, i) => (
              <li key={`${file.name}-${i}`} className="group relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200"
                />
                <button
                  type="button"
                  onClick={() => onChange(photos.filter((_, index) => index !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white opacity-0 transition group-hover:opacity-100"
                  title="Quitar"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md py-2 text-sm text-slate-500 hover:text-brand-600">
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => add(e.target.files)}
          />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" strokeLinejoin="round" />
          </svg>
          {photos.length === 0 ? "Arrastra fotos o haz clic para elegirlas" : "Agregar mas"}
        </label>
      </div>
      <span className="mt-1 block text-xs text-slate-400">
        Las fotos se guardan en este servidor. A la cadena sube un solo hash que resume la nota y las fotos en orden.
      </span>
    </div>
  );
}

/** Miniaturas de la evidencia ya subida, con su hash al pasar el cursor. */
function EvidenceGallery({ files }: { files: EvidenceFile[] }) {
  return (
    <ul className="mt-1.5 flex w-full flex-wrap gap-1.5">
      {files.map((file) => {
        const esImagen = (file.content_type ?? "").startsWith("image/");
        return (
          <li key={file.id}>
            <a
              href={api.evidenceUrl(file.url)}
              target="_blank"
              rel="noreferrer"
              title={`${file.filename}\n${file.keccak256}`}
              className="block"
            >
              {esImagen ? (
                <img
                  src={api.evidenceUrl(file.url)}
                  alt={file.filename}
                  className="h-16 w-16 rounded-md object-cover ring-1 ring-slate-200 transition hover:ring-2 hover:ring-brand-400"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-md bg-slate-100 text-[0.6rem] text-slate-500 ring-1 ring-slate-200">
                  {file.filename.split(".").pop()?.toUpperCase()}
                </span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
