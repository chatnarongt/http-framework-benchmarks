"use client";

import { Activity, ArrowRight, StopCircle, Terminal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { statusTone } from "@/lib/status";

export default function BenchmarkView({ id }: { id: string }) {
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: logs is the auto-scroll trigger
	useEffect(() => {
		if (autoScroll && terminalRef.current) {
			terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
		}
	}, [logs, autoScroll]);

	return (
		<div className="space-y-6">
			{/* Header bar */}
			<div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6 md:flex-row md:items-center">
				<div>
					<div className="flex items-center gap-3">
						<h1 className="font-bold font-mono text-white text-xl">{run?.repoName || id}</h1>
						{run?.repoName && <span className="font-mono text-slate-500 text-xs">({id})</span>}
						<span
							className={cn(
								"rounded-full border px-2.5 py-0.5 font-semibold text-xs uppercase tracking-wider",
								statusTone(status),
							)}
						>
							{status}
						</span>
					</div>
					{run && (
						<p className="mt-2 text-slate-400 text-xs">
							Database: <span className="font-mono text-slate-200">{run.database}</span> | VUs:{" "}
							<span className="font-mono text-slate-200">{run.vus}</span> | Records:{" "}
							<span className="font-mono text-slate-200">{run.totalRecords.toLocaleString()}</span>
						</p>
					)}
				</div>

				<div className="flex items-center gap-3">
					{(status === "RUNNING" || status === "PENDING") && (
						<button
							type="button"
							onClick={handleStop}
							disabled={stopping}
							className="inline-flex items-center gap-2 rounded-lg border border-slate-600 border-dashed bg-transparent px-4 py-2.5 font-bold text-slate-300 text-sm transition-colors hover:border-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
						>
							<StopCircle className="h-4 w-4 text-slate-400" />
							<span>{stopping ? "Stopping..." : "Stop Benchmark"}</span>
						</button>
					)}
					{status === "COMPLETED" && (
						<Link
							href={`/reports/${id}`}
							className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 font-bold text-slate-950 text-sm transition-colors hover:bg-sky-400"
						>
							<span>View Full Report</span>
							<ArrowRight className="h-4 w-4" />
						</Link>
					)}
				</div>
			</div>

			{/* Terminal logs */}
			<div className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
				<div className="flex items-center justify-between border-slate-800 border-b bg-slate-950 px-4 py-3">
					<div className="flex items-center gap-2 text-slate-400 text-xs">
						<Terminal className="h-4 w-4 text-slate-400" />
						<span>Orchestrator Logs</span>
					</div>
					<button
						type="button"
						onClick={() => setAutoScroll(!autoScroll)}
						className={cn(
							"rounded border px-2.5 py-1 text-xs transition-colors",
							autoScroll
								? "border-sky-700 bg-sky-950 text-sky-400"
								: "border-slate-800 bg-slate-900 text-slate-400",
						)}
					>
						Auto-scroll {autoScroll ? "ON" : "OFF"}
					</button>
				</div>
				<div
					ref={terminalRef}
					className="h-112.5 select-text overflow-y-auto whitespace-pre-wrap bg-black p-4 font-mono text-slate-300 text-xs leading-relaxed"
				>
					{logs || "Waiting for execution logs...\n"}
				</div>
			</div>

			{/* Real-time Results Preview */}
			{run?.results && run.results.length > 0 && (
				<div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
					<h2 className="flex items-center gap-2 font-semibold text-slate-200 text-sm">
						<Activity className="h-4 w-4 text-sky-400" />
						<span>Completed Tests ({run.results.length})</span>
					</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-left font-mono text-xs">
							<thead className="border-slate-800 border-b text-slate-400">
								<tr>
									<th className="px-3 py-2">Type</th>
									<th className="px-3 py-2">Requests</th>
									<th className="px-3 py-2">Req/sec</th>
									<th className="px-3 py-2">Avg Latency</th>
									<th className="px-3 py-2">App Peak CPU</th>
									<th className="px-3 py-2">App Peak RAM</th>
									<th className="px-3 py-2">DB Conns (Peak)</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-800 text-slate-200">
								{run.results.map((r: any) => (
									<tr key={r.id}>
										<td className="px-3 py-2 font-semibold text-sky-400">{r.testType}</td>
										<td className="px-3 py-2">{r.totalRequests.toLocaleString()}</td>
										<td className="px-3 py-2">{r.requestPerSecond.toLocaleString()}</td>
										<td className="px-3 py-2">{r.latencyAverageMs} ms</td>
										<td className="px-3 py-2">
											{r.cpuPeakUsage}m ({r.cpuPeakPercent}%)
										</td>
										<td className="px-3 py-2">
											{r.memPeakUsage}Mi ({r.memPeakPercent}%)
										</td>
										<td className="px-3 py-2">
											{r.dbPeakConnectionUsage} ({r.dbPeakConnectionPercent}%)
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
