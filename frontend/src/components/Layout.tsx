import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { api } from "../api";
import type { ChainStatus } from "../types";

/** Indicador de red siempre visible: sin cadena, la app pierde su razon de ser. */
function ChainBadge() {
  const [status, setStatus] = useState<ChainStatus | null>(null);

  useEffect(() => {
    api.chainStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status) {
    return <span className="hash">conectando…</span>;
  }

  const live = status.enabled && status.connected;
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-brand-500" : "bg-rose-500"}`} />
        {live ? status.network : "sin conexion"}
      </span>
      {live && status.address && (
        <a
          href={`https://sepolia.etherscan.io/address/${status.address}`}
          target="_blank"
          rel="noreferrer"
          className="hash hidden hover:text-brand-600 hover:underline sm:inline"
        >
          {status.address.slice(0, 8)}…{status.address.slice(-6)}
        </a>
      )}
      {live && status.balance_eth !== undefined && (
        <span className="hidden text-xs tabular-nums text-slate-400 md:inline">
          {status.balance_eth.toFixed(4)} ETH
        </span>
      )}
    </div>
  );
}

function ProjectTabs() {
  const { id } = useParams();
  if (!id) return null;

  const tabs = [
    { to: `/projects/${id}`, label: "Resumen", end: true },
    { to: `/projects/${id}/milestones`, label: "Hitos" },
    { to: `/projects/${id}/report`, label: "Reporte y verificacion" },
  ];

  return (
    <nav className="flex gap-1 border-b border-slate-200 px-6">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `-mb-px border-b-2 px-3 py-3 text-sm font-medium transition ${
              isActive
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const { id } = useParams();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 3l7 4v5c0 4.5-3 8.3-7 9-4-0.7-7-4.5-7-9V7l7-4z" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-slate-900 group-hover:text-brand-700">
              Milestone Verification
            </span>
          </Link>
          <ChainBadge />
        </div>
        {id && <ProjectTabs />}
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-slate-400">
        Los documentos permanecen en este servidor. A Ethereum solo suben hashes.
      </footer>
    </div>
  );
}
