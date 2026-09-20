"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, ChevronDown, StopCircle, Terminal, XCircle } from "lucide-react";

export default function BenchmarkLivePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [run, setRun] = useState<any>(null);
  const [logs, setLogs] = useState<string>("");
  const [status, setStatus] = useState<string>("PENDING");
  const [stopping, setStopping] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  const handleStop = async () => {
    if (!confirm("Are you sure you want to stop this running benchmark?")) return;
    setStopping(true);
    try {
      await fetch(`/api/benchmarks/${id}/stop`, { method: "POST" });
    } catch {
    } finally {
      setStopping(false);
    }
  };

  const hydratedRef = useRef(false);

  // Poll run status and results
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchRun = async () => {
      try {
        const res = await fetch(`/api/benchmarks/${id}`);
        if (res.ok) {
          const data = await res.json();
          setRun(data);
          setStatus(data.status);
          // Hydrate history once; after that the SSE stream owns the log state
          if (!hydratedRef.current && data.logs) {
            hydratedRef.current = true;
            setLogs(data.logs);
          }
        }
      } catch {}
    };

    fetchRun();
    interval = setInterval(fetchRun, 3000);
    return () => clearInterval(interval);
  }, [id]);

  // Connect SSE for streaming logs
  useEffect(() => {
    const es = new EventSource(`/api/benchmarks/${id}/events`);

    es.addEventListener("log", (e: MessageEvent) => {
      try {
        const text = JSON.parse(e.data);
        setLogs((prev) => prev + text);
      } catch {
        setLogs((prev) => prev + e.data);
      }
    });

    es.addEventListener("status", (e: MessageEvent) => {
      try {
        const st = JSON.parse(e.data);
        setStatus(st);
      } catch {
        setStatus(e.data);
      }
    });

    return () => {
      es.close();
    };
  }, [id]);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white font-mono">{run?.repoName || id}</h1>
            {run?.repoName && (
              <span className="text-xs font-mono text-slate-500">({id})</span>
            )}
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                status === "COMPLETED"
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : status === "FAILED"
                  ? "bg-rose-950 text-rose-400 border border-rose-800"
                  : status === "STOPPED"
                  ? "bg-amber-950 text-amber-400 border border-amber-800"
                  : "bg-sky-950 text-sky-400 border border-sky-800 animate-pulse"
              }`}
            >
              {status}
            </span>
          </div>
          {run && (
            <p className="text-xs text-slate-400 mt-2">
              Database: <span className="text-slate-200 font-mono">{run.database}</span> | VUs:{" "}
              <span className="text-slate-200 font-mono">{run.vus}</span> | Records:{" "}
              <span className="text-slate-200 font-mono">{run.totalRecords.toLocaleString()}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {(status === "RUNNING" || status === "PENDING") && (
            <button
              type="button"
              onClick={handleStop}
              disabled={stopping}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 font-bold text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              <StopCircle className="w-4 h-4 text-rose-400" />
              <span>{stopping ? "Stopping..." : "Stop Benchmark"}</span>
            </button>
          )}
          {status === "COMPLETED" && (
            <Link
              href={`/reports/${id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-lg transition-colors"
            >
              <span>View Full Report</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {/* Real-time Results Preview */}
      {run?.results && run.results.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <span>Completed Tests ({run.results.length})</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Requests</th>
                  <th className="py-2 px-3">Req/sec</th>
                  <th className="py-2 px-3">Avg Latency</th>
                  <th className="py-2 px-3">App Peak CPU</th>
                  <th className="py-2 px-3">App Peak RAM</th>
                  <th className="py-2 px-3">DB Conns (Peak)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {run.results.map((r: any) => (
                  <tr key={r.id}>
                    <td className="py-2 px-3 font-semibold text-sky-400">{r.testType}</td>
                    <td className="py-2 px-3">{r.totalRequests.toLocaleString()}</td>
                    <td className="py-2 px-3">{r.requestPerSecond.toLocaleString()}</td>
                    <td className="py-2 px-3">{r.latencyAverageMs} ms</td>
                    <td className="py-2 px-3">
                      {r.cpuPeakUsage}m ({r.cpuPeakPercent}%)
                    </td>
                    <td className="py-2 px-3">
                      {r.memPeakUsage}Mi ({r.memPeakPercent}%)
                    </td>
                    <td className="py-2 px-3">
                      {r.dbPeakConnectionUsage} ({r.dbPeakConnectionPercent}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Terminal logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span>Orchestrator Logs</span>
          </div>
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              autoScroll
                ? "border-sky-700 bg-sky-950 text-sky-400"
                : "border-slate-800 bg-slate-900 text-slate-400"
            }`}
          >
            Auto-scroll {autoScroll ? "ON" : "OFF"}
          </button>
        </div>
        <div
          ref={terminalRef}
          className="p-4 bg-black text-slate-300 font-mono text-xs h-[450px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-text"
        >
          {logs || "Waiting for execution logs...\n"}
        </div>
      </div>
    </div>
  );
}
