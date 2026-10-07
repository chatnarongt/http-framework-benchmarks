import assert from "node:assert";
import { aggregateSummary, type SummaryRun } from "../src/lib/summary";

console.log("summary: aggregation of best scores per framework/database/testType...");

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

const rows = aggregateSummary(runs);

// best across runs: max throughput, min latency/resources
const fastifyPg = rows.find(
	(r) => r.testType === "read-one" && r.database === "postgres" && r.framework === "fastify",
);
assert.ok(fastifyPg);
assert.strictEqual(fastifyPg.requestPerSecond, 120);
assert.strictEqual(fastifyPg.latencyAverageMs, 15);
assert.strictEqual(fastifyPg.cpuPeakPercent, 80);
assert.strictEqual(fastifyPg.memPeakPercent, 50);
assert.strictEqual(fastifyPg.dbPeakConnectionPercent, 70);

// FAILED runs excluded
assert.ok(!rows.some((r) => r.requestPerSecond === 9999));

// empty repoName falls back
const fallback = rows.find((r) => r.framework === "postgres-unknown");
assert.ok(fallback);
assert.strictEqual(fallback.requestPerSecond, 10);

// same test type, separate databases stay separate rows
const fastifyMs = rows.find((r) => r.database === "mssql" && r.framework === "fastify");
assert.ok(fastifyMs);
assert.strictEqual(fastifyMs.requestPerSecond, 50);

// unknown test types dropped
assert.ok(!rows.some((r) => r.testType === ("bogus" as any)));

// sorted by test type order then database
assert.deepStrictEqual(
	rows.map((r) => `${r.testType}:${r.database}:${r.framework}`),
	[
		"json:postgres:fastify",
		"read-one:mssql:fastify",
		"read-one:postgres:fastify",
		"read-one:postgres:postgres-unknown",
	],
);

console.log("summary: OK");
