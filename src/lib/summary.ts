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

export type AggMode = "best" | "avg";

export type SummaryAggregate = Record<AggMode, SummaryRow[]>;

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

type Stat = { best: number; sum: number; count: number };
type UsageStat = { best: number; sum: number; count: number };

type AccRow = {
	testType: TestType;
	database: string;
	framework: string;
	stats: Partial<Record<Metric, Stat>>;
	usage?: UsageStat;
};

function toRow(row: AccRow, mode: AggMode): SummaryRow {
	const pick = (metric: Metric) => {
		const stat = row.stats[metric];
		if (!stat) return 0;
		return mode === "best" ? stat.best : stat.sum / stat.count;
	};
	const usage = row.usage;
	return {
		testType: row.testType,
		database: row.database as DatabaseType,
		framework: row.framework,
		requestPerSecond: pick("requestPerSecond"),
		latencyAverageMs: pick("latencyAverageMs"),
		cpuPeakPercent: pick("cpuPeakPercent"),
		memPeakPercent: pick("memPeakPercent"),
		memPeakUsage: usage ? (mode === "best" ? usage.best : usage.sum / usage.count) : 0,
		dbPeakConnectionPercent: pick("dbPeakConnectionPercent"),
	};
}

export function aggregateSummary(runs: SummaryRun[]): SummaryAggregate {
	const groups = new Map<string, AccRow>();

	for (const run of runs) {
		if (run.status !== "COMPLETED") continue;
		const framework = run.repoName || `${run.database}-unknown`;
		for (const result of run.results) {
			const testType = ALL_TEST_TYPES.find((t) => t === result.testType);
			if (!testType) continue;
			const key = `${testType}|${run.database}|${framework}`;
			const row: AccRow = groups.get(key) ?? {
				testType,
				database: run.database,
				framework,
				stats: {},
			};
			for (const metric of METRICS) {
				const value = result[metric];
				if (typeof value !== "number" || !Number.isFinite(value)) continue;
				const stat: Stat = row.stats[metric] ?? { best: value, sum: 0, count: 0 };
				stat.best = BETTER[metric](stat.best, value);
				stat.sum += value;
				stat.count += 1;
				row.stats[metric] = stat;
				if (metric === "memPeakPercent" && result.memPeakUsage !== undefined) {
					const usage: UsageStat = row.usage ?? { best: result.memPeakUsage, sum: 0, count: 0 };
					if (stat.best === value) usage.best = result.memPeakUsage;
					usage.sum += result.memPeakUsage;
					usage.count += 1;
					row.usage = usage;
				}
			}
			groups.set(key, row);
		}
	}

	const build = (mode: AggMode) =>
		[...groups.values()]
			.map((row) => toRow(row, mode))
			.sort(
				(a, b) =>
					ALL_TEST_TYPES.indexOf(a.testType) - ALL_TEST_TYPES.indexOf(b.testType) ||
					a.database.localeCompare(b.database) ||
					a.framework.localeCompare(b.framework),
			);

	return { best: build("best"), avg: build("avg") };
}
