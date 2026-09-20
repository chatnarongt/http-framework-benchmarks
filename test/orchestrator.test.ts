import assert from "node:assert";
import { executeBenchmark } from "../src/lib/engine/runner";
import { FakeCluster } from "../src/lib/engine/fake-cluster";
import { RunRecordSink } from "../src/lib/engine/run-store";
import { BenchmarkQueue } from "../src/lib/engine/queue";
import { BenchmarkConfig, TestType } from "../src/lib/engine/types";

const RUN_ID = "orch-test-0001";

function makeConfig(types: TestType[] = ["plaintext", "read-one"]): BenchmarkConfig {
  return {
    repoName: "demo-app",
    repoUrl: "https://github.com/x/demo-app.git",
    database: "postgres",
    types,
    vus: 10,
    totalRecords: 100,
    maxPoolSize: 20,
    appCpuLimit: "1",
    appMemLimit: "256Mi",
    dbCpuLimit: "2",
    dbMemLimit: "2Gi",
  };
}

interface SinkRecord {
  logs: string;
  status: string;
  error: string | null;
}

function makeSink(): RunRecordSink & { rows: Map<string, SinkRecord> } {
  const rows = new Map<string, SinkRecord>();
  return {
    rows,
    async update(id: string, data: any) {
      const prev = rows.get(id) ?? { logs: "", status: "PENDING", error: null };
      rows.set(id, { ...prev, ...data });
    },
  };
}

interface CollectedResult {
  benchmarkRunId: string;
  testType: string;
  [field: string]: any;
}

function makeDeps(fake: FakeCluster, sink: ReturnType<typeof makeSink>) {
  const results: CollectedResult[] = [];
  return {
    deps: {
      cluster: fake,
      sink,
      writeResult: async (data: any) => {
        results.push(data);
      },
      sleep: async (_ms: number) => {},
    },
    results,
  };
}

function k6SummaryLogs(podName: string) {
  return [
    "some k6 output",
    "K6_JSON_SUMMARY_START",
    JSON.stringify({
      metrics: {
        http_reqs: { values: { count: 100, rate: 500.25 } },
        http_req_duration: { values: { avg: 2.5, max: 40.25, min: 0.25 } },
        http_req_failed: { values: { passes: 0 } },
      },
    }),
    "K6_JSON_SUMMARY_END",
  ].join("\n");
}

async function testFullRunLifecycle() {
  console.log("orchestrator: full run through fake cluster...");
  const fake = new FakeCluster();
  const sink = makeSink();
  const { deps, results } = makeDeps(fake, sink);
  const suffix = RUN_ID.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-8);
  fake.stdLogs[`k6-${suffix}-plaintext`] = k6SummaryLogs("x");
  fake.stdLogs[`k6-${suffix}-read-one`] = k6SummaryLogs("x");

  await executeBenchmark(RUN_ID, makeConfig(), undefined, deps);

  const row = sink.rows.get(RUN_ID);
  assert.strictEqual(row?.status, "COMPLETED");
  assert.ok(row?.logs.includes("[Orchestrator]"));
  assert.ok(row?.logs.includes("[Kubernetes]"));
  assert.ok(row?.logs.includes("[k6]"));
  assert.ok(row?.logs.includes("[Metrics]"));
  assert.ok(row?.logs.includes("[Cleanup]"));

  assert.strictEqual(results.length, 2, "one result row per test type");
  const byType = new Map(results.map((r) => [r.testType, r]));
  for (const type of ["plaintext", "read-one"]) {
    const r = byType.get(type);
    assert.strictEqual(r?.benchmarkRunId, RUN_ID);
    assert.strictEqual(r?.totalRequests, 100);
    assert.strictEqual(r?.requestPerSecond, 500.25);
    assert.strictEqual(r?.latencyAverageMs, 2.5);
    assert.strictEqual(r?.latencyMaxMs, 40.25);
    assert.strictEqual(r?.latencyMinMs, 0.25);
    assert.strictEqual(r?.errorCount, 0);
    // metric dimensions present
    for (const f of [
      "cpuIdleUsage", "cpuPeakUsage", "cpuIdlePercent", "cpuPeakPercent",
      "memIdleUsage", "memPeakUsage", "memIdlePercent", "memPeakPercent",
      "dbCpuIdleUsage", "dbCpuPeakUsage", "dbCpuIdlePercent", "dbCpuPeakPercent",
      "dbMemIdleUsage", "dbMemPeakUsage", "dbMemIdlePercent", "dbMemPeakPercent",
      "dbIdleConnectionUsage", "dbPeakConnectionUsage", "dbIdleConnectionPercent", "dbPeakConnectionPercent",
    ]) {
      assert.ok(r![f] !== undefined, `result must carry ${f}`);
    }
    assert.ok(r!.rawMetrics.includes("requestPerSecond"), "rawMetrics persists the parsed k6 summary");
  }

  // teardown: every resource the run created is gone
  assert.strictEqual(fake.remainingResourceCount(), 0, "no leaked cluster resources after completion");
  // image was built through the seam
  assert.deepStrictEqual(fake.builtImages, [`demo-app:${suffix}`]);
  console.log("full run tests passed.");
}

async function testFreshDatabasePerTestType() {
  console.log("orchestrator: fresh database + app restart per db test type...");
  const fake = new FakeCluster();
  const sink = makeSink();
  const { deps } = makeDeps(fake, sink);
  const suffix = RUN_ID.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-8);
  fake.stdLogs[`k6-${suffix}-read-one`] = k6SummaryLogs("x");

  await executeBenchmark(RUN_ID, makeConfig(["read-one"]), undefined, deps);

  // initial db deploy + per-test fresh db redeploy = 2 applies touching the db deployment
  const dbApplies = fake.appliedManifests.filter((m: string) =>
    m.includes(`name: postgres-deployment-${suffix}`)
  );
  assert.strictEqual(dbApplies.length, 2, "initial deploy + fresh redeploy run the same profile path");
  // app rollout restart happened for the db-backed test
  assert.ok(fake.restartedDeployments.includes(`app-deployment-${suffix}`));
  assert.strictEqual(fake.remainingResourceCount(), 0);
  console.log("fresh database tests passed.");
}

async function testPlaintextSkipsDatabaseRecreate() {
  console.log("orchestrator: plaintext never recreates the database per-test...");
  const fake = new FakeCluster();
  const sink = makeSink();
  const { deps } = makeDeps(fake, sink);
  const suffix = RUN_ID.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-8);
  fake.stdLogs[`k6-${suffix}-plaintext`] = k6SummaryLogs("x");

  await executeBenchmark(RUN_ID, makeConfig(["plaintext"]), undefined, deps);

  const dbApplies = fake.appliedManifests.filter((m: string) =>
    m.includes(`name: postgres-deployment-${suffix}`)
  );
  assert.strictEqual(dbApplies.length, 1, "initial deploy only — no per-test recreation for plaintext");
  assert.ok(!fake.restartedDeployments.includes(`app-deployment-${suffix}`), "no app restart for plaintext");
  assert.strictEqual(sink.rows.get(RUN_ID)?.status, "COMPLETED");
  console.log("plaintext skip tests passed.");
}

async function testAbortBeforeStart() {
  console.log("orchestrator: abort at first phase boundary...");
  const fake = new FakeCluster();
  const sink = makeSink();
  const { deps, results } = makeDeps(fake, sink);
  const controller = new AbortController();
  controller.abort();

  await executeBenchmark(RUN_ID, makeConfig(), controller.signal, deps);

  const row = sink.rows.get(RUN_ID);
  assert.strictEqual(row?.status, "STOPPED");
  assert.ok(row?.error?.includes("stopped by user"));
  assert.strictEqual(results.length, 0);
  assert.strictEqual(fake.remainingResourceCount(), 0, "teardown must still run for aborted runs");
  console.log("abort tests passed.");
}

async function testFailureStatusAndTeardown() {
  console.log("orchestrator: failed build -> FAILED status, teardown still runs...");
  const fake = new FakeCluster();
  const sink = makeSink();
  const { deps, results } = makeDeps(fake, sink);
  class FailingBuildCluster extends FakeCluster {
    async buildImage(_repoUrl: string, _imageTag: string): Promise<void> {
      throw new Error("docker build exploded");
    }
  }
  const failingFake = new FailingBuildCluster();
  const failingDeps = { ...deps, cluster: failingFake };

  await executeBenchmark(RUN_ID, makeConfig(), undefined, failingDeps);

  const row = sink.rows.get(RUN_ID);
  assert.strictEqual(row?.status, "FAILED");
  assert.strictEqual(row?.error, "docker build exploded");
  assert.strictEqual(results.length, 0);
  assert.strictEqual(failingFake.remainingResourceCount(), 0, "failed runs must not leak resources");
  console.log("failure path tests passed.");
}

async function testQueueRealSeam() {
  console.log("queue: real queue through its own seam...");
  const sink = makeSink();
  const order: string[] = [];
  let active = 0;
  let maxActive = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));

  const execute = async (runId: string, _config: BenchmarkConfig, signal?: AbortSignal) => {
    active++;
    maxActive = Math.max(maxActive, active);
    if (runId === "q1") await gate;
    else await new Promise((r) => setTimeout(r, 5));
    if (signal?.aborted) {
      active--;
      throw new Error("Benchmark stopped by user");
    }
    order.push(runId);
    active--;
  };

  const q = new BenchmarkQueue({
    execute,
    sink,
    loadLogs: async (id) => sink.rows.get(id)?.logs ?? "",
  });
  const p1 = q.enqueue("q1", makeConfig(["plaintext"]));
  const p2 = q.enqueue("q2", makeConfig(["plaintext"]));
  const p3 = q.enqueue("q3", makeConfig(["plaintext"]));

  // While q1 is active: q2/q3 queued; cancel q3 from the queue
  assert.strictEqual(q.getCurrentRunId(), "q1");
  assert.strictEqual(q.getQueueLength(), 2);
  const cancelled = await q.cancel("q3");
  assert.strictEqual(cancelled, true);
  assert.strictEqual(q.getQueueLength(), 1);
  assert.strictEqual(sink.rows.get("q3")?.status, "STOPPED");

  // Abort the active run
  const aborted = await q.cancel("q1");
  assert.strictEqual(aborted, true);

  release();
  await Promise.all([p1, p2, p3]);
  await new Promise((r) => setTimeout(r, 30));

  assert.strictEqual(maxActive, 1, "strict sequential execution");
  assert.deepStrictEqual(order, ["q2"], "q1 aborted, q3 cancelled, q2 ran");

  // queued message appends to any existing logs, never overwrites
  const q2row = sink.rows.get("q2");
  assert.ok(q2row?.logs.includes("[Queue]"), "queued message written via store");
  // active-run stop message appends too, preserving prior logs
  assert.ok(
    sink.rows.get("q1")?.logs.includes("Stop signal received for active job q1"),
    "active-run stop message appended"
  );
  console.log("queue seam tests passed.");
}

async function main() {
  await testFullRunLifecycle();
  await testFreshDatabasePerTestType();
  await testPlaintextSkipsDatabaseRecreate();
  await testAbortBeforeStart();
  await testFailureStatusAndTeardown();
  await testQueueRealSeam();
  console.log("All orchestrator/queue tests passed!");
}

main().catch((err) => {
  console.error("orchestrator test failed:", err);
  process.exit(1);
});
