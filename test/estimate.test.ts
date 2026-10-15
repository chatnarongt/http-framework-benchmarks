import assert from "node:assert";
import type { TestType } from "../src/lib/engine/types";
import {
	DB_RECREATE_SECONDS,
	estimateBatchSeconds,
	estimateRunSeconds,
	formatDuration,
	measuredIterations,
	SETUP_SECONDS,
	TYPE_OVERHEAD_SECONDS,
} from "../src/lib/estimate";

console.log(
	"estimate: iteration budget, formula fallback, historical batch ETA, duration format...",
);

// measuredIterations mirrors engine/k6-script.ts (many-op types batch 20 per request).
assert.strictEqual(measuredIterations("read-one", 1000), 1000);
assert.strictEqual(measuredIterations("update-many", 1000), 50);
assert.strictEqual(measuredIterations("delete-many", 21), 2);

const base = {
	types: ["plaintext"] as const,
	typeWorkloads: undefined,
	vus: 100,
	totalRecords: 1000,
	warmupSeconds: 0,
	cooldownSeconds: 0,
};

// plaintext: setup + type overhead + 1000 iter * 2ms / 100 vus
assert.strictEqual(
	estimateRunSeconds({ ...base, types: ["plaintext"] }),
	SETUP_SECONDS + TYPE_OVERHEAD_SECONDS + 0.02,
);

// db type: same but 10ms per iter and DB recreate on top
assert.strictEqual(
	estimateRunSeconds({ ...base, types: ["read-one"] }),
	SETUP_SECONDS + TYPE_OVERHEAD_SECONDS + DB_RECREATE_SECONDS + 0.1,
);

// warmup/cooldown apply per type
assert.strictEqual(
	estimateRunSeconds({
		...base,
		types: ["plaintext", "json"],
		warmupSeconds: 30,
		cooldownSeconds: 10,
	}),
	SETUP_SECONDS + 2 * (TYPE_OVERHEAD_SECONDS + 30 + 10 + 0.02),
);

// per-type workload overrides vus/totalRecords
assert.strictEqual(
	estimateRunSeconds({
		...base,
		types: ["read-one"],
		typeWorkloads: { "read-one": { vus: 200, totalRecords: 400 } },
	}),
	SETUP_SECONDS + TYPE_OVERHEAD_SECONDS + DB_RECREATE_SECONDS + 0.02,
);

const batchInput = {
	runCount: 2,
	types: ["plaintext"] as TestType[],
	typeWorkloads: undefined,
	vus: 100,
	totalRecords: 1000,
	warmupSeconds: 0,
	cooldownSeconds: 0,
};
const formulaSeconds = estimateRunSeconds(batchInput);

// historical average wins per repo; formula fills repos without history
assert.strictEqual(
	estimateBatchSeconds({ ...batchInput, repoAvgDurationsMs: [null, 300_000] }),
	2 * formulaSeconds + 2 * 300,
);

// all-history batch is exact
assert.strictEqual(estimateBatchSeconds({ ...batchInput, repoAvgDurationsMs: [60_000] }), 120);

// formatDuration matches the button label style
assert.strictEqual(formatDuration(20 * 60), "20 minutes");
assert.strictEqual(formatDuration(80 * 60), "1 hour 20 minutes");
assert.strictEqual(formatDuration(60 * 60), "1 hour");
assert.strictEqual(formatDuration(3 * 3600), "3 hours");
assert.strictEqual(formatDuration(60), "1 minute");
assert.strictEqual(formatDuration(45), "1 minute");
assert.strictEqual(formatDuration(3660), "1 hour 1 minute");

console.log("estimate: all assertions passed");
