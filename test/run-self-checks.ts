import { spawnSync } from "node:child_process";

const suites = [
  "./run-context.test.ts",
  "./database-profiles.test.ts",
  "./input-validation.test.ts",
  "./fake-cluster.test.ts",
  "./peak-tracker.test.ts",
  "./run-store.test.ts",
  "./orchestrator.test.ts",
  "./self-check.ts",
];

const failed: string[] = [];

for (const suite of suites) {
  console.log(`\n===== ${suite} =====`);
  const res = spawnSync("bun", [suite], {
    cwd: process.cwd() + "/test",
    stdio: "inherit",
  });
  if (res.status !== 0) failed.push(suite);
}

if (failed.length > 0) {
  console.error(`\nFAILED suites: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\nAll test suites passed!");
