import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { benchmarkQueue } from "@/lib/engine/queue";
import { waitForTerminalStatus } from "@/lib/engine/run-store";

export async function GET() {
  try {
    const runs = await prisma.benchmarkRun.findMany({
      orderBy: [
        {
          createdAt: "desc"
        },
        {
          id: "desc"
        }
      ],
      // logs are unbounded; the list page polls this and never renders them.
      omit: { logs: true },
      include: {
        _count: {
          select: { results: true },
        },
      },
    });

    return NextResponse.json(runs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const WIPE_TIMEOUT_MS = 60_000;

async function fetchStatuses(ids: string[]) {
  return prisma.benchmarkRun.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });
}

export async function DELETE() {
  try {
    // 1. Dequeue pending first: a run finishing mid-wipe must not start the next one.
    const pending = await prisma.benchmarkRun.findMany({
      where: { status: "PENDING" },
      select: { id: true },
    });
    for (const { id } of pending) {
      const handled = await benchmarkQueue.cancel(id);
      // A restart drops in-memory queue entries; those rows would never settle.
      if (!handled) {
        await prisma.benchmarkRun.update({
          where: { id },
          data: { status: "STOPPED", error: "Cleared (no longer owned by the queue)" },
        });
      }
    }

    // 2. Abort the live run. Its teardown logs through this row, so the row must
    //    survive until the orchestrator reaches terminal status.
    const running = await prisma.benchmarkRun.findMany({
      where: { status: "RUNNING" },
      select: { id: true },
    });
    for (const { id } of running) {
      const handled = await benchmarkQueue.cancel(id);
      if (!handled) {
        await prisma.benchmarkRun.update({
          where: { id },
          data: { status: "STOPPED", error: "Cleared (no longer owned by the queue)" },
        });
      }
    }

    const outstanding = [...pending, ...running].map((r) => r.id);
    if (outstanding.length > 0) {
      const settled = await waitForTerminalStatus(fetchStatuses, outstanding, WIPE_TIMEOUT_MS);
      if (!settled) {
        return NextResponse.json(
          {
            error:
              "A running benchmark did not stop in time. Nothing was deleted; retry shortly.",
          },
          { status: 503 }
        );
      }
    }

    // 3. Wipe. BenchmarkResult rows follow via onDelete: Cascade.
    const result = await prisma.benchmarkRun.deleteMany();
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
