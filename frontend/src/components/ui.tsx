import type { ReactNode } from "react";
import { STATUS_META } from "../types";

export function StatusPill({ status, size = "sm" }: { status: number; size?: "sm" | "xs" }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium ${meta.pill} ${
        size === "xs" ? "px-2 py-0.5 text-[0.68rem]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/** Barra segmentada: cada hito es un bloque coloreado por su estado. */
export function SegmentedBar({ statuses }: { statuses: number[] }) {
  if (statuses.length === 0) {
    return <div className="h-2 rounded-full bg-slate-200" />;
  }
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
      {statuses.map((s, i) => (
        <div key={i} className={`flex-1 ${STATUS_META[s].bar}`} title={STATUS_META[s].label} />
      ))}
    </div>
  );
}

export function ProgressRing({ bps, size = 120 }: { bps: number; size?: number }) {
  const pct = bps / 100;
  const stroke = size / 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className="stroke-brand-500 transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-slate-900">{pct.toFixed(2)}%</span>
        <span className="text-[0.65rem] uppercase tracking-wider text-slate-400">progreso</span>
      </div>
    </div>
  );
}

/** Hash largo con copiado. Los hashes son el corazon de la app: hay que poder tomarlos. */
export function Hash({ value, label, href }: { value?: string | null; label?: string; href?: string }) {
  if (!value) return <span className="hash">—</span>;
  const short = `${value.slice(0, 10)}…${value.slice(-8)}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      {label && <span className="label">{label}</span>}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="hash hover:text-brand-600 hover:underline">
          {short}
        </a>
      ) : (
        <code className="hash">{short}</code>
      )}
      <button
        onClick={() => navigator.clipboard.writeText(value)}
        title="Copiar"
        className="text-slate-300 transition hover:text-brand-500"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  loading,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/40",
    secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50",
    ghost: "text-slate-600 hover:bg-slate-100 disabled:opacity-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50",
  };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none";

export function Alert({ kind, children }: { kind: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const kinds = {
    error: "bg-rose-50 text-rose-800 ring-rose-200",
    success: "bg-brand-50 text-brand-900 ring-brand-100",
    info: "bg-sky-50 text-sky-800 ring-sky-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
  };
  return <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${kinds[kind]}`}>{children}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}
