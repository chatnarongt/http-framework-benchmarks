import { spawnSync } from "node:child_process";

const suites = [
  "test/run-context.test.ts",
  "test/database-profiles.test.ts",
  "test/input-validation.test.ts",
  "test/fake-cluster.test.ts",
  "test/peak-tracker.test.ts",
  "test/run-store.test.ts",
  "test/summary.test.ts",
  "test/orchestrator.test.ts",
  "test/self-check.ts",
];

const failed: string[] = [];

for (const suite of suites) {
  console.log(`\n===== ${suite} =====`);
  const res = spawnSync("bun", [suite], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (res.status !== 0) failed.push(suite);
}

if (failed.length > 0) {
  console.error(`\nFAILED suites: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\nAll test suites passed!");
