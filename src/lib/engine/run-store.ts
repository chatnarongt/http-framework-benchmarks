import { emitLog, emitStatus } from "./events";

export type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED";

export interface RunRecordUpdate {
  status?: RunStatus;
  error?: string;
}

/** Persistence boundary for run-record writes; real adapter wraps prisma. */
export interface RunRecordSink {
  update(runId: string, data: { logs?: string; status?: string; error?: string }): Promise<unknown>;
}

export interface RunStore {
  appendLog(message: string): Promise<void>;
  setStatus(status: RunStatus, options?: { error?: string }): Promise<void>;
}

export class PrismaRunRecordSink implements RunRecordSink {
  constructor(private prisma: { benchmarkRun: { update(args: any): Promise<unknown> } }) {}
  update(runId: string, data: { logs?: string; status?: string; error?: string }) {
    return this.prisma.benchmarkRun.update({ where: { id: runId }, data });
  }
}

export class RunStoreImpl implements RunStore {
  private logs: string;

  constructor(
    private runId: string,
    private sink: RunRecordSink,
    initialLogs: string = ""
  ) {
    this.logs = initialLogs;
  }

  async appendLog(message: string): Promise<void> {
    this.logs += message;
    emitLog(this.runId, message);
    await this.sink.update(this.runId, { logs: this.logs });
  }

  async setStatus(status: RunStatus, options?: { error?: string }): Promise<void> {
    const data: { status: string; error?: string } = { status };
    if (options?.error !== undefined) data.error = options.error;
    await this.sink.update(this.runId, data);
    emitStatus(this.runId, status);
  }
}

export function createRunStore(
  runId: string,
  sink: RunRecordSink,
  initialLogs: string = ""
): RunStore {
  return new RunStoreImpl(runId, sink, initialLogs);
}

export const TERMINAL_STATUSES: readonly string[] = ["COMPLETED", "FAILED", "STOPPED"];

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Polls until every id reaches a terminal status. Deleting a run row before its
 * orchestrator teardown finishes orphans the Kubernetes resources it created,
 * so callers that wipe runs must wait for this first.
 * Returns false on timeout rather than lying about completion.
 */
export async function waitForTerminalStatus(
  fetchStatuses: (ids: string[]) => Promise<{ id: string; status: string }[]>,
  ids: string[],
  timeoutMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = Date.now
): Promise<boolean> {
  const deadline = now() + timeoutMs;
  for (;;) {
    const rows = await fetchStatuses(ids);
    if (rows.length >= ids.length && rows.every((r) => isTerminalStatus(r.status))) return true;
    if (now() >= deadline) return false;
    await sleep(250);
  }
}
