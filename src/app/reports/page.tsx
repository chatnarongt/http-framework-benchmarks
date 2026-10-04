"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BarChart2, Calendar, Database, PlayCircle, StopCircle, Terminal, Trash2 } from "lucide-react";
import { statusTone } from "@/lib/status";

export default function ReportsListPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = async () => {
    try {
      const res = await fetch("/api/reports");
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStop = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("Are you sure you want to stop this running benchmark?")) return;
    try {
      await fetch(`/api/benchmarks/${id}/stop`, { method: "POST" });
      fetchRuns();
    } catch {}
  };

  const deleteRun = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("Are you sure you want to delete this benchmark report?")) return;
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
      setRuns(runs.filter((r) => r.id !== id));
    } catch {}
  };

  const [clearing, setClearing] = useState(false);

  const clearAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (runs.length === 0) return;
    if (
      !confirm(
        `Delete ALL ${runs.length} benchmark report${runs.length === 1 ? "" : "s"}? This stops anything still running and cannot be undone.`
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch("/api/reports", { method: "DELETE" });
      if (res.ok) {
        setRuns([]);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not clear reports.");
        fetchRuns();
      }
    } catch {
      fetchRuns();
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-400">Loading benchmark history...</div>;
  }

  // PENDING rows queue FIFO; the API returns newest-first so reverse for queue order.
  const queuedIds = runs
    .filter((r) => r.status === "PENDING")
    .slice()
    .reverse()
    .map((r) => r.id);
  const runningRun = runs.find((r) => r.status === "RUNNING");
  const activeRun = runningRun ?? runs.find((r) => r.status === "PENDING");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <BarChart2 className="w-7 h-7 text-sky-400" />
            <span>Benchmark Reports</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Historical benchmark executions and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeRun && (
            <Link
              href={`/benchmarks/${activeRun.id}`}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-sky-500/10 border border-sky-500/40 hover:bg-sky-500/20 text-sky-300 font-semibold text-xs rounded-lg transition-all shadow-sm"
              title={`View running benchmark: ${activeRun.repoName || activeRun.id}`}
            >
              <Activity className="w-4 h-4 text-sky-400 animate-pulse" />
              <span>
                {runningRun
                  ? `Running: ${runningRun.repoName || runningRun.id}`
                  : `Queued: ${activeRun.repoName || activeRun.id}`}
                {queuedIds.length > 0 && (
                  <span className="text-slate-400 font-normal">
                    {" "}· {queuedIds.length} queued
                  </span>
                )}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            <span>New Benchmark</span>
          </Link>
          <button
            type="button"
            onClick={clearAll}
            disabled={clearing || runs.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-dashed border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-semibold text-xs rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Delete every benchmark report, stopping anything still running"
          >
            <Trash2 className="w-4 h-4" />
            <span>{clearing ? "Clearing..." : "Clear All Reports"}</span>
          </button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-4">
          <div className="text-slate-400 text-sm">No benchmarks recorded yet.</div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 text-slate-950 font-bold text-xs rounded-lg"
          >
            Run Your First Benchmark
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-800">
            {runs.map((run) => {
              const isRunning = run.status === "RUNNING" || run.status === "PENDING";
              return (
                <div
                  key={run.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base font-bold text-white">
                        {run.repoName || run.id}
                      </span>
                      {run.repoName && (
                        <span className="text-xs font-mono text-slate-500">({run.id})</span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${statusTone(run.status)}`}
                      >
                        {run.status}
                      </span>
                      {run.status === "PENDING" && (
                        <span
                          className="text-[11px] font-mono text-slate-400 border border-slate-700 rounded px-2 py-0.5"
                          title="Position in the execution queue"
                        >
                          Queued #{queuedIds.indexOf(run.id) + 1}
                        </span>
                      )}
                      <span className="text-xs font-semibold px-2 py-0.5 bg-slate-800 text-sky-400 rounded uppercase">
                        {run.database}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-4 pt-1 font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                      <span>VUs: {run.vus}</span>
                      <span>Records: {run.totalRecords.toLocaleString()}</span>
                      <span>Results: {run._count?.results || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isRunning ? (
                      <>
                        <Link
                          href={`/benchmarks/${run.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow-sm"
                        >
                          <Activity className="w-3.5 h-3.5 animate-pulse" />
                          <span>View Live</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => handleStop(run.id, e)}
                          className="px-2.5 py-1.5 bg-transparent hover:bg-slate-800 border border-dashed border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                          title="Stop benchmark"
                        >
                          <StopCircle className="w-3.5 h-3.5 text-slate-400" />
                          <span>Stop</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/benchmarks/${run.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                          title="View benchmark execution logs"
                        >
                          <Terminal className="w-3.5 h-3.5 text-slate-400" />
                          <span>Logs</span>
                        </Link>
                        <Link
                          href={`/reports/${run.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                        >
                          <span>View Report</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </>
                    )}
                    <button
                      onClick={(e) => deleteRun(run.id, e)}
                      className="p-1.5 text-slate-500 hover:text-white rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
