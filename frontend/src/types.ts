export const STATUS = {
  PENDING: 0,
  IN_PROGRESS: 1,
  AT_RISK: 2,
  ACHIEVED: 3,
  NOT_ACHIEVED: 4,
} as const;

export type StatusValue = (typeof STATUS)[keyof typeof STATUS];

/** Mismo orden, etiquetas y pesos que el contrato y el backend. */
export const STATUS_META: Record<
  number,
  { label: string; weight: string; pill: string; dot: string; bar: string }
> = {
  0: {
    label: "Pendiente",
    weight: "0%",
    pill: "bg-slate-100 text-slate-600 ring-slate-200",
    dot: "bg-slate-400",
    bar: "bg-slate-300",
  },
  1: {
    label: "En progreso",
    weight: "50%",
    pill: "bg-sky-50 text-sky-700 ring-sky-200",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
  },
  2: {
    label: "En riesgo",
    weight: "25%",
    pill: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  3: {
    label: "Alcanzado",
    weight: "100%",
    pill: "bg-brand-50 text-brand-700 ring-brand-100",
    dot: "bg-brand-500",
    bar: "bg-brand-500",
  },
  4: {
    label: "No alcanzado",
    weight: "0%",
    pill: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
  },
};

export interface DocumentOut {
  id: string;
  filename: string;
  size_bytes: number;
  keccak256: string;
  sha256: string;
  uploaded_at: string;
}

export interface EvidenceFile {
  id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  keccak256: string;
  position: number;
  url: string;
}

export interface MilestoneUpdateOut {
  id: string;
  previous_status: number | null;
  status: number;
  note: string | null;
  evidence_hash: string;
  created_at: string;
  chain_tx_hash: string | null;
  files: EvidenceFile[];
}

export interface Milestone {
  id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  status: number;
  status_label: string;
  order_index: number;
  title_hash: string;
  chain_index: number | null;
  chain_status: number | null;
  updated_at: string;
  updates: MilestoneUpdateOut[];
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  chain_project_id: string | null;
  chain_tx_hash: string | null;
  chain_registered_at: string | null;
  document: DocumentOut | null;
  milestone_count: number;
  progress_bps: number;
  progress_percent: number;
}

export interface Report {
  id: string;
  version: number;
  progress_bps: number;
  keccak256: string;
  created_at: string;
  chain_tx_hash: string | null;
}

export interface Summary {
  project_id: string;
  project_name: string;
  progress_bps: number;
  progress_percent: number;
  milestone_count: number;
  breakdown: Record<string, number>;
  sections: Record<string, Milestone[]>;
  document: DocumentOut | null;
  latest_report: Report | null;
}

export interface ChainStatus {
  enabled: boolean;
  network: string;
  error: string | null;
  address: string | null;
  chain_id: number | null;
  account?: string;
  connected?: boolean;
  block_number?: number;
  balance_eth?: number;
  project_count?: number;
}

export interface ChainView {
  anclado: boolean;
  detalle?: string;
  contrato?: string;
  red?: string;
  explorer?: string;
  proyecto?: {
    owner: string;
    doc_hash: string;
    report_hash: string;
    created_at: number;
    report_registered_at: number;
    report_version: number;
  };
  hitos?: Array<{
    index: number;
    title_hash: string;
    evidence_hash: string;
    due_date: number;
    updated_at: number;
    status: number;
    estado: string;
  }>;
  progress_bps_onchain?: number;
  progress_bps_local?: number;
  coinciden?: boolean;
}

export interface SyncResult {
  project_id: string;
  chain_project_id: string;
  acciones: Array<{
    accion: string;
    tx_hash: string;
    block_number: number;
    gas_used: number;
    explorer_url: string | null;
  }>;
  sin_cambios: boolean;
  progress_bps_onchain: number;
}

export interface Verification {
  matches: boolean;
  computed_hash: string;
  registered_hash: string | null;
  kind: string;
  detail: string;
  milestone_name?: string | null;
  filename?: string | null;
}
