import { NextResponse } from "next/server";
import {
	boundedInt,
	validDatabase,
	validLimit,
	validRepos,
	validTestTypes,
} from "@/lib/engine/input-validation";
import { benchmarkQueue } from "@/lib/engine/queue";
import { DEFAULT_BENCHMARK_CONFIG, extractRepoName } from "@/lib/engine/types";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
	try {
		const body = await req.json();

		// New shape: repos: [{ repoUrl, database }]. Legacy shape: repoUrls + one
		// global database — mapped onto the list so old callers keep working.
		const rawRepos = Array.isArray(body.repos)
			? body.repos
			: (Array.isArray(body.repoUrls) ? body.repoUrls : []).map((u: unknown) => ({
					repoUrl: u,
					database: body.database,
				}));
		const repos = validRepos(rawRepos);
		if (!repos) {
			return NextResponse.json(
				{ error: "repos must contain at least one valid git URL or local path" },
				{ status: 400 },
			);
		}

		const types = validTestTypes(body.types);
		if (!types) {
			return NextResponse.json(
				{ error: "types must contain at least one valid test type" },
				{ status: 400 },
			);
		}

		const vus = boundedInt(body.vus, 1, 1000, DEFAULT_BENCHMARK_CONFIG.vus);
		const totalRecords = boundedInt(
			body.totalRecords,
			1,
			10_000_000,
			DEFAULT_BENCHMARK_CONFIG.totalRecords,
		);
		const maxPoolSize = boundedInt(
			body.maxPoolSize,
			1,
			10_000,
			DEFAULT_BENCHMARK_CONFIG.maxPoolSize,
		);
		const warmupSeconds = boundedInt(
			body.warmupSeconds,
			0,
			3600,
			DEFAULT_BENCHMARK_CONFIG.warmupSeconds,
		);
		const cooldownSeconds = boundedInt(
			body.cooldownSeconds,
			0,
			3600,
			DEFAULT_BENCHMARK_CONFIG.cooldownSeconds,
		);

		const appCpuLimit = validLimit(body.appCpuLimit, DEFAULT_BENCHMARK_CONFIG.appCpuLimit);
		const appMemLimit = validLimit(body.appMemLimit, DEFAULT_BENCHMARK_CONFIG.appMemLimit);
		const dbCpuLimit = validLimit(body.dbCpuLimit, DEFAULT_BENCHMARK_CONFIG.dbCpuLimit);
		const dbMemLimit = validLimit(body.dbMemLimit, DEFAULT_BENCHMARK_CONFIG.dbMemLimit);

		const typeWorkloads =
			body.typeWorkloads && typeof body.typeWorkloads === "object" ? body.typeWorkloads : undefined;

		const runCount = boundedInt(body.runCount, 1, 50, 1);
		if (repos.length * runCount > 50) {
			return NextResponse.json(
				{ error: "repos × runs per repo must not exceed 50 total runs" },
				{ status: 400 },
			);
		}

		// Registry upserts first: the combobox sorts suggestions by real recency.
		await Promise.all(
			repos.map(({ repoUrl, database }) =>
				prisma.targetRepo.upsert({
					where: { repoUrl },
					create: { repoUrl, database },
					update: { database, lastUsedAt: new Date() },
				}),
			),
		);

		// One row per repo per repeat, created atomically: a partial batch must never be enqueued.
		const runs = await prisma.$transaction(
			repos.flatMap(({ repoUrl, database }) =>
				Array.from({ length: runCount }, () =>
					prisma.benchmarkRun.create({
						data: {
							repoName: extractRepoName(repoUrl),
							repoUrl,
							database,
							vus,
							totalRecords,
							maxPoolSize,
							warmupSeconds,
							cooldownSeconds,
							appCpuLimit,
							appMemLimit,
							dbCpuLimit,
							dbMemLimit,
							typeWorkloads: typeWorkloads ? JSON.stringify(typeWorkloads) : null,
							status: "PENDING",
						},
					}),
				),
			),
		);

		for (const run of runs) {
			benchmarkQueue
				.enqueue(run.id, {
					repoName: run.repoName,
					repoUrl: run.repoUrl,
					database: validDatabase(run.database),
					types,
					vus,
					totalRecords,
					typeWorkloads,
					maxPoolSize,
					warmupSeconds,
					cooldownSeconds,
					appCpuLimit,
					appMemLimit,
					dbCpuLimit,
					dbMemLimit,
				})
				.catch((err) => {
					console.error(`Failed to enqueue benchmark run ${run.id}:`, err);
				});
		}

		return NextResponse.json({ runIds: runs.map((r) => r.id) });
	} catch (err: any) {
		return NextResponse.json({ error: err.message }, { status: 400 });
	}
}
