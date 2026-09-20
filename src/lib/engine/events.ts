import { EventEmitter } from "node:events";

class RunEventEmitter extends EventEmitter {}

export const runEvents = new RunEventEmitter();
runEvents.setMaxListeners(100);

export function emitLog(runId: string, message: string) {
  runEvents.emit(`log:${runId}`, message);
}

export function emitStatus(runId: string, status: string) {
  runEvents.emit(`status:${runId}`, status);
}
