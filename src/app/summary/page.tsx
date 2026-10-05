"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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

const STORAGE_KEY = "benchhub_summary_filters";

const SORT_OPTIONS = ["none", "best", "worst", "name"] as const;
type SortBy = (typeof SORT_OPTIONS)[number];

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
  const [sortBy, setSortBy] = useState<SortBy>("best");
  const [visibleMetrics, setVisibleMetrics] = useState<MetricKey[]>(
    METRIC_CONFIGS.map(({ key }) => key)
  );

  const toggleMetric = (key: MetricKey) => {
    setVisibleMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

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

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (typeof saved.testType === "string") setTestType(saved.testType);
      if (typeof saved.database === "string") setDatabase(saved.database);
      if (SORT_OPTIONS.includes(saved.sortBy)) setSortBy(saved.sortBy);
      if (Array.isArray(saved.metrics)) {
        const valid = saved.metrics.filter((m: unknown): m is MetricKey =>
          METRIC_CONFIGS.some(({ key }) => key === m)
        );
        if (valid.length > 0) setVisibleMetrics(valid);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ testType, database, sortBy, metrics: visibleMetrics })
    );
  }, [testType, database, sortBy, visibleMetrics]);

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
    const chartDataByMetric = {} as Record<
      MetricKey,
      { framework: string; value: number; usage?: number; label: string }[]
    >;
    for (const { key } of METRIC_CONFIGS) {
      const data = frameworks.map((fw) => {
        const row = selected.find((r) => r.framework === fw);
        return {
          framework: fw,
          value: row?.[key] ?? 0,
          usage: key === "memPeakPercent" ? row?.memPeakUsage : undefined,
          label: "",
        };
      });
      const dir = key === "requestPerSecond" ? -1 : 1;
      if (sortBy === "name") data.sort((a, b) => a.framework.localeCompare(b.framework));
      else if (sortBy === "best") data.sort((a, b) => dir * (a.value - b.value));
      else if (sortBy === "worst") data.sort((a, b) => -dir * (a.value - b.value));
      if (key.endsWith("Percent")) for (const d of data) d.value = Math.min(100, d.value);
      for (const d of data) {
        d.label =
          key === "memPeakPercent"
            ? `${formatNumber(d.usage ?? 0)}MB, ${formatNumber(d.value)}%`
            : `${formatNumber(d.value)}${key.endsWith("Percent") ? "%" : ""}`;
      }
      chartDataByMetric[key] = data;
    }
    return { frameworks, chartDataByMetric };
  }, [rows, testType, database, sortBy]);

  const isDbTest = testType !== "plaintext" && testType !== "json";
  const shownMetrics = METRIC_CONFIGS.filter(
    ({ key }) =>
      visibleMetrics.includes(key) && (key !== "dbPeakConnectionPercent" || isDbTest)
  );

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
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${db === database
                ? "bg-sky-500 text-slate-950 border-sky-500"
                : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600"
                }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full border ${db === database ? "bg-slate-950 border-slate-950" : "border-slate-500"
                  }`}
              />
              {db}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
            Type
          </span>
          {availableTestTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTestType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${t === testType
                ? "bg-sky-500 text-slate-950 border-sky-500"
                : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600"
                }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
            Metrics
          </span>
          {METRIC_CONFIGS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleMetric(key)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${
                visibleMetrics.includes(key)
                  ? "bg-sky-500 text-slate-950 border-sky-500"
                  : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-sm border ${
                  visibleMetrics.includes(key)
                    ? "bg-slate-950 border-slate-950"
                    : "border-slate-500"
                }`}
              />
              {label.replace(" (best)", "")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
            Sort
          </span>
          {SORT_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${s === sortBy
                ? "bg-sky-500 text-slate-950 border-sky-500"
                : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600"
                }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
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
      ) : shownMetrics.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <div className="text-slate-400 text-sm">No metrics selected.</div>
        </div>
      ) : (
        <div className="space-y-6">
          {shownMetrics.map(({ key, label, unit, hint }) => (
            <div
              key={key}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col"
            >
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-200">{label}</h2>
                <span className="text-[11px] text-slate-500">{hint}</span>
              </div>
              <div style={{ height: frameworks.length * 26 + 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={chartDataByMetric[key]}
                    margin={{ top: 8, right: key === "memPeakPercent" ? 104 : 56, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "#a3a3a3", fontSize: 12 }}
                      stroke="#404040"
                    />
                    <YAxis
                      type="category"
                      dataKey="framework"
                      tick={{ fill: "#a3a3a3", fontSize: 12 }}
                      stroke="#404040"
                      width={Math.max(110, ...frameworks.map((f) => f.length * 8 + 16))}
                      interval={0}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        border: "1px solid #404040",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value) => [`${formatNumber(Number(value))} ${unit}`]}
                    />
                    <Bar dataKey="value" fill="#f5f5f5" radius={[0, 3, 3, 0]} barSize={16}>
                      <LabelList
                        dataKey="label"
                        position="right"
                        style={{ fill: "#a3a3a3", fontSize: 12 }}
                      />
                    </Bar>
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
