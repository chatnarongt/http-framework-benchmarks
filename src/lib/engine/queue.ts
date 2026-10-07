import { prisma } from "../prisma";
import {
	createRunStore,
	PrismaRunRecordSink,
	type RunRecordSink,
	type RunStore,
} from "./run-store";
import { executeBenchmark } from "./runner";
import { type BenchmarkConfig, extractRepoName } from "./types";

interface QueueItem {
	runId: string;
	config: BenchmarkConfig;
}

export interface QueueDeps {
	execute?: typeof executeBenchmark;
	sink?: RunRecordSink;
	loadLogs?: (runId: string) => Promise<string>;
}

export class BenchmarkQueue {
	private queue: QueueItem[] = [];
	private isProcessing = false;
	private currentRunId: string | null = null;
	private currentAbortController: AbortController | null = null;
	private execute: typeof executeBenchmark;
	private sink: RunRecordSink;
	private loadLogs: (runId: string) => Promise<string>;

	constructor(deps: QueueDeps = {}) {
		this.execute = deps.execute ?? executeBenchmark;
		this.sink = deps.sink ?? new PrismaRunRecordSink(prisma);
		this.loadLogs = deps.loadLogs ?? defaultLoadLogs;
	}

	async storeFor(runId: string): Promise<RunStore> {
		return createRunStore(runId, this.sink, await this.loadLogs(runId));
	}

	public async enqueue(runId: string, config: BenchmarkConfig): Promise<void> {
		const queueLength = this.queue.length + (this.isProcessing ? 1 : 0);
		const repoName = config.repoName || extractRepoName(config.repoUrl);
		const position = this.queue.length + 1;
		this.queue.push({ runId, config });
		this.processNext();

		if (queueLength > 0) {
			const waitMsg = `[Queue] Benchmark job ${runId} [${repoName}] queued (position: ${position}). Waiting for current job${this.currentRunId ? ` (${this.currentRunId})` : ""} to finish...\n`;
			const store = await this.storeFor(runId);
			await store.appendLog(waitMsg);
		}
	}

	public async cancel(runId: string): Promise<boolean> {
		// If currently running, trigger abort
		if (this.currentRunId === runId && this.currentAbortController) {
			const store = await this.storeFor(runId);
			await store.appendLog(
				`\n[Queue] Stop signal received for active job ${runId}. Aborting execution...\n`,
			);
			this.currentAbortController.abort();
			return true;
		}

		// If in queue (pending)
		const index = this.queue.findIndex((item) => item.runId === runId);
		if (index !== -1) {
			this.queue.splice(index, 1);
			const cancelMsg = `\n[Queue] Job ${runId} was cancelled while in queue.\n`;
			const store = await this.storeFor(runId);
			await store.appendLog(cancelMsg);
			await store.setStatus("STOPPED", { error: "Cancelled while in queue" });
			return true;
		}

		return false;
	}

	private async processNext(): Promise<void> {
		if (this.isProcessing) return;
		if (this.queue.length === 0) {
			this.currentRunId = null;
			this.currentAbortController = null;
			return;
		}

		const item = this.queue.shift();
		if (!item) return;

		this.isProcessing = true;
		this.currentRunId = item.runId;
		this.currentAbortController = new AbortController();

		try {
			await this.execute(item.runId, item.config, this.currentAbortController.signal);
		} catch (err: any) {
			console.error(`[Queue] Benchmark execution failed for ${item.runId}:`, err);
		} finally {
			this.isProcessing = false;
			this.currentRunId = null;
			this.currentAbortController = null;
			this.processNext();
		}
	}

	public getCurrentRunId(): string | null {
		return this.currentRunId;
	}

	public getQueueLength(): number {
		return this.queue.length;
	}
}

async function defaultLoadLogs(runId: string): Promise<string> {
	const existing = await prisma.benchmarkRun.findUnique({
		where: { id: runId },
		select: { logs: true },
	});
	return existing?.logs || "";
}

const globalForQueue = globalThis as unknown as {
	benchmarkQueue: BenchmarkQueue | undefined;
};

export const benchmarkQueue = globalForQueue.benchmarkQueue ?? new BenchmarkQueue();

if (process.env.NODE_ENV !== "production") {
	globalForQueue.benchmarkQueue = benchmarkQueue;
}
