"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
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
      <div className="text-center py-20 space-y-4">
        <div className="text-xl font-bold text-slate-200 flex items-center justify-center gap-2">
          <Radio className="w-6 h-6 text-slate-500" />
          <span>No live or queued runs</span>
        </div>
        <p className="text-sm text-slate-400">
          This page follows the running benchmark and hops to the next queued run
          automatically.
        </p>
        <Link href="/reports" className="text-sky-400 underline">
          All Reports
        </Link>
      </div>
    );
  }

  return <BenchmarkView key={viewId} id={viewId} />;
}
