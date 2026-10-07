"use client";

import { ArrowLeft, Heart, LineChart } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/cn";
import { ALL_TEST_TYPES } from "@/lib/engine/types";
import type { AggMode, SummaryAggregate } from "@/lib/summary";

const METRIC_CONFIGS = [
	{ key: "requestPerSecond", label: "Throughput", unit: "req/s", hint: "higher is better" },
	{ key: "latencyAverageMs", label: "Avg Latency", unit: "ms", hint: "lower is better" },
	{ key: "cpuPeakPercent", label: "App CPU Peak", unit: "%", hint: "lower is better" },
	{ key: "memPeakPercent", label: "App Memory Peak", unit: "%", hint: "lower is better" },
	{
		key: "dbPeakConnectionPercent",
		label: "DB Connections Peak",
		unit: "%",
		hint: "lower is better",
	},
] as const;

const AGG_MODES = ["best", "avg"] as const;

type MetricKey = (typeof METRIC_CONFIGS)[number]["key"];

const STORAGE_KEY = "benchhub_summary_filters";

const SORT_OPTIONS = ["none", "best", "worst", "name"] as const;
type SortBy = (typeof SORT_OPTIONS)[number];

function formatNumber(value: number) {
	if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
	return Math.round(value * 100) / 100;
}

export default function SummaryPage() {
	const [data, setData] = useState<SummaryAggregate>({ best: [], avg: [] });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<AggMode>("avg");
	const [testType, setTestType] = useState<string>("read-one");
	const [database, setDatabase] = useState<string>("");
	const [sortBy, setSortBy] = useState<SortBy>("best");
	const [visibleMetrics, setVisibleMetrics] = useState<MetricKey[]>(
		METRIC_CONFIGS.map(({ key }) => key),
	);
	const [filtersLoaded, setFiltersLoaded] = useState(false);

	const toggleMetric = (key: MetricKey) => {
		setVisibleMetrics((prev) =>
			prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
		);
	};

	useEffect(() => {
		fetch("/api/summary")
			.then((res) => res.json())
			.then((payload) => {
				if (Array.isArray(payload?.best) && Array.isArray(payload?.avg)) setData(payload);
				else setError(payload?.error || "Failed to load summary");
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
			if (AGG_MODES.includes(saved.mode)) setMode(saved.mode);
			if (typeof saved.testType === "string") setTestType(saved.testType);
			if (typeof saved.database === "string") setDatabase(saved.database);
			if (SORT_OPTIONS.includes(saved.sortBy)) setSortBy(saved.sortBy);
			if (Array.isArray(saved.metrics)) {
				const valid = saved.metrics.filter((m: unknown): m is MetricKey =>
					METRIC_CONFIGS.some(({ key }) => key === m),
				);
				if (valid.length > 0) setVisibleMetrics(valid);
			}
		} catch {}
		setFiltersLoaded(true);
	}, []);

	useEffect(() => {
		if (!filtersLoaded) return;
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ mode, testType, database, sortBy, metrics: visibleMetrics }),
		);
	}, [filtersLoaded, mode, testType, database, sortBy, visibleMetrics]);

	const rows = data[mode];

	const availableTestTypes = useMemo(() => {
		const present = new Set(rows.map((r) => r.testType));
		return ALL_TEST_TYPES.filter((t) => present.has(t));
	}, [rows]);

	const availableDatabases = useMemo<string[]>(
		() => [...new Set(rows.map((r) => r.database))],
		[rows],
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
		({ key }) => visibleMetrics.includes(key) && (key !== "dbPeakConnectionPercent" || isDbTest),
	);

	if (loading) {
		return <div className="py-20 text-center text-slate-400">Loading summary...</div>;
	}

	if (error) {
		return (
			<div className="space-y-4 py-20 text-center">
				<div className="font-bold text-white text-xl">{error}</div>
				<Link href="/reports" className="text-sky-400 underline">
					Back to Reports
				</Link>
			</div>
		);
	}

	if (availableTestTypes.length === 0) {
		return (
			<div className="space-y-4 py-20 text-center">
				<div className="font-bold text-slate-200 text-xl">No completed benchmarks yet</div>
				<p className="text-slate-400 text-sm">Run a benchmark to see the summary graph.</p>
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
					className="mb-2 inline-flex items-center gap-1.5 text-slate-400 text-xs transition-colors hover:text-sky-400"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					<span>All Reports</span>
				</Link>
				<h1 className="flex items-center gap-3 font-black text-2xl text-white tracking-tight">
					<LineChart className="h-7 w-7 text-sky-400" />
					<span>Summary</span>
				</h1>
				<p className="mt-1 text-slate-400 text-xs">
					{mode === "avg"
						? "Average score per framework across completed runs for the selected database and test type."
						: "Best score per framework for the selected database and test type. Resources pick the lowest peak; throughput the highest req/s."}
				</p>
			</div>

			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="mr-1 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
						Aggregate
					</span>
					{AGG_MODES.map((m) => (
						<button
							type="button"
							key={m}
							onClick={() => setMode(m)}
							className={cn(
								"rounded-lg border px-3 py-1.5 font-mono font-semibold text-xs transition-colors",
								m === mode
									? "border-sky-500 bg-sky-500 text-slate-950"
									: "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600",
							)}
						>
							{m === "avg" ? "Average" : "Best"}
						</button>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="mr-1 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
						Database
					</span>
					{availableDatabases.map((db) => (
						<button
							type="button"
							key={db}
							onClick={() => setDatabase(db)}
							className={cn(
								"inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono font-semibold text-xs capitalize transition-colors",
								db === database
									? "border-sky-500 bg-sky-500 text-slate-950"
									: "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600",
							)}
						>
							<Heart className="size-3" fill={db === database ? "currentColor" : "none"} />
							{db}
						</button>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="mr-1 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
						Type
					</span>
					{availableTestTypes.map((t) => (
						<button
							type="button"
							key={t}
							onClick={() => setTestType(t)}
							className={cn(
								"rounded-lg border px-3 py-1.5 font-mono font-semibold text-xs transition-colors",
								t === testType
									? "border-sky-500 bg-sky-500 text-slate-950"
									: "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600",
							)}
						>
							{t}
						</button>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="mr-1 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
						Metrics
					</span>
					{METRIC_CONFIGS.map(({ key, label }) => (
						<button
							type="button"
							key={key}
							onClick={() => toggleMetric(key)}
							className={cn(
								"inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono font-semibold text-xs transition-colors",
								visibleMetrics.includes(key)
									? "border-sky-500 bg-sky-500 text-slate-950"
									: "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600",
							)}
						>
							<span
								className={cn(
									"h-2.5 w-2.5 rounded-sm border",
									visibleMetrics.includes(key)
										? "border-slate-950 bg-slate-950"
										: "border-slate-500",
								)}
							/>
							{label}
						</button>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="mr-1 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
						Sort
					</span>
					{SORT_OPTIONS.map((s) => (
						<button
							type="button"
							key={s}
							onClick={() => setSortBy(s)}
							className={cn(
								"rounded-lg border px-3 py-1.5 font-mono font-semibold text-xs transition-colors",
								s === sortBy
									? "border-sky-500 bg-sky-500 text-slate-950"
									: "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600",
							)}
						>
							{s[0].toUpperCase() + s.slice(1)}
						</button>
					))}
				</div>
			</div>

			{frameworks.length === 0 ? (
				<div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
					<div className="text-slate-400 text-sm">
						No benchmarks for <span className="font-mono text-sky-400">{database}</span> with test
						type <span className="font-mono text-sky-400">{testType}</span>.
					</div>
				</div>
			) : shownMetrics.length === 0 ? (
				<div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
					<div className="text-slate-400 text-sm">No metrics selected.</div>
				</div>
			) : (
				<div className="space-y-6">
					{shownMetrics.map(({ key, label, unit, hint }) => (
						<div
							key={key}
							className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-6"
						>
							<div className="mb-4 flex items-baseline justify-between">
								<h2 className="font-bold text-slate-200 text-sm">{`${label} (${
									mode === "avg" ? "average" : "best"
								})`}</h2>
								<span className="text-[11px] text-slate-500">{hint}</span>
							</div>
							<div style={{ height: frameworks.length * 26 + 16 }}>
								<ResponsiveContainer width="100%" height="100%">
									<BarChart
										layout="vertical"
										data={chartDataByMetric[key]}
										margin={{
											top: 8,
											right: key === "memPeakPercent" ? 104 : 56,
											left: 0,
											bottom: 0,
										}}
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
