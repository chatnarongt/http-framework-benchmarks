"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart, ArrowLeft } from "lucide-react";
import type { SummaryRow } from "@/lib/summary";
import { ALL_TEST_TYPES } from "@/lib/engine/types";

const METRIC_CONFIGS = [
  { key: "requestPerSecond", label: "Throughput (best)", unit: "req/s", hint: "higher is better" },
  { key: "latencyAverageMs", label: "Avg Latency (best)", unit: "ms", hint: "lower is better" },
  { key: "cpuPeakPercent", label: "App CPU Peak (best)", unit: "%", hint: "lower is better" },
  { key: "memPeakPercent", label: "App Memory Peak (best)", unit: "%", hint: "lower is better" },
  {
    key: "dbPeakConnectionPercent",
    label: "DB Connections Peak (best)",
    unit: "%",
    hint: "lower is better",
  },
] as const;

type MetricKey = (typeof METRIC_CONFIGS)[number]["key"];

function formatNumber(value: number) {
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  return Math.round(value * 100) / 100;
}

export default function SummaryPage() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testType, setTestType] = useState<string>("read-one");
  const [database, setDatabase] = useState<string>("");

  useEffect(() => {
    fetch("/api/summary")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setRows(data);
        else setError(data.error || "Failed to load summary");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load summary");
        setLoading(false);
      });
  }, []);

  const availableTestTypes = useMemo(() => {
    const present = new Set(rows.map((r) => r.testType));
    return ALL_TEST_TYPES.filter((t) => present.has(t));
  }, [rows]);

  const availableDatabases = useMemo<string[]>(
    () => [...new Set(rows.map((r) => r.database))],
    [rows]
  );

  useEffect(() => {
    if (availableTestTypes.length > 0 && !availableTestTypes.includes(testType as any)) {
      setTestType(availableTestTypes[0]);
    }
  }, [availableTestTypes, testType]);

  useEffect(() => {
    if (availableDatabases.length > 0 && !availableDatabases.includes(database)) {
      setDatabase(availableDatabases[0]);
    }
  }, [availableDatabases, database]);

  const { frameworks, chartDataByMetric } = useMemo(() => {
    const selected = rows.filter((r) => r.testType === testType && r.database === database);
    const frameworks = [...new Set(selected.map((r) => r.framework))];
    const chartDataByMetric = {} as Record<MetricKey, { framework: string; value: number }[]>;
    for (const { key } of METRIC_CONFIGS) {
      chartDataByMetric[key] = frameworks.map((fw) => ({
        framework: fw,
        value: selected.find((r) => r.framework === fw)?.[key] ?? 0,
      }));
    }
    return { frameworks, chartDataByMetric };
  }, [rows, testType, database]);

  if (loading) {
    return <div className="text-center py-20 text-slate-400">Loading summary...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="text-xl font-bold text-white">{error}</div>
        <Link href="/reports" className="text-sky-400 underline">
          Back to Reports
        </Link>
      </div>
    );
  }

  if (availableTestTypes.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="text-xl font-bold text-slate-200">No completed benchmarks yet</div>
        <p className="text-sm text-slate-400">Run a benchmark to see the summary graph.</p>
        <Link href="/" className="text-sky-400 underline">
          New Benchmark
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-400 transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Reports</span>
        </Link>
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
          <LineChart className="w-7 h-7 text-sky-400" />
          <span>Summary</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Best score per framework for the selected database and test type. Resources pick the
          lowest peak; throughput the highest req/s.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
            Database
          </span>
          {availableDatabases.map((db) => (
            <button
              key={db}
              onClick={() => setDatabase(db)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${
                db === database
                  ? "bg-sky-500 text-slate-950 border-sky-500"
                  : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full border ${
                  db === database ? "bg-slate-950 border-slate-950" : "border-slate-500"
                }`}
              />
              {db}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {availableTestTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTestType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${
                t === testType
                  ? "bg-sky-500 text-slate-950 border-sky-500"
                  : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {frameworks.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <div className="text-slate-400 text-sm">
            No benchmarks for <span className="font-mono text-sky-400">{database}</span> with test
            type <span className="font-mono text-sky-400">{testType}</span>.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {METRIC_CONFIGS.map(({ key, label, unit, hint }) => (
            <div
              key={key}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col"
            >
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-200">{label}</h2>
                <span className="text-[11px] text-slate-500">{hint}</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataByMetric[key]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis
                      dataKey="framework"
                      tick={{ fill: "#a3a3a3", fontSize: 12 }}
                      stroke="#404040"
                    />
                    <YAxis tick={{ fill: "#a3a3a3", fontSize: 12 }} stroke="#404040" width={56} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        border: "1px solid #404040",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value) => [`${formatNumber(Number(value))} ${unit}`]}
                    />
                    <Bar dataKey="value" fill="#f5f5f5" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
