import assert from "node:assert";
import { RunRecordSink, createRunStore } from "../src/lib/engine/run-store";
import type { RunStore } from "../src/lib/engine/run-store";
import { emitLog, emitStatus, runEvents } from "../src/lib/engine/events";

function makeSink(): RunRecordSink & { rows: Map<string, any> } {
  const rows = new Map<string, any>();
  return {
    rows,
    async update(id: string, data: any) {
      const prev = rows.get(id) ?? { logs: "", status: "PENDING", error: null };
      rows.set(id, { ...prev, ...data });
    },
  };
}

function captureEvents(runId: string) {
  const logs: string[] = [];
  const statuses: string[] = [];
  const onLog = (m: string) => logs.push(m);
  const onStatus = (s: string) => statuses.push(s);
  runEvents.on(`log:${runId}`, onLog);
  runEvents.on(`status:${runId}`, onStatus);
  return { logs, statuses, cleanup: () => {
    runEvents.off(`log:${runId}`, onLog);
    runEvents.off(`status:${runId}`, onStatus);
  } };
}

async function testAppendSemantics() {
  console.log("run-store: append never overwrites...");
  const sink = makeSink();
  sink.rows.set("r1", { logs: "existing\n", status: "PENDING", error: null });
  const store = createRunStore("r1", sink, sink.rows.get("r1").logs);
  const ev = captureEvents("r1");

  await store.appendLog("first line\n");
  await store.appendLog("second line\n");

  assert.strictEqual(sink.rows.get("r1").logs, "existing\nfirst line\nsecond line\n");
  assert.deepStrictEqual(ev.logs, ["first line\n", "second line\n"]);
  ev.cleanup();
  console.log("append semantics tests passed.");
}

async function testStatusTransitions() {
  console.log("run-store: status transitions...");
  const sink = makeSink();
  const store = createRunStore("r2", sink);
  const ev = captureEvents("r2");

  await store.setStatus("RUNNING");
  await store.setStatus("COMPLETED");

  assert.strictEqual(sink.rows.get("r2").status, "COMPLETED");
  assert.deepStrictEqual(ev.statuses, ["RUNNING", "COMPLETED"]);
  ev.cleanup();
  console.log("status transition tests passed.");
}

async function testFailedStatusWithError() {
  console.log("run-store: failure carries error message...");
  const sink = makeSink();
  const store = createRunStore("r3", sink);

  await store.setStatus("FAILED", { error: "rollout timed out" });
  assert.strictEqual(sink.rows.get("r3").status, "FAILED");
  assert.strictEqual(sink.rows.get("r3").error, "rollout timed out");

  await store.setStatus("STOPPED", { error: "Benchmark stopped by user" });
  assert.strictEqual(sink.rows.get("r3").status, "STOPPED");
  console.log("failure status tests passed.");
}

async function testIncrementalPersistence() {
  console.log("run-store: each append persists immediately...");
  const sink = makeSink();
  const store = createRunStore("r4", sink);

  await store.appendLog("a");
  // After the first append, the DB already contains "a" — a crash now keeps it.
  assert.strictEqual(sink.rows.get("r4").logs, "a");
  await store.appendLog("b");
  assert.strictEqual(sink.rows.get("r4").logs, "ab");
  console.log("incremental persistence tests passed.");
}

async function main() {
  await testAppendSemantics();
  await testStatusTransitions();
  await testFailedStatusWithError();
  await testIncrementalPersistence();
  console.log("All run-store tests passed!");
}

main().catch((err) => {
  console.error("run-store test failed:", err);
  process.exit(1);
});
