import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aggregateSummary } from "@/lib/summary";

export async function GET() {
	try {
		const runs = await prisma.benchmarkRun.findMany({
			where: { status: "COMPLETED" },
			orderBy: { createdAt: "asc" },
			select: {
				status: true,
				database: true,
				repoName: true,
				results: {
					select: {
						testType: true,
						requestPerSecond: true,
						latencyAverageMs: true,
						cpuPeakPercent: true,
						memPeakPercent: true,
						memPeakUsage: true,
						dbPeakConnectionPercent: true,
					},
				},
			},
		});

		return NextResponse.json(aggregateSummary(runs));
	} catch (err: any) {
		return NextResponse.json({ error: err.message }, { status: 500 });
	}
}
