export type DatabaseType = "postgres" | "mssql" | "mongodb";

export type TestType =
  | "plaintext"
  | "json"
  | "read-one"
  | "read-many"
  | "create-one"
  | "create-many"
  | "update-one"
  | "update-many"
  | "delete-one"
  | "delete-many";

export const ALL_TEST_TYPES: TestType[] = [
  "plaintext",
  "json",
  "read-one",
  "read-many",
  "create-one",
  "create-many",
  "update-one",
  "update-many",
  "delete-one",
  "delete-many",
];

export function extractRepoName(urlOrPath: string): string {
  const clean = urlOrPath.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const parts = clean.split(/[/\\]/);
  return parts[parts.length - 1] || "benchmark-app";
}

export interface TypeWorkloadConfig {
  vus?: number;
  totalRecords?: number;
}

export interface BenchmarkConfig {
  repoName?: string;
  repoUrl: string;
  database: DatabaseType;
  types: TestType[];
  vus: number;
  totalRecords: number;
  typeWorkloads?: Partial<Record<TestType, TypeWorkloadConfig>>;
  maxPoolSize: number;
  appCpuLimit: string;
  appMemLimit: string;
  dbCpuLimit: string;
  dbMemLimit: string;
}

export const DEFAULT_BENCHMARK_CONFIG: Readonly<
  Pick<
    BenchmarkConfig,
    | "repoUrl"
    | "database"
    | "vus"
    | "totalRecords"
    | "maxPoolSize"
    | "appCpuLimit"
    | "appMemLimit"
    | "dbCpuLimit"
    | "dbMemLimit"
  >
> = Object.freeze({
  repoUrl: "https://github.com/chatnarongt/nestjs-platform-express-node.git",
  database: "postgres",
  vus: 100,
  totalRecords: 100000,
  maxPoolSize: 100,
  appCpuLimit: "1",
  appMemLimit: "512Mi",
  dbCpuLimit: "4",
  dbMemLimit: "8Gi",
});

export interface CollectedMetrics {
  totalRequests: number;
  requestPerSecond: number;
  latencyAverageMs: number;
  latencyMaxMs: number;
  latencyMinMs: number;
  errorCount: number;

  cpuIdleUsage: number;
  cpuIdlePercent: number;
  cpuPeakUsage: number;
  cpuPeakPercent: number;

  memIdleUsage: number;
  memIdlePercent: number;
  memPeakUsage: number;
  memPeakPercent: number;

  dbCpuIdleUsage: number;
  dbCpuIdlePercent: number;
  dbCpuPeakUsage: number;
  dbCpuPeakPercent: number;

  dbMemIdleUsage: number;
  dbMemIdlePercent: number;
  dbMemPeakUsage: number;
  dbMemPeakPercent: number;

  dbIdleConnectionUsage: number;
  dbIdleConnectionPercent: number;
  dbPeakConnectionUsage: number;
  dbPeakConnectionPercent: number;

  rawMetrics?: string;
}
