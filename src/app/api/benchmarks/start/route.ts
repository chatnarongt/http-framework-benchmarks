import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { benchmarkQueue } from "@/lib/engine/queue";
import { DEFAULT_BENCHMARK_CONFIG, extractRepoName } from "@/lib/engine/types";
import {
  boundedInt,
  validDatabase,
  validLimit,
  validRepoUrl,
  validTestTypes,
} from "@/lib/engine/input-validation";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const repoUrl = validRepoUrl(body.repoUrl);
    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl must be a git URL or a local path" },
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

    const repoName = String(body.repoName || extractRepoName(repoUrl)).trim();
    const vus = boundedInt(body.vus, 1, 1000, DEFAULT_BENCHMARK_CONFIG.vus);
    const totalRecords = boundedInt(body.totalRecords, 1, 10_000_000, DEFAULT_BENCHMARK_CONFIG.totalRecords);
    const maxPoolSize = boundedInt(body.maxPoolSize, 1, 10_000, DEFAULT_BENCHMARK_CONFIG.maxPoolSize);

    const appCpuLimit = validLimit(body.appCpuLimit, DEFAULT_BENCHMARK_CONFIG.appCpuLimit);
    const appMemLimit = validLimit(body.appMemLimit, DEFAULT_BENCHMARK_CONFIG.appMemLimit);
    const dbCpuLimit = validLimit(body.dbCpuLimit, DEFAULT_BENCHMARK_CONFIG.dbCpuLimit);
    const dbMemLimit = validLimit(body.dbMemLimit, DEFAULT_BENCHMARK_CONFIG.dbMemLimit);

    const typeWorkloads =
      body.typeWorkloads && typeof body.typeWorkloads === "object" ? body.typeWorkloads : undefined;

    const run = await prisma.benchmarkRun.create({
      data: {
        repoName,
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
    });

    const config = {
      repoName,
      repoUrl,
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
    };

    // Enqueue job for single sequential execution
    benchmarkQueue.enqueue(run.id, config).catch((err) => {
      console.error(`Failed to enqueue benchmark run ${run.id}:`, err);
    });

    return NextResponse.json({ runId: run.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
