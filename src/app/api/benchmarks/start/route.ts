import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { benchmarkQueue } from "@/lib/engine/queue";
import { DEFAULT_BENCHMARK_CONFIG, extractRepoName } from "@/lib/engine/types";
import {
  boundedInt,
  validDatabase,
  validLimit,
  validRepoUrls,
  validTestTypes,
} from "@/lib/engine/input-validation";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const repoUrls = validRepoUrls(body.repoUrls);
    if (!repoUrls) {
      return NextResponse.json(
        { error: "repoUrls must contain at least one valid git URL or local path" },
        { status: 400 }
      );
    }

    const types = validTestTypes(body.types);
    if (!types) {
      return NextResponse.json(
        { error: "types must contain at least one valid test type" },
        { status: 400 }
      );
    }

    const database = validDatabase(body.database);

    const vus = boundedInt(body.vus, 1, 1000, DEFAULT_BENCHMARK_CONFIG.vus);
    const totalRecords = boundedInt(body.totalRecords, 1, 10_000_000, DEFAULT_BENCHMARK_CONFIG.totalRecords);
    const maxPoolSize = boundedInt(body.maxPoolSize, 1, 10_000, DEFAULT_BENCHMARK_CONFIG.maxPoolSize);

    const appCpuLimit = validLimit(body.appCpuLimit, DEFAULT_BENCHMARK_CONFIG.appCpuLimit);
    const appMemLimit = validLimit(body.appMemLimit, DEFAULT_BENCHMARK_CONFIG.appMemLimit);
    const dbCpuLimit = validLimit(body.dbCpuLimit, DEFAULT_BENCHMARK_CONFIG.dbCpuLimit);
    const dbMemLimit = validLimit(body.dbMemLimit, DEFAULT_BENCHMARK_CONFIG.dbMemLimit);

    const typeWorkloads =
      body.typeWorkloads && typeof body.typeWorkloads === "object" ? body.typeWorkloads : undefined;

    // One row per repo, created atomically: a partial batch must never be enqueued.
    const runs = await prisma.$transaction(
      repoUrls.map((repoUrl) =>
        prisma.benchmarkRun.create({
          data: {
            repoName: extractRepoName(repoUrl),
            repoUrl,
            database,
            vus,
            totalRecords,
            maxPoolSize,
            appCpuLimit,
            appMemLimit,
            dbCpuLimit,
            dbMemLimit,
            typeWorkloads: typeWorkloads ? JSON.stringify(typeWorkloads) : null,
            status: "PENDING",
          },
        })
      )
    );

    for (const run of runs) {
      benchmarkQueue
        .enqueue(run.id, {
          repoName: run.repoName,
          repoUrl: run.repoUrl,
          database,
          types,
          vus,
          totalRecords,
          typeWorkloads,
          maxPoolSize,
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
