import assert from "node:assert";
import { aggregateSummary, type SummaryRun } from "../src/lib/summary";

console.log("summary: aggregation of best and average scores per framework/database/testType...");

const runs: SummaryRun[] = [
	{
		status: "COMPLETED",
		database: "postgres",
		repoName: "fastify",
		results: [
			{
				testType: "read-one",
				requestPerSecond: 100,
				latencyAverageMs: 20,
				cpuPeakPercent: 80,
				memPeakPercent: 50,
				memPeakUsage: 512,
				dbPeakConnectionPercent: 90,
			},
			{
				testType: "json",
				requestPerSecond: 900,
				latencyAverageMs: 2,
				cpuPeakPercent: 40,
				memPeakPercent: 30,
				dbPeakConnectionPercent: 0,
			},
		],
	},
	{
		status: "COMPLETED",
		database: "postgres",
		repoName: "fastify",
		results: [
			{
				testType: "read-one",
				requestPerSecond: 120,
				latencyAverageMs: 15,
				cpuPeakPercent: 95,
				memPeakPercent: 60,
				memPeakUsage: 256,
				dbPeakConnectionPercent: 70,
			},
		],
	},
	{
		status: "COMPLETED",
		database: "mssql",
		repoName: "fastify",
		results: [
			{
				testType: "read-one",
				requestPerSecond: 50,
				latencyAverageMs: 30,
				cpuPeakPercent: 60,
				memPeakPercent: 40,
				dbPeakConnectionPercent: 20,
			},
		],
	},
	{
		status: "FAILED",
		database: "postgres",
		repoName: "fastify",
		results: [
			{
				testType: "read-one",
				requestPerSecond: 9999,
				latencyAverageMs: 0,
				cpuPeakPercent: 0,
				memPeakPercent: 0,
				dbPeakConnectionPercent: 0,
			},
		],
	},
	{
		status: "COMPLETED",
		database: "postgres",
		repoName: "",
		results: [
			{
				testType: "read-one",
				requestPerSecond: 10,
				latencyAverageMs: 99,
				cpuPeakPercent: 10,
				memPeakPercent: 10,
				dbPeakConnectionPercent: 10,
			},
		],
	},
];

const { best, avg } = aggregateSummary(runs);

const pick = (rows: typeof best) =>
	rows.find(
		(r) => r.testType === "read-one" && r.database === "postgres" && r.framework === "fastify",
	);

// best across runs: max throughput, min latency/resources
const bestRow = pick(best);
assert.ok(bestRow);
assert.strictEqual(bestRow.requestPerSecond, 120);
assert.strictEqual(bestRow.latencyAverageMs, 15);
assert.strictEqual(bestRow.cpuPeakPercent, 80);
assert.strictEqual(bestRow.memPeakPercent, 50);
assert.strictEqual(bestRow.memPeakUsage, 512);
assert.strictEqual(bestRow.dbPeakConnectionPercent, 70);

// average across runs: mean of each metric
const avgRow = pick(avg);
assert.ok(avgRow);
assert.strictEqual(avgRow.requestPerSecond, 110);
assert.strictEqual(avgRow.latencyAverageMs, 17.5);
assert.strictEqual(avgRow.cpuPeakPercent, 87.5);
assert.strictEqual(avgRow.memPeakPercent, 55);
assert.strictEqual(avgRow.memPeakUsage, 384);
assert.strictEqual(avgRow.dbPeakConnectionPercent, 80);

// FAILED runs excluded from both slices
assert.ok(!best.some((r) => r.requestPerSecond === 9999));
assert.ok(!avg.some((r) => r.requestPerSecond === 9999));

// empty repoName falls back
const fallback = best.find((r) => r.framework === "postgres-unknown");
assert.ok(fallback);
assert.strictEqual(fallback.requestPerSecond, 10);
assert.strictEqual(avg.find((r) => r.framework === "postgres-unknown")?.requestPerSecond, 10);

// same test type, separate databases stay separate rows
const fastifyMs = best.find((r) => r.database === "mssql" && r.framework === "fastify");
assert.ok(fastifyMs);
assert.strictEqual(fastifyMs.requestPerSecond, 50);

// unknown test types dropped
assert.ok(!best.some((r) => r.testType === ("bogus" as any)));

// sorted by test type order then database
const keys = (rows: typeof best) => rows.map((r) => `${r.testType}:${r.database}:${r.framework}`);
const expected = [
	"json:postgres:fastify",
	"read-one:mssql:fastify",
	"read-one:postgres:fastify",
	"read-one:postgres:postgres-unknown",
];
assert.deepStrictEqual(keys(best), expected);
assert.deepStrictEqual(keys(avg), expected);

console.log("summary: OK");
