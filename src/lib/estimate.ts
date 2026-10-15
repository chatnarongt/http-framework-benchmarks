import type { TestType, TypeWorkloadConfig } from "./engine/types";

// Rough per-run overheads for the formula fallback (used when a repo has no
// completed history yet). Calibrated against typical in-cluster runs.
export const SETUP_SECONDS = 180; // docker build, DB provision, deploy, teardown, rollout waits
export const DB_RECREATE_SECONDS = 30; // per DB test type: drop/reseed world table
export const TYPE_OVERHEAD_SECONDS = 5; // k6 pod create + idle sampling per test type

// ponytail: flat assumed latency per measured iteration — historical RPS
// samples per type would tighten this (fold into TargetRepo timing later).
const DB_MS_PER_ITERATION = 10;
const PLAIN_MS_PER_ITERATION = 2;

const isDbTest = (t: TestType) => t !== "plaintext" && t !== "json";
const isManyTest = (t: TestType) =>
	t === "read-many" || t === "create-many" || t === "update-many" || t === "delete-many";

/** Mirrors the measured k6 iteration budget in engine/k6-script.ts. */
export function measuredIterations(testType: TestType, typeRecords: number): number {
	return isManyTest(testType) ? Math.ceil(typeRecords / 20) : typeRecords;
}

export interface EstimateInput {
	types: TestType[];
	typeWorkloads?: Partial<Record<TestType, TypeWorkloadConfig>>;
	vus: number;
	totalRecords: number;
	warmupSeconds: number;
	cooldownSeconds: number;
}

/** Seconds for one run when no historical duration exists for its repo. */
export function estimateRunSeconds(input: EstimateInput): number {
	let total = SETUP_SECONDS;
	for (const testType of input.types) {
		const workload = input.typeWorkloads?.[testType];
		const vus = Math.max(workload?.vus ?? input.vus, 1);
		const records = workload?.totalRecords ?? input.totalRecords;
		const iterations = measuredIterations(testType, records);
		const ms = isDbTest(testType) ? DB_MS_PER_ITERATION : PLAIN_MS_PER_ITERATION;
		const measuredSeconds = (iterations * ms) / vus / 1000;
		total +=
			(isDbTest(testType) ? DB_RECREATE_SECONDS : 0) +
			input.warmupSeconds +
			input.cooldownSeconds +
			TYPE_OVERHEAD_SECONDS +
			measuredSeconds;
	}
	return total;
}

/**
 * Seconds for a whole batch: runCount repeats per repo, round-robin order does
 * not affect total. Per-repo historical average wins over the formula.
 */
export function estimateBatchSeconds(
	input: EstimateInput & { repoAvgDurationsMs: (number | null)[]; runCount: number },
): number {
	const formulaSeconds = estimateRunSeconds(input);
	let total = 0;
	for (const avgDurationMs of input.repoAvgDurationsMs) {
		const perRunSeconds = avgDurationMs != null ? avgDurationMs / 1000 : formulaSeconds;
		total += input.runCount * perRunSeconds;
	}
	return total;
}

/** `20 minutes`, `1 hour 20 minutes` … label adds the `~` prefix. */
export function formatDuration(totalSeconds: number): string {
	const minutes = Math.max(1, Math.round(totalSeconds / 60));
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
	if (rest === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
	return `${hours} hour${hours === 1 ? "" : "s"} ${rest} minute${rest === 1 ? "" : "s"}`;
}
