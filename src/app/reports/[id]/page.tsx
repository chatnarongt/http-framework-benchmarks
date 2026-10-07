"use client";

import { ArrowLeft, Download, Layers, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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
		return <div className="py-20 text-center text-slate-400">Loading benchmark report...</div>;
	}

	if (!run || run.error === "Report not found") {
		return (
			<div className="space-y-4 py-20 text-center">
				<div className="font-bold text-white text-xl">Report not found</div>
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
			<div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
				<div>
					<Link
						href="/reports"
						className="mb-2 inline-flex items-center gap-1.5 text-slate-400 text-xs transition-colors hover:text-sky-400"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						<span>All Reports</span>
					</Link>
					<h1 className="flex items-center gap-3 font-black text-2xl text-white tracking-tight">
						<span>{run.repoName || "Benchmark Report"}</span>
						<span className="rounded-md bg-slate-800 px-2.5 py-1 font-mono font-normal text-slate-300 text-xs">
							{id}
						</span>
					</h1>
					<p className="mt-1 text-slate-400 text-xs">
						Repo: <span className="font-mono text-slate-200">{run.repoUrl}</span> | Ran at{" "}
						{new Date(run.createdAt).toLocaleString()} | Target Database:{" "}
						<span className="font-semibold text-sky-400 uppercase">{run.database}</span> | Virtual
						Users: <span className="font-semibold text-slate-200">{run.vus}</span> | Records:{" "}
						<span className="font-semibold text-slate-200">
							{run.totalRecords.toLocaleString()}
						</span>
					</p>
				</div>

				<button
					type="button"
					onClick={exportJson}
					className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 font-semibold text-slate-200 text-xs transition-colors hover:border-slate-500"
				>
					<Download className="h-4 w-4" />
					<span>Export JSON</span>
				</button>
			</div>

			{/* KPI Visual Cards */}
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="font-medium text-slate-400 text-xs">Max Throughput</div>
					<div className="mt-1 font-black text-2xl text-sky-400">
						{maxRps.toLocaleString()}{" "}
						<span className="font-normal text-slate-500 text-xs">req/s</span>
					</div>
				</div>
				<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="font-medium text-slate-400 text-xs">Tests Executed</div>
					<div className="mt-1 font-black text-2xl text-slate-100">{results.length} types</div>
				</div>
				<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="font-medium text-slate-400 text-xs">App CPU Limit</div>
					<div className="mt-1 font-black font-mono text-2xl text-slate-100">
						{run.appCpuLimit} <span className="font-normal text-slate-500 text-xs">core</span>
					</div>
				</div>
				<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="font-medium text-slate-400 text-xs">App Memory Limit</div>
					<div className="mt-1 font-black font-mono text-2xl text-slate-100">{run.appMemLimit}</div>
				</div>
			</div>

			{/* Visual Bar Comparison */}
			<div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
				<h2 className="flex items-center gap-2 font-bold text-slate-200 text-sm">
					<Zap className="h-4 w-4 text-sky-400" />
					<span>Throughput Comparison (Requests per Second)</span>
				</h2>
				<div className="space-y-3 pt-2">
					{results.map((r: any) => {
						const pct = Math.max(2, Math.round((r.requestPerSecond / maxRps) * 100));
						return (
							<div key={r.id} className="space-y-1">
								<div className="flex justify-between font-mono text-xs">
									<span className="font-semibold text-slate-300">{r.testType}</span>
									<span className="font-bold text-sky-400">
										{r.requestPerSecond.toLocaleString()} req/s
									</span>
								</div>
								<div className="h-3 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
									<div
										className="h-full rounded-full bg-sky-500 transition-all"
										style={{ width: `${pct}%` }}
									/>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Comprehensive 25-Metric Table */}
			<div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
				<div className="flex items-center justify-between border-slate-800 border-b px-6 py-4">
					<h2 className="flex items-center gap-2 font-bold text-slate-200 text-sm">
						<Layers className="h-4 w-4 text-sky-400" />
						<span>Complete Metrics (All 25 Collected Dimensions)</span>
					</h2>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full whitespace-nowrap text-left font-mono text-xs">
						<thead className="border-slate-800 border-b bg-slate-950/80 text-slate-400">
							<tr>
								<th className="px-4 py-3 font-bold">Test Type</th>
								<th className="px-4 py-3">Total Reqs</th>
								<th className="px-4 py-3">Req/sec</th>
								<th className="px-4 py-3">Avg Latency</th>
								<th className="px-4 py-3">Min Latency</th>
								<th className="px-4 py-3">Max Latency</th>
								<th className="px-4 py-3">Errors</th>

								<th className="bg-slate-950/40 px-4 py-3">App CPU (Idle)</th>
								<th className="bg-slate-950/40 px-4 py-3">App CPU (Peak)</th>
								<th className="bg-slate-950/40 px-4 py-3">App RAM (Idle)</th>
								<th className="bg-slate-950/40 px-4 py-3">App RAM (Peak)</th>

								<th className="px-4 py-3">DB CPU (Idle)</th>
								<th className="px-4 py-3">DB CPU (Peak)</th>
								<th className="px-4 py-3">DB RAM (Idle)</th>
								<th className="px-4 py-3">DB RAM (Peak)</th>

								<th className="bg-slate-950/40 px-4 py-3">DB Conns (Idle)</th>
								<th className="bg-slate-950/40 px-4 py-3">DB Conns (Peak)</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-800 text-slate-300">
							{results.map((r: any) => {
								const tw = typeWorkloads[r.testType];
								return (
									<tr key={r.id} className="transition-colors hover:bg-slate-800/40">
										<td className="px-4 py-3 font-bold text-sky-400">
											<div>{r.testType}</div>
											{tw && (
												<div className="font-normal text-[10px] text-slate-500">
													{tw.vus ?? run.vus} VUs •{" "}
													{(tw.totalRecords ?? run.totalRecords).toLocaleString()} recs
												</div>
											)}
										</td>
										<td className="px-4 py-3">{r.totalRequests.toLocaleString()}</td>
										<td className="px-4 py-3 font-bold text-white">
											{r.requestPerSecond.toLocaleString()}
										</td>
										<td className="px-4 py-3">{r.latencyAverageMs} ms</td>
										<td className="px-4 py-3">{r.latencyMinMs} ms</td>
										<td className="px-4 py-3">{r.latencyMaxMs} ms</td>
										<td className="px-4 py-3">
											<span
												className={r.errorCount > 0 ? "font-bold text-white" : "text-slate-400"}
											>
												{r.errorCount}
											</span>
										</td>

										{/* App Pod Resources */}
										<td className="bg-slate-950/20 px-4 py-3">
											{r.cpuIdleUsage}m ({r.cpuIdlePercent}%)
										</td>
										<td className="bg-slate-950/20 px-4 py-3 font-semibold text-slate-100">
											{r.cpuPeakUsage}m ({r.cpuPeakPercent}%)
										</td>
										<td className="bg-slate-950/20 px-4 py-3">
											{r.memIdleUsage}Mi ({r.memIdlePercent}%)
										</td>
										<td className="bg-slate-950/20 px-4 py-3 font-semibold text-slate-100">
											{r.memPeakUsage}Mi ({r.memPeakPercent}%)
										</td>

										{/* DB Pod Resources */}
										<td className="px-4 py-3">
											{r.dbCpuIdleUsage}m ({r.dbCpuIdlePercent}%)
										</td>
										<td className="px-4 py-3 font-semibold text-slate-100">
											{r.dbCpuPeakUsage}m ({r.dbCpuPeakPercent}%)
										</td>
										<td className="px-4 py-3">
											{r.dbMemIdleUsage}Mi ({r.dbMemIdlePercent}%)
										</td>
										<td className="px-4 py-3 font-semibold text-slate-100">
											{r.dbMemPeakUsage}Mi ({r.dbMemPeakPercent}%)
										</td>

										{/* DB Connections */}
										<td className="bg-slate-950/20 px-4 py-3">
											{r.dbIdleConnectionUsage} ({r.dbIdleConnectionPercent}%)
										</td>
										<td className="bg-slate-950/20 px-4 py-3 font-semibold text-slate-100">
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
