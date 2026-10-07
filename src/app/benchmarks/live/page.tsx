"use client";

import { Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import BenchmarkView from "../[id]/benchmark-view";

export default function BenchmarkQueueLivePage() {
	const [viewId, setViewId] = useState<string | null>(null);

	useEffect(() => {
		const fetchRuns = async () => {
			try {
				const res = await fetch("/api/reports");
				if (!res.ok) return;
				const runs = await res.json();
				// API returns newest-first; pending runs are FIFO so reverse for queue order.
				const running = runs.find((r: { status: string }) => r.status === "RUNNING");
				const nextQueued = runs
					.filter((r: { status: string }) => r.status === "PENDING")
					.slice()
					.reverse()[0];
				const target: { id: string } | undefined = running ?? nextQueued;
				if (target) setViewId((prev) => (prev === target.id ? prev : target.id));
			} catch {}
		};

		fetchRuns();
		const interval = setInterval(fetchRuns, 3000);
		return () => clearInterval(interval);
	}, []);

	if (!viewId) {
		return (
			<div className="space-y-4 py-20 text-center">
				<div className="flex items-center justify-center gap-2 font-bold text-slate-200 text-xl">
					<Radio className="h-6 w-6 text-slate-500" />
					<span>No live or queued runs</span>
				</div>
				<p className="text-slate-400 text-sm">
					This page follows the running benchmark and hops to the next queued run automatically.
				</p>
				<Link href="/reports" className="text-sky-400 underline">
					All Reports
				</Link>
			</div>
		);
	}

	return <BenchmarkView key={viewId} id={viewId} />;
}
