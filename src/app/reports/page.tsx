"use client";

import {
	Activity,
	ArrowRight,
	BarChart2,
	Calendar,
	PlayCircle,
	Radio,
	StopCircle,
	Terminal,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { EMPTY_FILTERS, filterRuns, type RunFilters, STATUS_OPTIONS } from "@/lib/run-filters";
import { statusTone } from "@/lib/status";

const STORAGE_KEY = "benchhub_reports_filters";

const INPUT_CLS =
	"rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-slate-100 text-xs focus:border-sky-500 focus:outline-none";

export default function ReportsListPage() {
	const [runs, setRuns] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [filters, setFilters] = useState<RunFilters>(EMPTY_FILTERS);
	const [filtersLoaded, setFiltersLoaded] = useState(false);

	const fetchRuns = useCallback(async () => {
		try {
			const res = await fetch("/api/reports");
			if (res.ok) {
				const data = await res.json();
				setRuns(data);
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchRuns();
		const interval = setInterval(fetchRuns, 5000);
		return () => clearInterval(interval);
	}, [fetchRuns]);

	useEffect(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
			setFilters((f) => ({
				name: typeof saved.name === "string" ? saved.name : f.name,
				status: STATUS_OPTIONS.includes(saved.status) ? saved.status : f.status,
				from: typeof saved.from === "string" ? saved.from : f.from,
				to: typeof saved.to === "string" ? saved.to : f.to,
			}));
		} catch {}
		setFiltersLoaded(true);
	}, []);

	useEffect(() => {
		if (!filtersLoaded) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
	}, [filtersLoaded, filters]);

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
				`Delete ALL ${runs.length} benchmark report${runs.length === 1 ? "" : "s"}? This stops anything still running and cannot be undone.`,
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

	// ponytail: filters run client-side over the full /api/reports payload; move to query params + Prisma where when polling gets heavy.
	const filteredRuns = useMemo(() => filterRuns(runs, filters), [runs, filters]);
	const filtersActive =
		filters.name.trim() !== "" ||
		filters.status !== "all" ||
		filters.from !== "" ||
		filters.to !== "";

	if (loading) {
		return <div className="py-20 text-center text-slate-400">Loading benchmark history...</div>;
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
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
				<div>
					<h1 className="flex items-center gap-3 font-black text-2xl text-white tracking-tight">
						<BarChart2 className="h-7 w-7 text-sky-400" />
						<span>Benchmark Reports</span>
					</h1>
					<p className="mt-1 text-slate-400 text-xs">
						Historical benchmark executions and performance metrics
					</p>
				</div>
				<div className="flex items-center gap-3">
					<Link
						href="/benchmarks/live"
						className="inline-flex items-center gap-2 rounded-lg border border-slate-700 border-dashed bg-transparent px-3.5 py-2 font-semibold text-slate-300 text-xs transition-colors hover:border-slate-500 hover:text-white"
						title="Follow the live benchmark and hop to the next queued run automatically"
					>
						<Radio className="h-4 w-4 text-sky-400" />
						<span>Live</span>
					</Link>
					{activeRun && (
						<Link
							href={`/benchmarks/${activeRun.id}`}
							className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 font-semibold text-sky-300 text-xs shadow-sm transition-all hover:bg-sky-500/20"
							title={`View running benchmark: ${activeRun.repoName || activeRun.id}`}
						>
							<Activity className="h-4 w-4 animate-pulse text-sky-400" />
							<span>
								{runningRun
									? `Running: ${runningRun.repoName || runningRun.id}`
									: `Queued: ${activeRun.repoName || activeRun.id}`}
								{queuedIds.length > 0 && (
									<span className="font-normal text-slate-400"> · {queuedIds.length} queued</span>
								)}
							</span>
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					)}
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 font-bold text-slate-950 text-xs transition-colors hover:bg-sky-400"
					>
						<PlayCircle className="h-4 w-4" />
						<span>New Benchmark</span>
					</Link>
					<button
						type="button"
						onClick={clearAll}
						disabled={clearing || runs.length === 0}
						className="inline-flex items-center gap-2 rounded-lg border border-slate-700 border-dashed px-3.5 py-2 font-semibold text-slate-300 text-xs transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
						title="Delete every benchmark report, stopping anything still running"
					>
						<Trash2 className="h-4 w-4" />
						<span>{clearing ? "Clearing..." : "Clear All Reports"}</span>
					</button>
				</div>
			</div>

			{runs.length > 0 && (
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<span className="mr-1 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
							Status
						</span>
						{STATUS_OPTIONS.map((s) => (
							<button
								type="button"
								key={s}
								onClick={() => setFilters((f) => ({ ...f, status: s }))}
								className={cn(
									"rounded-lg border px-3 py-1.5 font-mono font-semibold text-xs transition-colors",
									s === filters.status
										? "border-sky-500 bg-sky-500 text-slate-950"
										: "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600",
								)}
							>
								{s === "all" ? "All" : `${s[0]}${s.slice(1).toLowerCase()}`}
							</button>
						))}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="mr-1 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
							Name
						</span>
						<input
							type="text"
							value={filters.name}
							onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
							placeholder="repo name or id..."
							className={INPUT_CLS}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="mr-1 font-bold text-[11px] text-slate-500 uppercase tracking-wider">
							Date
						</span>
						<span className="text-slate-400 text-xs">From</span>
						<input
							type="date"
							value={filters.from}
							onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
							className={cn(INPUT_CLS, "[color-scheme:dark]")}
						/>
						<span className="text-slate-400 text-xs">To</span>
						<input
							type="date"
							value={filters.to}
							onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
							className={cn(INPUT_CLS, "[color-scheme:dark]")}
						/>
						{filtersActive && (
							<button
								type="button"
								onClick={() => setFilters(EMPTY_FILTERS)}
								className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono font-semibold text-slate-300 text-xs transition-colors hover:border-slate-600 hover:text-white"
							>
								Clear Filters
							</button>
						)}
					</div>
				</div>
			)}

			{runs.length === 0 ? (
				<div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
					<div className="text-slate-400 text-sm">No benchmarks recorded yet.</div>
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 font-bold text-slate-950 text-xs"
					>
						Run Your First Benchmark
					</Link>
				</div>
			) : filteredRuns.length === 0 ? (
				<div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
					<div className="text-slate-400 text-sm">No runs match the current filters.</div>
					<button
						type="button"
						onClick={() => setFilters(EMPTY_FILTERS)}
						className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 font-bold text-slate-950 text-xs transition-colors hover:bg-sky-400"
					>
						Clear Filters
					</button>
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
					<div className="divide-y divide-slate-800">
						{filteredRuns.map((run) => {
							const isRunning = run.status === "RUNNING" || run.status === "PENDING";
							return (
								<div
									key={run.id}
									className="flex flex-col justify-between gap-4 p-5 transition-colors hover:bg-slate-800/30 md:flex-row md:items-center"
								>
									<div className="space-y-1">
										<div className="flex items-center gap-3">
											<span className="font-bold font-mono text-base text-white">
												{run.repoName || run.id}
											</span>
											{run.repoName && (
												<span className="font-mono text-slate-500 text-xs">({run.id})</span>
											)}
											<span
												className={cn(
													"rounded border px-2 py-0.5 font-semibold text-[11px] uppercase tracking-wider",
													statusTone(run.status),
												)}
											>
												{run.status}
											</span>
											{run.status === "PENDING" && (
												<span
													className="rounded border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-400"
													title="Position in the execution queue"
												>
													Queued #{queuedIds.indexOf(run.id) + 1}
												</span>
											)}
											<span className="rounded bg-slate-800 px-2 py-0.5 font-semibold text-sky-400 text-xs uppercase">
												{run.database}
											</span>
										</div>
										<div className="flex items-center gap-4 pt-1 font-mono text-slate-400 text-xs">
											<span className="flex items-center gap-1">
												<Calendar className="h-3.5 w-3.5 text-slate-500" />
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
													className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 font-bold text-slate-950 text-xs shadow-sm transition-colors hover:bg-sky-400"
												>
													<Activity className="h-3.5 w-3.5 animate-pulse" />
													<span>View Live</span>
													<ArrowRight className="h-3.5 w-3.5" />
												</Link>
												<button
													type="button"
													onClick={(e) => handleStop(run.id, e)}
													className="flex items-center gap-1 rounded border border-slate-600 border-dashed bg-transparent px-2.5 py-1.5 font-semibold text-slate-300 text-xs transition-colors hover:border-slate-400 hover:bg-slate-800 hover:text-white"
													title="Stop benchmark"
												>
													<StopCircle className="h-3.5 w-3.5 text-slate-400" />
													<span>Stop</span>
												</button>
											</>
										) : (
											<>
												<Link
													href={`/benchmarks/${run.id}`}
													className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 font-medium text-slate-300 text-xs transition-colors hover:bg-slate-700"
													title="View benchmark execution logs"
												>
													<Terminal className="h-3.5 w-3.5 text-slate-400" />
													<span>Logs</span>
												</Link>
												<Link
													href={`/reports/${run.id}`}
													className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 text-xs transition-colors hover:bg-slate-700"
												>
													<span>View Report</span>
													<ArrowRight className="h-3.5 w-3.5" />
												</Link>
											</>
										)}
										<button
											type="button"
											onClick={(e) => deleteRun(run.id, e)}
											className="rounded p-1.5 text-slate-500 transition-colors hover:text-white"
											title="Delete"
										>
											<Trash2 className="h-4 w-4" />
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
