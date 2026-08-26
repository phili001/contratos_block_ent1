import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Alert, Button, EmptyState, Field, inputClass, Skeleton } from "../components/ui";
import type { Project } from "../types";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.createProject(name, description);
      setName("");
      setDescription("");
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Proyectos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada proyecto ancla su documento y sus hitos en Ethereum.
          </p>
        </div>
        <Button onClick={() => setOpen((v) => !v)} variant={open ? "secondary" : "primary"}>
          {open ? "Cancelar" : "Nuevo proyecto"}
        </Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {open && (
        <form onSubmit={create} className="card space-y-4 p-5">
          <Field label="Nombre">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sistema de verificacion de hitos"
              required
              autoFocus
            />
          </Field>
          <Field label="Descripcion" hint="Opcional. No se sube a la cadena.">
            <textarea
              className={inputClass}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={saving}>
            Crear proyecto
          </Button>
        </form>
      )}

      {projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="Todavia no hay proyectos"
          description="Crea uno, sube su documento y registra los hitos que promete."
          action={<Button onClick={() => setOpen(true)}>Crear el primero</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const anclado = Boolean(project.chain_tx_hash);
  return (
    <Link
      to={`/projects/${project.id}`}
      className="card group flex flex-col justify-between p-5 transition hover:border-brand-300 hover:shadow-md"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-slate-900 group-hover:text-brand-700">{project.name}</h2>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-medium ring-1 ring-inset ${
              anclado ? "bg-brand-50 text-brand-700 ring-brand-100" : "bg-slate-100 text-slate-500 ring-slate-200"
            }`}
          >
            {anclado ? "en cadena" : "solo local"}
          </span>
        </div>
        {project.description && (
          <p className="mt-1.5 line-clamp-2 text-sm text-slate-500">{project.description}</p>
        )}
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold tabular-nums text-slate-900">
            {project.progress_percent.toFixed(2)}%
          </span>
          <span className="text-xs text-slate-400">
            {project.milestone_count} {project.milestone_count === 1 ? "hito" : "hitos"}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-700"
            style={{ width: `${project.progress_percent}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
