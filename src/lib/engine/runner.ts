import fs from "node:fs";
import { prisma } from "../prisma";
import { type Cluster, KubectlCluster } from "./cluster";
import { type DatabaseProfile, getDatabaseProfile } from "./database-profiles";
import { generateK6Script } from "./k6-script";
import {
	CGROUP_READ_COMMAND,
	DB_POD_READ_COMMAND,
	type PodCgroupState,
	parseCgroupCpuAndMem,
	parseCpuToM,
	parseDbMetricsAndConnections,
	parseK6Errors,
	parseK6Summary,
	parseMemToMi,
} from "./metrics";
import { createPeakTracker, type PeakValues } from "./peak-tracker";
import { createRunContext, type RunContext } from "./run-context";
import {
	createRunStore,
	PrismaRunRecordSink,
	type RunRecordSink,
	type RunStore,
} from "./run-store";
import {
	type BenchmarkConfig,
	type CollectedMetrics,
	DEFAULT_BENCHMARK_CONFIG,
	type TestType,
} from "./types";

const K6_DEADLINE_MIN = 45;
export const STOP_MESSAGE = "Benchmark stopped by user";

export interface IdleMetrics {
	app: { cpu: number; memory: number };
	db: { cpu: number; memory: number };
	connections: number;
}

export interface BenchmarkExecuteDeps {
	cluster?: Cluster;
	sink?: RunRecordSink;
	store?: RunStore;
	writeResult?: (
		data: CollectedMetrics & { benchmarkRunId: string; testType: string },
	) => Promise<unknown>;
	sleep?: (ms: number) => Promise<void>;
}

interface PhaseSession {
	cluster: Cluster;
	store: RunStore;
	ctx: RunContext;
	config: BenchmarkConfig;
	profile: DatabaseProfile;
	sleep: (ms: number) => Promise<void>;
	writeResult: (
		data: CollectedMetrics & { benchmarkRunId: string; testType: string },
	) => Promise<unknown>;
	onLog: (msg: string) => void;
	gate: () => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const nullSink: RunRecordSink = {
	async update() {},
};

async function loadExistingLogs(runId: string): Promise<string> {
	const existing = await prisma.benchmarkRun.findUnique({
		where: { id: runId },
		select: { logs: true },
	});
	return existing?.logs || "";
}

async function resolveSession(
	runId: string,
	config: BenchmarkConfig,
	abortSignal: AbortSignal | undefined,
	deps?: BenchmarkExecuteDeps,
): Promise<PhaseSession> {
	const ctx = createRunContext(runId, config);
	const profile = getDatabaseProfile(config.database);
	const gate = () => {
		if (abortSignal?.aborted) throw new Error(STOP_MESSAGE);
	};

	if (!deps?.cluster) {
		const initialLogs = await loadExistingLogs(runId);
		const store = createRunStore(runId, new PrismaRunRecordSink(prisma), initialLogs);
		const session: PhaseSession = {
			cluster: new KubectlCluster(),
			store,
			ctx,
			config,
			profile,
			sleep: defaultSleep,
			writeResult: (data) => prisma.benchmarkResult.create({ data }),
			onLog: (m) => {
				store.appendLog(m).catch(() => {});
			},
			gate,
		};
		return session;
	}

	const store = deps.store ?? createRunStore(runId, deps.sink ?? nullSink, "");
	return {
		cluster: deps.cluster,
		store,
		ctx,
		config,
		profile,
		sleep: deps.sleep ?? defaultSleep,
		writeResult: deps.writeResult ?? ((data) => prisma.benchmarkResult.create({ data })),
		onLog: (m) => {
			store.appendLog(m).catch(() => {});
		},
		gate,
	};
}

export async function executeBenchmark(
	runId: string,
	config: BenchmarkConfig,
	abortSignal?: AbortSignal,
	deps?: BenchmarkExecuteDeps,
): Promise<void> {
	const s = await resolveSession(runId, config, abortSignal, deps);
	const { store, gate } = s;

	try {
		gate();

		await store.setStatus("RUNNING");
		await store.appendLog(
			`[Orchestrator] Starting benchmark run ${runId} [${s.ctx.repoName}] (suffix: ${s.ctx.suffix})\n`,
		);
		await store.appendLog(
			`[Orchestrator] Database: ${config.database}, VUs: ${config.vus}, Records: ${config.totalRecords}\n`,
		);

		await phaseBuildImage(s);
		gate();
		await phaseProvisionDatabase(s, { totalRecords: config.totalRecords, seedData: true });
		gate();
		await phaseDeployApp(s);
		gate();

		for (const testType of config.types) {
			gate();
			await phaseRunSingleTest(s, testType, abortSignal);
		}

		await store.appendLog(`\n[Orchestrator] All benchmark tests completed successfully!\n`);
		await store.setStatus("COMPLETED");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const isStopped = abortSignal?.aborted || message === STOP_MESSAGE;
		const finalStatus = isStopped ? "STOPPED" : "FAILED";
		await store.appendLog(
			`\n[Orchestrator] ${isStopped ? "Benchmark stopped by user." : `Error: ${message}`}\n`,
		);
		await store.setStatus(finalStatus, { error: message });
	} finally {
		await phaseTeardown(s);
	}
}

async function phaseBuildImage(s: PhaseSession): Promise<void> {
	await s.cluster.buildImage(s.config.repoUrl, s.ctx.imageTag, s.onLog);
}

async function phaseProvisionDatabase(
	s: PhaseSession,
	options: { totalRecords: number; seedData: boolean },
): Promise<void> {
	const { cluster, store, ctx, profile, onLog, sleep } = s;
	await store.appendLog(`[Kubernetes] Initializing target database ${ctx.database}...\n`);
	const manifest = profile.generateManifest(ctx, options);
	await cluster.applyManifest(manifest, onLog);

	await store.appendLog(`[Kubernetes] Waiting for initial database rollout...\n`);
	await cluster.rolloutWait(ctx.db.deploymentName, onLog);
	await store.appendLog(`[Kubernetes] Initial database is ready.\n`);
	await sleep(4000);
}

async function phaseDeployApp(s: PhaseSession): Promise<void> {
	const { cluster, store, ctx, config, profile, onLog, sleep } = s;
	await store.appendLog(`[Kubernetes] Deploying application ${ctx.app.deploymentName}...\n`);
	const manifest = profile.generateAppManifest(ctx, { maxPoolSize: config.maxPoolSize });
	await cluster.applyManifest(manifest, onLog);

	await store.appendLog(`[Kubernetes] Waiting for application deployment rollout...\n`);
	await cluster.rolloutWait(ctx.app.deploymentName, onLog);
	await sleep(4000);
}

async function phaseRunSingleTest(
	s: PhaseSession,
	testType: TestType,
	abortSignal: AbortSignal | undefined,
): Promise<void> {
	const { store, config, gate } = s;
	const typeVus = config.typeWorkloads?.[testType]?.vus ?? config.vus;
	const typeRecords = config.typeWorkloads?.[testType]?.totalRecords ?? config.totalRecords;
	const testNeedsDb = testType !== "plaintext" && testType !== "json";
	const seedData = testType !== "create-one" && testType !== "create-many";
	const warmupSeconds = config.warmupSeconds ?? DEFAULT_BENCHMARK_CONFIG.warmupSeconds;
	const cooldownSeconds = config.cooldownSeconds ?? DEFAULT_BENCHMARK_CONFIG.cooldownSeconds;

	await store.appendLog(`\n======================================================\n`);
	await store.appendLog(
		`[Benchmark] Starting Test: ${testType} (VUs: ${typeVus}, Records: ${typeRecords})\n`,
	);
	await store.appendLog(`======================================================\n`);

	if (testNeedsDb) {
		gate();
		await phaseRecreateDatabase(s, { testType, typeRecords, seedData });
	}

	if (warmupSeconds > 0) {
		gate();
		await phaseWarmup(s, testType, typeVus, warmupSeconds);
	}

	if (cooldownSeconds > 0) {
		await store.appendLog(`[Benchmark] Cooldown for '${testType}' (${cooldownSeconds}s)...\n`);
		await s.sleep(cooldownSeconds * 1000);
	}

	await store.appendLog(`[Metrics] Sampling idle metrics for ${testType}...\n`);
	await s.sleep(cooldownSeconds > 0 ? 0 : 3000);

	const idle = await sampleIdleMetrics(s, testNeedsDb);
	await store.appendLog(
		`[Metrics] Idle -> App CPU: ${idle.app.cpu}m, App RAM: ${idle.app.memory}Mi | DB CPU: ${idle.db.cpu}m, DB RAM: ${idle.db.memory}Mi, DB Conns: ${idle.connections}\n`,
	);

	const k6 = await phaseRunK6(s, {
		testType,
		typeVus,
		typeRecords,
		abortSignal,
		idle,
		testNeedsDb,
	});

	const percentages = computePercentages({
		idle,
		peaks: k6.peaks,
		config: s.config,
		appLimit: k6.appLimit,
		dbLimit: k6.dbLimit,
	});

	await s.writeResult({
		benchmarkRunId: s.ctx.runId,
		testType,
		totalRequests: k6.summary.totalRequests,
		requestPerSecond: k6.summary.requestPerSecond,
		latencyAverageMs: k6.summary.latencyAverageMs,
		latencyMaxMs: k6.summary.latencyMaxMs,
		latencyMinMs: k6.summary.latencyMinMs,
		errorCount: k6.summary.errorCount,

		cpuIdleUsage: idle.app.cpu,
		cpuIdlePercent: percentages.cpuIdlePercent,
		cpuPeakUsage: k6.peaks.appCpu,
		cpuPeakPercent: percentages.cpuPeakPercent,

		memIdleUsage: idle.app.memory,
		memIdlePercent: percentages.memIdlePercent,
		memPeakUsage: k6.peaks.appMem,
		memPeakPercent: percentages.memPeakPercent,

		dbCpuIdleUsage: idle.db.cpu,
		dbCpuIdlePercent: percentages.dbCpuIdlePercent,
		dbCpuPeakUsage: k6.peaks.dbCpu,
		dbCpuPeakPercent: percentages.dbCpuPeakPercent,

		dbMemIdleUsage: idle.db.memory,
		dbMemIdlePercent: percentages.dbMemIdlePercent,
		dbMemPeakUsage: k6.peaks.dbMem,
		dbMemPeakPercent: percentages.dbMemPeakPercent,

		dbIdleConnectionUsage: idle.connections,
		dbIdleConnectionPercent: percentages.dbIdleConnectionPercent,
		dbPeakConnectionUsage: k6.peaks.dbConnections,
		dbPeakConnectionPercent: percentages.dbPeakConnectionPercent,

		rawMetrics: JSON.stringify(k6.summary),
	});

	await store.appendLog(
		`[Metrics] Result '${testType}' -> Req/s: ${k6.summary.requestPerSecond}, Latency avg: ${k6.summary.latencyAverageMs}ms, Peak CPU: ${k6.peaks.appCpu}m (${percentages.cpuPeakPercent}%), Peak RAM: ${k6.peaks.appMem}Mi (${percentages.memPeakPercent}%), Peak DB Conns: ${k6.peaks.dbConnections} (${percentages.dbPeakConnectionPercent}%)\n`,
	);

	await s.sleep(3000);
}

async function phaseRecreateDatabase(
	s: PhaseSession,
	a: { testType: TestType; typeRecords: number; seedData: boolean },
): Promise<void> {
	const { cluster, store, ctx, profile, onLog, sleep } = s;
	await store.appendLog(
		`[Kubernetes] Creating fresh ${ctx.database} database for '${a.testType}' (seedData: ${a.seedData}, rows: ${a.typeRecords})...\n`,
	);

	await cluster.deleteResource({ kind: "deployment", name: ctx.db.deploymentName });
	await cluster.deleteResource({ kind: "service", name: ctx.db.serviceName });
	await cluster.deleteResource({ kind: "configmap", name: ctx.db.configMapName });

	const manifest = profile.generateManifest(ctx, {
		totalRecords: a.typeRecords,
		seedData: a.seedData,
	});
	await cluster.applyManifest(manifest, onLog);

	await store.appendLog(
		`[Kubernetes] Waiting for database deployment ${ctx.db.deploymentName} rollout...\n`,
	);
	await cluster.rolloutWait(ctx.db.deploymentName, onLog);
	await store.appendLog(`[Kubernetes] Fresh database is ready.\n`);
	await sleep(4000);

	await store.appendLog(`[Kubernetes] Restarting application to connect to fresh environment...\n`);
	await cluster.rolloutRestart(ctx.app.deploymentName);
	await cluster.rolloutWait(ctx.app.deploymentName, onLog);

	// Ensure terminating pods are gone
	for (let i = 0; i < 30; i++) {
		const pods = await cluster.listPods(ctx.app.label);
		if (!pods.some((p) => p.deletionTimestamp)) break;
		await sleep(1000);
	}
	await sleep(2000);
}

async function sampleIdleMetrics(s: PhaseSession, testNeedsDb: boolean): Promise<IdleMetrics> {
	const { cluster, ctx, profile } = s;
	const appPods = await cluster.listPods(ctx.app.label);
	const appPod = appPods.find((p) => p.phase === "Running" && !p.deletionTimestamp);
	const appCgroupState: PodCgroupState = {};
	let app = { cpu: 0, memory: 0 };
	if (appPod) {
		const raw = await cluster.execInPod(appPod.name, CGROUP_READ_COMMAND);
		app = parseCgroupCpuAndMem(raw, appCgroupState);
	}

	let db = { cpu: 0, memory: 0 };
	let connections = 0;
	if (testNeedsDb) {
		const dbPods = await cluster.listPods(ctx.db.label);
		const dbPod = dbPods.find((p) => p.phase === "Running" && !p.deletionTimestamp);
		const appIps = appPods.flatMap((p) => (p.podIP ? [p.podIP] : []));
		if (dbPod) {
			const dbCgroupState: PodCgroupState = {};
			const raw = await cluster.execInPod(dbPod.name, DB_POD_READ_COMMAND);
			const res = parseDbMetricsAndConnections(raw, profile.port, appIps, dbCgroupState);
			db = { cpu: res.cpu, memory: res.memory };
			connections = res.connections;
		}
	}
	return { app, db, connections };
}

function k6PodManifest(podName: string, configMapName: string): string {
	return JSON.stringify({
		apiVersion: "v1",
		kind: "Pod",
		metadata: { name: podName, labels: { app: podName } },
		spec: {
			restartPolicy: "Never",
			containers: [
				{
					name: "k6",
					image: "grafana/k6:latest",
					args: ["run", "/scripts/script.js"],
					volumeMounts: [{ name: "k6-script-vol", mountPath: "/scripts", readOnly: true }],
				},
			],
			volumes: [{ name: "k6-script-vol", configMap: { name: configMapName } }],
		},
	});
}

/**
 * Short, unmeasured k6 run that warms the app before the measured run.
 * Results are discarded; a failed warmup pod only logs a warning.
 */
async function phaseWarmup(
	s: PhaseSession,
	testType: TestType,
	typeVus: number,
	warmupSeconds: number,
): Promise<void> {
	const { cluster, store, ctx, onLog, sleep, gate } = s;
	// ponytail: delete-* warms read-one instead — its destructive ids belong to the
	// measured run. Upgrade: seed a spare id band and re-seed between warmup and measure.
	const warmType: TestType = testType.startsWith("delete") ? "read-one" : testType;
	const { podName, configMapName } = ctx.k6(`${testType}-warmup`);
	const scriptPath = `/tmp/${configMapName}.js`;
	const { script } = generateK6Script(`http://${ctx.app.serviceName}`, warmType, typeVus, 0, {
		durationSeconds: warmupSeconds,
	});

	await store.appendLog(
		`[Benchmark] Warmup for '${testType}' via '${warmType}' (${warmupSeconds}s at ${typeVus} VUs, discarded)...\n`,
	);

	try {
		fs.writeFileSync(scriptPath, script);
		await cluster.createConfigMapFromFile(configMapName, "script.js", scriptPath);
		await cluster.deleteResource({ kind: "pod", name: podName });
		await cluster.applyManifest(k6PodManifest(podName, configMapName), onLog);

		const deadline = Date.now() + (warmupSeconds + K6_DEADLINE_MIN * 60) * 1000;
		while (Date.now() < deadline) {
			gate();
			const phase = await cluster.podPhase(podName);
			if (phase === "Succeeded" || phase === "Failed") {
				if (phase === "Failed") {
					await store.appendLog(
						`[Benchmark] Warmup pod for '${testType}' failed; continuing anyway.\n`,
					);
				}
				return;
			}
			await sleep(1000);
		}
		throw new Error(
			`warmup pod ${podName} did not finish within ${warmupSeconds}s + ${K6_DEADLINE_MIN}m`,
		);
	} finally {
		try {
			fs.unlinkSync(scriptPath);
		} catch {}
		await cluster.deleteResource({ kind: "pod", name: podName }).catch(() => {});
		await cluster.deleteResource({ kind: "configmap", name: configMapName }).catch(() => {});
	}
}

interface PhaseRunK6Args {
	testType: TestType;
	typeVus: number;
	typeRecords: number;
	abortSignal: AbortSignal | undefined;
	idle: IdleMetrics;
	testNeedsDb: boolean;
}

interface K6Outcome {
	summary: ReturnType<typeof parseK6Summary>;
	peaks: PeakValues;
	appLimit: { cpu: number; memory: number };
	dbLimit: { cpu: number; memory: number };
}

async function phaseRunK6(s: PhaseSession, a: PhaseRunK6Args): Promise<K6Outcome> {
	const { cluster, store, ctx, profile, onLog, sleep } = s;
	const { testType, typeVus, typeRecords, abortSignal, idle, testNeedsDb } = a;

	const { script, iterations } = generateK6Script(
		`http://${ctx.app.serviceName}`,
		testType,
		typeVus,
		typeRecords,
	);
	const { podName, configMapName } = ctx.k6(testType);
	const scriptPath = `/tmp/${configMapName}.js`;

	const tracker = createPeakTracker({
		appCpu: idle.app.cpu,
		appMem: idle.app.memory,
		dbCpu: idle.db.cpu,
		dbMem: idle.db.memory,
		dbConnections: idle.connections,
	});

	let appPodName = "";
	let dbPodName = "";
	let appPodIps: string[] = [];
	const appCgroupState: PodCgroupState = {};
	const dbCgroupState: PodCgroupState = {};

	const readCgroupSamples = async () => {
		const appRaw = appPodName ? await cluster.execInPod(appPodName, CGROUP_READ_COMMAND) : "";
		const appM = appPodName ? parseCgroupCpuAndMem(appRaw, appCgroupState) : { cpu: 0, memory: 0 };
		if (testNeedsDb && dbPodName) {
			const dbRaw = await cluster.execInPod(dbPodName, DB_POD_READ_COMMAND);
			const dbRes = parseDbMetricsAndConnections(dbRaw, profile.port, appPodIps, dbCgroupState);
			tracker.observe({
				appCpu: appM.cpu,
				appMem: appM.memory,
				dbCpu: dbRes.cpu,
				dbMem: dbRes.memory,
				dbConnections: dbRes.connections,
			});
		} else {
			tracker.observe({ appCpu: appM.cpu, appMem: appM.memory });
		}
	};

	/** kubectl-top poller fallback: cgroup-independent sample of the same dimensions. */
	const readTopSamples = async () => {
		const appRaw = appPodName ? await cluster.execInPod(appPodName, CGROUP_READ_COMMAND) : "";
		const appM = appPodName ? parseCgroupCpuAndMem(appRaw, appCgroupState) : { cpu: 0, memory: 0 };
		if (testNeedsDb && dbPodName) {
			const dbRaw = await cluster.execInPod(dbPodName, DB_POD_READ_COMMAND);
			const dbRes = parseDbMetricsAndConnections(dbRaw, profile.port, appPodIps, dbCgroupState);
			tracker.observe({
				appCpu: appM.cpu,
				appMem: appM.memory,
				dbCpu: dbRes.cpu,
				dbMem: dbRes.memory,
			});
		} else {
			tracker.observe({ appCpu: appM.cpu, appMem: appM.memory });
		}
	};

	try {
		fs.writeFileSync(scriptPath, script);
		await cluster.createConfigMapFromFile(configMapName, "script.js", scriptPath);

		await cluster.deleteResource({ kind: "pod", name: podName });
		await cluster.applyManifest(k6PodManifest(podName, configMapName), onLog);

		const appPods = await cluster.listPods(ctx.app.label);
		appPodName = appPods.find((p) => p.phase === "Running" && !p.deletionTimestamp)?.name ?? "";
		appPodIps = appPods.flatMap((p) => (p.podIP && !p.deletionTimestamp ? [p.podIP] : []));
		const dbPods = testNeedsDb ? await cluster.listPods(ctx.db.label) : [];
		dbPodName = dbPods.find((p) => p.phase === "Running" && !p.deletionTimestamp)?.name ?? "";

		// Initialize baseline cgroup counters before starting k6
		await Promise.all([readCgroupSamples()]);

		await store.appendLog(
			`[k6] Executing ${testType} (${iterations} iterations across ${typeVus} VUs, target: ${typeRecords} records)...\n`,
		);

		let isRunning = true;

		// 1. High-frequency cgroup CPU/RAM & DB connection poller (every 300ms)
		const fastPoller = async () => {
			while (isRunning) {
				try {
					await readCgroupSamples();
				} catch {}
				if (isRunning) await sleep(300);
			}
		};

		// 2. Standard poller fallback (runs every 1000ms)
		const topPoller = async () => {
			while (isRunning) {
				try {
					await readTopSamples();
				} catch {}
				if (isRunning) await sleep(1000);
			}
		};

		const fastPromise = fastPoller();
		const topPromise = topPoller();

		const deadline = Date.now() + K6_DEADLINE_MIN * 60 * 1000;
		while (Date.now() < deadline) {
			if (abortSignal?.aborted) {
				await cluster.deleteResource({ kind: "pod", name: podName });
				throw new Error(STOP_MESSAGE);
			}
			const phase = await cluster.podPhase(podName);
			if (phase === "Succeeded" || phase === "Failed") break;
			await sleep(1000);
		}
		if (Date.now() >= deadline) {
			throw new Error(`k6 pod ${podName} did not finish within ${K6_DEADLINE_MIN}m`);
		}

		// One final measurement sample right before teardown
		try {
			await readCgroupSamples();
		} catch {}

		isRunning = false;
		await Promise.race([
			Promise.all([fastPromise, topPromise]),
			new Promise((r) => setTimeout(r, 3000)),
		]);

		const k6Logs = await cluster.podLogs(podName);

		await cluster.deleteResource({ kind: "pod", name: podName });
		await cluster.deleteResource({ kind: "configmap", name: configMapName });

		const summary = parseK6Summary(k6Logs);
		const errors = parseK6Errors(k6Logs);
		if (errors.length > 0) {
			await store.appendLog(
				`[k6] ⚠️ Detected ${summary.errorCount} errors in '${testType}'. Sample error responses:\n`,
			);
			for (const err of errors.slice(0, 5)) {
				await store.appendLog(`  - HTTP ${err.status}: ${err.body}\n`);
			}
		}

		return {
			summary,
			peaks: tracker.peaks(),
			appLimit: { cpu: parseCpuToM(ctx.appCpuLimit), memory: parseMemToMi(ctx.appMemLimit) },
			dbLimit: { cpu: parseCpuToM(ctx.dbCpuLimit), memory: parseMemToMi(ctx.dbMemLimit) },
		};
	} finally {
		try {
			fs.unlinkSync(scriptPath);
		} catch {}
	}
}

function computePercentages(a: {
	idle: IdleMetrics;
	peaks: PeakValues;
	config: BenchmarkConfig;
	appLimit: { cpu: number; memory: number };
	dbLimit: { cpu: number; memory: number };
}) {
	const { idle, peaks, config, appLimit, dbLimit } = a;
	const pct = (v: number, limit: number) =>
		limit > 0 ? Number(((v / limit) * 100).toFixed(2)) : 0;

	return {
		cpuIdlePercent: pct(idle.app.cpu, appLimit.cpu),
		cpuPeakPercent: pct(peaks.appCpu, appLimit.cpu),
		memIdlePercent: pct(idle.app.memory, appLimit.memory),
		memPeakPercent: pct(peaks.appMem, appLimit.memory),
		dbCpuIdlePercent: pct(idle.db.cpu, dbLimit.cpu),
		dbCpuPeakPercent: pct(peaks.dbCpu, dbLimit.cpu),
		dbMemIdlePercent: pct(idle.db.memory, dbLimit.memory),
		dbMemPeakPercent: pct(peaks.dbMem, dbLimit.memory),
		dbIdleConnectionPercent: pct(idle.connections, config.maxPoolSize),
		dbPeakConnectionPercent: pct(peaks.dbConnections, config.maxPoolSize),
	};
}

async function phaseTeardown(s: PhaseSession): Promise<void> {
	const { cluster, store, ctx } = s;
	await store.appendLog(`[Cleanup] Cleaning up Kubernetes resources...\n`);
	const refs = [
		{ kind: "deployment" as const, name: ctx.app.deploymentName },
		{ kind: "service" as const, name: ctx.app.serviceName },
		{ kind: "configmap" as const, name: ctx.app.envConfigMapName },
		{ kind: "deployment" as const, name: ctx.db.deploymentName },
		{ kind: "service" as const, name: ctx.db.serviceName },
		{ kind: "configmap" as const, name: ctx.db.configMapName },
	];
	// every delete runs even if an earlier one fails
	await Promise.all(refs.map((ref) => cluster.deleteResource(ref).catch(() => {})));
	await store.appendLog(`[Cleanup] Cleaned up all resources for ${ctx.suffix}.\n`);
}
