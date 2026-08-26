import type {
  ChainStatus,
  ChainView,
  Milestone,
  Project,
  Report,
  Summary,
  SyncResult,
  Verification,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  listProjects: () => request<Project[]>("/projects"),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (name: string, description: string) =>
    request<Project>("/projects", json({ name, description: description || null })),

  uploadDocument: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Project["document"]>(`/projects/${id}/document`, { method: "POST", body: form });
  },

  summary: (id: string) => request<Summary>(`/projects/${id}/summary`),

  listMilestones: (id: string) => request<Milestone[]>(`/projects/${id}/milestones`),
  createMilestone: (id: string, name: string, description: string, dueDate: string) =>
    request<Milestone>(
      `/projects/${id}/milestones`,
      json({ name, description: description || null, due_date: dueDate || null }),
    ),
  updateStatus: (id: string, milestoneId: string, status: number, note: string) =>
    request<Milestone>(`/projects/${id}/milestones/${milestoneId}`, {
      ...json({ status, note: note || null }),
      method: "PATCH",
    }),

  /** Cambio de estado con fotos adjuntas como prueba. */
  updateWithEvidence: (id: string, milestoneId: string, status: number, note: string, files: File[]) => {
    const form = new FormData();
    form.append("status", String(status));
    if (note) form.append("note", note);
    files.forEach((file) => form.append("files", file));
    return request<Milestone>(`/projects/${id}/milestones/${milestoneId}/updates`, {
      method: "POST",
      body: form,
    });
  },

  evidenceUrl: (url: string) => `${BASE}${url}`,
  history: (id: string, milestoneId: string) =>
    request<Milestone["updates"]>(`/projects/${id}/milestones/${milestoneId}/history`),

  listReports: (id: string) => request<Report[]>(`/projects/${id}/reports`),
  generateReport: (id: string) => request<Report>(`/projects/${id}/reports`, { method: "POST" }),
  reportUrl: (id: string) => `${BASE}/projects/${id}/reports/latest/html`,

  chainStatus: () => request<ChainStatus>("/chain/status"),
  chainView: (id: string) => request<ChainView>(`/projects/${id}/chain`),
  sync: (id: string) => request<SyncResult>(`/projects/${id}/chain/sync`, { method: "POST" }),
  anchorReport: (id: string) =>
    request<{ tx_hash: string; explorer_url: string | null }>(`/projects/${id}/chain/report`, {
      method: "POST",
    }),

  verify: (id: string, kind: "document" | "report" | "evidence", file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Verification>(`/projects/${id}/verify/${kind}`, { method: "POST", body: form });
  },
};
