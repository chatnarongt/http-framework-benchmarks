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
