import assert from "node:assert";
import { databaseProfiles } from "../src/lib/engine/database-profiles";
import { generateK6Script } from "../src/lib/engine/k6-script";
import {
	countEstablishedConnections,
	type PodCgroupState,
	parseCgroupCpuAndMem,
	parseCpuToM,
	parseK6Errors,
	parseK6Summary,
	parseMemToMi,
} from "../src/lib/engine/metrics";
import { createRunContext } from "../src/lib/engine/run-context";
import { DEFAULT_BENCHMARK_CONFIG, extractRepoName } from "../src/lib/engine/types";
import { prisma } from "../src/lib/prisma";

function testExtractRepoName() {
	console.log("Testing extractRepoName...");
	assert.strictEqual(
		extractRepoName("https://github.com/chatnarongt/nestjs-platform-express-node.git"),
		"nestjs-platform-express-node",
	);
	assert.strictEqual(
		extractRepoName("https://github.com/chatnarongt/nestjs-platform-express-node/"),
		"nestjs-platform-express-node",
	);
	assert.strictEqual(
		extractRepoName("git@github.com:chatnarongt/nestjs-platform-express-node.git"),
		"nestjs-platform-express-node",
	);
	assert.strictEqual(
		extractRepoName("/tmp/repos/nestjs-platform-express-node"),
		"nestjs-platform-express-node",
	);
	console.log("extractRepoName tests passed.");
}

async function testPrisma() {
	console.log("Testing Prisma models...");
	const sampleWorkloads = JSON.stringify({
		"read-many": { vus: 50, totalRecords: 20000 },
		plaintext: { vus: 200, totalRecords: 200000 },
	});
	const run = await prisma.benchmarkRun.create({
		data: {
			repoName: "nestjs-platform-express-node",
			repoUrl: "https://github.com/chatnarongt/nestjs-platform-express-node.git",
			database: "postgres",
			vus: 50,
			totalRecords: 100000,
			typeWorkloads: sampleWorkloads,
			status: "COMPLETED",
		},
	});
	assert(run.id, "run id should exist");
	assert.strictEqual(run.repoName, "nestjs-platform-express-node");
	assert.strictEqual(run.namespace, "benchmark");
	assert.strictEqual(run.totalRecords, 100000);
	assert.strictEqual(run.typeWorkloads, sampleWorkloads);

	const result = await prisma.benchmarkResult.create({
		data: {
			benchmarkRunId: run.id,
			testType: "read-one",
			totalRequests: 100000,
			requestPerSecond: 15420.5,
			latencyAverageMs: 3.2,
			latencyMaxMs: 45.1,
			latencyMinMs: 0.8,
			errorCount: 0,
			cpuIdleUsage: 10,
			cpuIdlePercent: 1.0,
			cpuPeakUsage: 850,
			cpuPeakPercent: 85.0,
			memIdleUsage: 45,
			memIdlePercent: 8.78,
			memPeakUsage: 120,
			memPeakPercent: 23.4,
			dbCpuIdleUsage: 25,
			dbCpuIdlePercent: 0.6,
			dbCpuPeakUsage: 350,
			dbCpuPeakPercent: 8.75,
			dbMemIdleUsage: 512,
			dbMemIdlePercent: 6.25,
			dbMemPeakUsage: 1024,
			dbMemPeakPercent: 12.5,
			dbIdleConnectionUsage: 1,
			dbIdleConnectionPercent: 1.0,
			dbPeakConnectionUsage: 50,
			dbPeakConnectionPercent: 50.0,
		},
	});
	assert(result.id, "result id should exist");

	const fetched = await prisma.benchmarkRun.findUnique({
		where: { id: run.id },
		include: { results: true },
	});
	assert.strictEqual(fetched?.results.length, 1);
	assert.strictEqual(fetched?.results[0].requestPerSecond, 15420.5);

	// suggestion registry: upsert is idempotent and delete forgets
	const url = "https://github.com/x/registry-check.git";
	await prisma.targetRepo.upsert({
		where: { repoUrl: url },
		create: { repoUrl: url, database: "mssql" },
		update: { database: "mssql" },
	});
	await prisma.targetRepo.upsert({
		where: { repoUrl: url },
		create: { repoUrl: url },
		update: { database: "mongodb" },
	});
	const saved = await prisma.targetRepo.findUnique({ where: { repoUrl: url } });
	assert(saved, "target repo registered");
	assert.strictEqual(
		await prisma.targetRepo.count({ where: { repoUrl: url } }),
		1,
		"upsert never duplicates",
	);
	await prisma.targetRepo.deleteMany({ where: { repoUrl: url } });
	assert.strictEqual(
		await prisma.targetRepo.count({ where: { repoUrl: url } }),
		0,
		"delete forgets",
	);

	// cleanup
	await prisma.benchmarkRun.delete({ where: { id: run.id } });
	console.log("Prisma tests passed.");
}

function testK6Script() {
	console.log("Testing k6 script generator...");
	const single = generateK6Script("http://app", "read-one", 100, 100000);
	assert.strictEqual(single.iterations, 100000);
	assert(single.script.includes("http.get(TARGET_URL + '/bench/read-one?id=' + id)"));

	const many = generateK6Script("http://app", "read-many", 100, 100000);
	assert.strictEqual(many.iterations, 5000);
	assert(many.script.includes("limit=20&offset="));

	const createMany = generateK6Script("http://app", "create-many", 100, 100000);
	assert.strictEqual(createMany.iterations, 5000);

	const deleteMany = generateK6Script("http://app", "delete-many", 100, 100000);
	assert.strictEqual(deleteMany.iterations, 5000);

	const warmup = generateK6Script("http://app", "read-one", 50, 100000, { durationSeconds: 30 });
	assert.strictEqual(warmup.iterations, 0);
	assert(warmup.script.includes("executor: 'constant-vus'"));
	assert(warmup.script.includes("duration: '30s'"));
	assert(warmup.script.includes("vus: 50"));
	assert(!warmup.script.includes("maxDuration"), "warmup must not have maxDuration");
	assert(
		single.script.includes("executor: 'shared-iterations'"),
		"measured runs keep iteration budget",
	);
	assert(single.script.includes("maxDuration: '45m'"));
	console.log("k6 script generator tests passed.");
}

function makeCtx(database: "postgres" | "mssql" | "mongodb" = "postgres") {
	return createRunContext("testrun00001", {
		repoName: "test",
		repoUrl: "https://github.com/x/test.git",
		database,
		types: ["json"],
		vus: 1,
		totalRecords: 100,
		maxPoolSize: 10,
		appCpuLimit: "2",
		appMemLimit: "2Gi",
		dbCpuLimit: "4",
		dbMemLimit: "8Gi",
	});
}

function testManifests() {
	console.log("Testing manifest generation...");
	const pgCtx = makeCtx("postgres");
	const pg = databaseProfiles.postgres.generateManifest(pgCtx, {
		totalRecords: 100000,
		seedData: true,
	});
	assert(pg.includes("generate_series(1, 100000)"));
	assert(pg.includes(`postgres-deployment-${pgCtx.suffix}`));

	const pgNoSeed = databaseProfiles.postgres.generateManifest(pgCtx, {
		totalRecords: 100000,
		seedData: false,
	});
	assert(!pgNoSeed.includes("generate_series"));

	const mssqlCtx = makeCtx("mssql");
	const mssql = databaseProfiles.mssql.generateManifest(mssqlCtx, {
		totalRecords: 100000,
		seedData: true,
	});
	assert(mssql.includes("TOP (100000)"));
	assert(mssql.includes(`mssql-deployment-${mssqlCtx.suffix}`));

	const mongoCtx = makeCtx("mongodb");
	const mongo = databaseProfiles.mongodb.generateManifest(mongoCtx, {
		totalRecords: 100000,
		seedData: true,
	});
	assert(mongo.includes("id <= 100000"));
	assert(mongo.includes(`mongodb-deployment-${mongoCtx.suffix}`));

	const appCtx = makeCtx("postgres");
	const app = databaseProfiles.postgres.generateAppManifest(appCtx, { maxPoolSize: 100 });
	assert(app.includes(`image: test:${appCtx.suffix}`));
	assert(app.includes(`DATABASE_HOST=postgres-service-${appCtx.suffix}`));
	assert(app.includes("/probe/readiness"));
	console.log("Manifest generation tests passed.");
}

function testMetrics() {
	console.log("Testing metrics helpers...");
	assert.strictEqual(parseCpuToM("500m"), 500);
	assert.strictEqual(parseCpuToM("2"), 2000);
	assert.strictEqual(parseMemToMi("512Mi"), 512);
	assert.strictEqual(parseMemToMi("1Gi"), 1024);

	// Test multi-line parsing picking active peak pod
	const topOutput = `
app-deployment-old   4m    50Mi
app-deployment-new   850m  120Mi
`;
	let maxCpu = 0;
	let maxMem = 0;
	for (const line of topOutput.trim().split("\n")) {
		const parts = line.trim().split(/\s+/);
		if (parts.length >= 3) {
			const c = parseCpuToM(parts[1]);
			const m = parseMemToMi(parts[2]);
			if (c > maxCpu) maxCpu = c;
			if (m > maxMem) maxMem = m;
		}
	}
	assert.strictEqual(maxCpu, 850, "Should pick highest active CPU usage among pods");
	assert.strictEqual(maxMem, 120, "Should pick highest active Memory usage among pods");

	// Test cgroup CPU and memory computation
	const state: PodCgroupState = {
		lastUsageUsec: 100000,
		lastTimestampMs: 1000,
	};
	const cgroupSample = `
usage_usec 1100000
user_usec 500000
system_usec 600000
---MEM---
104857600
  `;
	const cgResult = parseCgroupCpuAndMem(cgroupSample, state, 2000);
	assert.strictEqual(cgResult.cpu, 1000, "1,000,000 usec in 1 sec must equal 1000 millicores");
	assert.strictEqual(cgResult.memory, 100, "104857600 bytes must equal 100 MiB");

	// Connection counting: /proc/net/tcp hex form + netstat fallback
	const hexIp = "01012A0A"; // ipToHex("10.42.1.1"): octets reversed
	const tcpOutput = `
sl local_address rem_address st
0: 01000E9C:1538 ${hexIp}:8D4A 01
1: 01000E9C:1538 ${hexIp}:8D4B 01
2: 01000E9C:1539 ${hexIp}:8D4A 01
`;
	// port 5432 = 0x1538
	assert.strictEqual(countEstablishedConnections(tcpOutput, 5432, ["10.42.1.1"]), 2);
	const netstatOutput = `
tcp 0 0 10.42.1.2:5432 10.42.1.1:40000 ESTABLISHED
tcp 0 0 10.42.1.2:5432 10.42.1.1:40001 ESTABLISHED
tcp 0 0 10.42.1.2:5432 10.99.9.9:40002 ESTABLISHED
`;
	assert.strictEqual(countEstablishedConnections(netstatOutput, 5432, ["10.42.1.1"]), 2);

	const rawK6 = `
Some k6 output...
K6_JSON_SUMMARY_START
{
  "metrics": {
    "http_reqs": { "values": { "count": 100000, "rate": 2500.5 } },
    "http_req_duration": { "values": { "avg": 4.1234, "max": 80.5, "min": 0.5 } },
    "http_req_failed": { "values": { "passes": 0 } }
  }
}
K6_JSON_SUMMARY_END
  `;
	const parsed = parseK6Summary(rawK6);
	assert.strictEqual(parsed.totalRequests, 100000);
	assert.strictEqual(parsed.requestPerSecond, 2500.5);
	assert.strictEqual(parsed.latencyAverageMs, 4.1234);
	assert.strictEqual(parsed.latencyMaxMs, 80.5);
	assert.strictEqual(parsed.latencyMinMs, 0.5);
	assert.strictEqual(parsed.errorCount, 0);

	const rawErrors = `
K6_ERROR_SAMPLE:{"status":500,"body":"Internal Server Error"}
K6_ERROR_SAMPLE:{"status":500,"body":"Internal Server Error"}
K6_ERROR_SAMPLE:{"status":404,"body":"Not Found"}
  `;
	const errors = parseK6Errors(rawErrors);
	assert.strictEqual(errors.length, 2, "Should deduplicate identical error status + body");
	assert.strictEqual(errors[0].status, 500);
	assert.strictEqual(errors[1].status, 404);

	console.log("Metrics tests passed.");
}

function testDefaultConfig() {
	console.log("Testing default config single source...");
	// The Prisma schema default and the shared constant must agree by construction.
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.appMemLimit, "512Mi");
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.appCpuLimit, "1");
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.dbCpuLimit, "4");
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.dbMemLimit, "8Gi");
	console.log("Default config tests passed.");
}

async function main() {
	testExtractRepoName();
	testK6Script();
	testManifests();
	testMetrics();
	testDefaultConfig();
	await testPrisma();
	console.log("All self-checks passed!");
}

main().catch((err) => {
	console.error("Self-check failed:", err);
	process.exit(1);
});
