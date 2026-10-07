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
	const clean = urlOrPath
		.trim()
		.replace(/\/+$/, "")
		.replace(/\.git$/, "");
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
	namespace?: string;
	types: TestType[];
	vus: number;
	totalRecords: number;
	typeWorkloads?: Partial<Record<TestType, TypeWorkloadConfig>>;
	warmupSeconds?: number;
	cooldownSeconds?: number;
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
	> & { warmupSeconds: number; cooldownSeconds: number; namespace: string }
> = Object.freeze({
	repoUrl: "https://github.com/chatnarongt/nestjs-platform-express-node.git",
	database: "postgres",
	namespace:
		(typeof process !== "undefined" &&
			(process.env.NEXT_PUBLIC_BENCHMARK_NAMESPACE || process.env.BENCHMARK_NAMESPACE)) ||
		"benchmark",
	vus: 100,
	totalRecords: 100000,
	warmupSeconds: 30,
	cooldownSeconds: 10,
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
