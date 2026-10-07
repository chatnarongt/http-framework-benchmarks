import assert from "node:assert";
import { type FilterableRun, filterRuns, type RunFilters } from "../src/lib/run-filters";

console.log("run-filters: name/status/date-range filtering of benchmark runs...");

const runs: FilterableRun[] = [
	{
		id: "aaa111",
		repoName: "fastify",
		status: "COMPLETED",
		createdAt: new Date(2026, 9, 5, 12, 0, 0),
	},
	{
		id: "bbb222",
		repoName: "express",
		status: "FAILED",
		createdAt: new Date(2026, 9, 6, 0, 30, 0),
	},
	{
		id: "ccc333",
		repoName: "",
		status: "PENDING",
		createdAt: new Date(2026, 9, 10, 23, 59, 0),
	},
];

const base: RunFilters = { name: "", status: "all", from: "", to: "" };
const ids = (rows: FilterableRun[]) => rows.map((r) => r.id);

// no filters passes everything through
assert.deepStrictEqual(ids(filterRuns(runs, base)), ["aaa111", "bbb222", "ccc333"]);

// name matches repoName case-insensitively
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, name: "FAST" })), ["aaa111"]);
// name matches id when repoName does not
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, name: "bbb" })), ["bbb222"]);
// empty repoName falls back to id
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, name: "ccc" })), ["ccc333"]);
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, name: "zzz" })), []);

// status filter; "all" passes
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, status: "FAILED" })), ["bbb222"]);
assert.strictEqual(filterRuns(runs, base).length, 3);

// from excludes earlier days but keeps same-day times
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, from: "2026-10-06" })), [
	"bbb222",
	"ccc333",
]);
// to includes whole day
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, to: "2026-10-05" })), ["aaa111"]);
// single-day range is inclusive on both ends
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, from: "2026-10-06", to: "2026-10-06" })), [
	"bbb222",
]);
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, from: "2026-10-05", to: "2026-10-10" })), [
	"aaa111",
	"bbb222",
	"ccc333",
]);

// malformed date strings are ignored
assert.deepStrictEqual(ids(filterRuns(runs, { ...base, from: "not-a-date", to: "2026-13-99" })), [
	"aaa111",
	"bbb222",
	"ccc333",
]);

// filters combine
assert.deepStrictEqual(
	ids(
		filterRuns(runs, {
			name: "a",
			status: "COMPLETED",
			from: "2026-10-05",
			to: "2026-10-05",
		}),
	),
	["aaa111"],
);

console.log("run-filters: OK");
