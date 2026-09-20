"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowLeft, Download, Layers, Server, Zap } from "lucide-react";

export default function ReportDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/reports/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setRun(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center py-20 text-slate-400">Loading benchmark report...</div>;
  }

  if (!run || run.error === "Report not found") {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="text-xl font-bold text-red-400">Report not found</div>
        <Link href="/reports" className="text-sky-400 underline">
          Back to Reports
        </Link>
      </div>
    );
  }

  const results = run.results || [];
  const maxRps = Math.max(...results.map((r: any) => r.requestPerSecond), 1);
  const typeWorkloads = (() => {
    try {
      return run.typeWorkloads ? JSON.parse(run.typeWorkloads) : {};
    } catch {
      return {};
    }
  })();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const reportName = run.repoName || "benchmark";
    a.download = `${reportName}-${run.database}-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Navigation & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-400 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Reports</span>
          </Link>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <span>{run.repoName || "Benchmark Report"}</span>
            <span className="text-xs font-mono font-normal px-2.5 py-1 bg-slate-800 text-slate-300 rounded-md">
              {id}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Repo: <span className="text-slate-200 font-mono">{run.repoUrl}</span> | Ran at{" "}
            {new Date(run.createdAt).toLocaleString()} | Target Database:{" "}
            <span className="text-sky-400 uppercase font-semibold">{run.database}</span> | Virtual
            Users: <span className="text-slate-200 font-semibold">{run.vus}</span> | Records:{" "}
            <span className="text-slate-200 font-semibold">{run.totalRecords.toLocaleString()}</span>
          </p>
        </div>

        <button
          onClick={exportJson}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Export JSON</span>
        </button>
      </div>

      {/* KPI Visual Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400 font-medium">Max Throughput</div>
          <div className="text-2xl font-black text-sky-400 mt-1">
            {maxRps.toLocaleString()}{" "}
            <span className="text-xs font-normal text-slate-500">req/s</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400 font-medium">Tests Executed</div>
          <div className="text-2xl font-black text-slate-100 mt-1">{results.length} types</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400 font-medium">App CPU Limit</div>
          <div className="text-2xl font-black text-slate-100 mt-1 font-mono">
            {run.appCpuLimit} <span className="text-xs font-normal text-slate-500">core</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400 font-medium">App Memory Limit</div>
          <div className="text-2xl font-black text-slate-100 mt-1 font-mono">{run.appMemLimit}</div>
        </div>
      </div>

      {/* Visual Bar Comparison */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Zap className="w-4 h-4 text-sky-400" />
          <span>Throughput Comparison (Requests per Second)</span>
        </h2>
        <div className="space-y-3 pt-2">
          {results.map((r: any) => {
            const pct = Math.max(2, Math.round((r.requestPerSecond / maxRps) * 100));
            return (
              <div key={r.id} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-300 font-semibold">{r.testType}</span>
                  <span className="text-sky-400 font-bold">
                    {r.requestPerSecond.toLocaleString()} req/s
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comprehensive 25-Metric Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Complete Metrics (All 25 Collected Dimensions)</span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono whitespace-nowrap">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">Test Type</th>
                <th className="py-3 px-4">Total Reqs</th>
                <th className="py-3 px-4">Req/sec</th>
                <th className="py-3 px-4">Avg Latency</th>
                <th className="py-3 px-4">Min Latency</th>
                <th className="py-3 px-4">Max Latency</th>
                <th className="py-3 px-4">Errors</th>

                <th className="py-3 px-4 bg-slate-950/40">App CPU (Idle)</th>
                <th className="py-3 px-4 bg-slate-950/40">App CPU (Peak)</th>
                <th className="py-3 px-4 bg-slate-950/40">App RAM (Idle)</th>
                <th className="py-3 px-4 bg-slate-950/40">App RAM (Peak)</th>

                <th className="py-3 px-4">DB CPU (Idle)</th>
                <th className="py-3 px-4">DB CPU (Peak)</th>
                <th className="py-3 px-4">DB RAM (Idle)</th>
                <th className="py-3 px-4">DB RAM (Peak)</th>

                <th className="py-3 px-4 bg-slate-950/40">DB Conns (Idle)</th>
                <th className="py-3 px-4 bg-slate-950/40">DB Conns (Peak)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {results.map((r: any) => {
                const tw = typeWorkloads[r.testType];
                return (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-sky-400">
                      <div>{r.testType}</div>
                      {tw && (
                        <div className="text-[10px] text-slate-500 font-normal">
                          {tw.vus ?? run.vus} VUs • {(tw.totalRecords ?? run.totalRecords).toLocaleString()} recs
                        </div>
                      )}
                    </td>
                  <td className="py-3 px-4">{r.totalRequests.toLocaleString()}</td>
                  <td className="py-3 px-4 font-bold text-white">
                    {r.requestPerSecond.toLocaleString()}
                  </td>
                  <td className="py-3 px-4">{r.latencyAverageMs} ms</td>
                  <td className="py-3 px-4">{r.latencyMinMs} ms</td>
                  <td className="py-3 px-4">{r.latencyMaxMs} ms</td>
                  <td className="py-3 px-4">
                    <span className={r.errorCount > 0 ? "text-rose-400 font-bold" : "text-slate-400"}>
                      {r.errorCount}
                    </span>
                  </td>

                  {/* App Pod Resources */}
                  <td className="py-3 px-4 bg-slate-950/20">
                    {r.cpuIdleUsage}m ({r.cpuIdlePercent}%)
                  </td>
                  <td className="py-3 px-4 bg-slate-950/20 font-semibold text-slate-100">
                    {r.cpuPeakUsage}m ({r.cpuPeakPercent}%)
                  </td>
                  <td className="py-3 px-4 bg-slate-950/20">
                    {r.memIdleUsage}Mi ({r.memIdlePercent}%)
                  </td>
                  <td className="py-3 px-4 bg-slate-950/20 font-semibold text-slate-100">
                    {r.memPeakUsage}Mi ({r.memPeakPercent}%)
                  </td>

                  {/* DB Pod Resources */}
                  <td className="py-3 px-4">
                    {r.dbCpuIdleUsage}m ({r.dbCpuIdlePercent}%)
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-100">
                    {r.dbCpuPeakUsage}m ({r.dbCpuPeakPercent}%)
                  </td>
                  <td className="py-3 px-4">
                    {r.dbMemIdleUsage}Mi ({r.dbMemIdlePercent}%)
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-100">
                    {r.dbMemPeakUsage}Mi ({r.dbMemPeakPercent}%)
                  </td>

                  {/* DB Connections */}
                  <td className="py-3 px-4 bg-slate-950/20">
                    {r.dbIdleConnectionUsage} ({r.dbIdleConnectionPercent}%)
                  </td>
                  <td className="py-3 px-4 bg-slate-950/20 font-semibold text-slate-100">
                    {r.dbPeakConnectionUsage} ({r.dbPeakConnectionPercent}%)
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
