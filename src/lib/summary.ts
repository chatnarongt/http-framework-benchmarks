import { ALL_TEST_TYPES, type DatabaseType, type TestType } from "./engine/types";

export interface SummaryRunResult {
  testType: string;
  requestPerSecond: number;
  latencyAverageMs: number;
  cpuPeakPercent: number;
  memPeakPercent: number;
  memPeakUsage?: number;
  dbPeakConnectionPercent: number;
}

export interface SummaryRun {
  status: string;
  database: string;
  repoName: string;
  results: SummaryRunResult[];
}

export interface SummaryRow {
  testType: TestType;
  database: DatabaseType;
  framework: string;
  requestPerSecond: number;
  latencyAverageMs: number;
  cpuPeakPercent: number;
  memPeakPercent: number;
  memPeakUsage: number;
  dbPeakConnectionPercent: number;
}

const METRICS = [
  "requestPerSecond",
  "latencyAverageMs",
  "cpuPeakPercent",
  "memPeakPercent",
  "dbPeakConnectionPercent",
] as const;

type Metric = (typeof METRICS)[number];

const BETTER: Record<Metric, (a: number, b: number) => number> = {
  requestPerSecond: Math.max,
  latencyAverageMs: Math.min,
  cpuPeakPercent: Math.min,
  memPeakPercent: Math.min,
  dbPeakConnectionPercent: Math.min,
};

type BestRow = {
  testType: TestType;
  database: string;
  framework: string;
  memPeakUsage?: number;
} & Partial<Record<Metric, number>>;

export function aggregateSummary(runs: SummaryRun[]): SummaryRow[] {
  const best = new Map<string, BestRow>();

  for (const run of runs) {
    if (run.status !== "COMPLETED") continue;
    const framework = run.repoName || `${run.database}-unknown`;
    for (const result of run.results) {
      const testType = ALL_TEST_TYPES.find((t) => t === result.testType);
      if (!testType) continue;
      const key = `${testType}|${run.database}|${framework}`;
      const row: BestRow = best.get(key) ?? {
        testType,
        database: run.database,
        framework,
      };
      for (const metric of METRICS) {
        const value = result[metric];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const prev = row[metric];
        const best = prev === undefined ? value : BETTER[metric](prev, value);
        row[metric] = best;
        if (metric === "memPeakPercent" && best === value && result.memPeakUsage !== undefined) {
          row.memPeakUsage = result.memPeakUsage;
        }
      }
      best.set(key, row);
    }
  }

  const rows: SummaryRow[] = [];
  for (const row of best.values()) {
    rows.push({
      testType: row.testType,
      database: row.database as DatabaseType,
      framework: row.framework,
      requestPerSecond: row.requestPerSecond ?? 0,
      latencyAverageMs: row.latencyAverageMs ?? 0,
      cpuPeakPercent: row.cpuPeakPercent ?? 0,
      memPeakPercent: row.memPeakPercent ?? 0,
      memPeakUsage: row.memPeakUsage ?? 0,
      dbPeakConnectionPercent: row.dbPeakConnectionPercent ?? 0,
    });
  }

  return rows.sort(
    (a, b) =>
      ALL_TEST_TYPES.indexOf(a.testType) - ALL_TEST_TYPES.indexOf(b.testType) ||
      a.database.localeCompare(b.database) ||
      a.framework.localeCompare(b.framework)
  );
}
