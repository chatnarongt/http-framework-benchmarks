import assert from "node:assert";
import { createRunContext } from "../src/lib/engine/run-context";
import {
	type BenchmarkConfig,
	DEFAULT_BENCHMARK_CONFIG,
	extractRepoName,
} from "../src/lib/engine/types";

function makeConfig(overrides: Partial<BenchmarkConfig> = {}): BenchmarkConfig {
	return {
		repoName: "nestjs-platform-express-node",
		repoUrl: "https://github.com/chatnarongt/nestjs-platform-express-node.git",
		database: "postgres",
		types: ["plaintext", "json", "read-one"],
		vus: 100,
		totalRecords: 100000,
		maxPoolSize: 100,
		appCpuLimit: "1",
		appMemLimit: "256Mi",
		dbCpuLimit: "4",
		dbMemLimit: "8Gi",
		...overrides,
	};
}

function testExtractRepoName() {
	console.log("run-context: testing extractRepoName...");
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

function testRunContextDerivation() {
	console.log("run-context: testing name derivation...");
	const ctx = createRunContext("clxxxxxxxxxxxxxxxxxxxxABC12345", makeConfig());

	assert.strictEqual(
		ctx.suffix,
		"abc12345",
		"suffix must be last 8 alphanumeric chars of run id, lowercased",
	);
	assert.strictEqual(ctx.imageTag, "nestjs-platform-express-node:abc12345");
	assert.strictEqual(ctx.app.label, "app-abc12345");
	assert.strictEqual(ctx.app.deploymentName, "app-deployment-abc12345");
	assert.strictEqual(ctx.app.serviceName, "app-service-abc12345");
	assert.strictEqual(ctx.app.envConfigMapName, "app-env-abc12345");

	assert.strictEqual(ctx.db.serviceName, "postgres-service-abc12345");
	assert.strictEqual(ctx.db.deploymentName, "postgres-deployment-abc12345");
	assert.strictEqual(ctx.db.label, "postgres-abc12345");
	assert.strictEqual(ctx.db.configMapName, "postgres-init-abc12345");

	// Deterministic + frozen
	const ctx2 = createRunContext("clxxxxxxxxxxxxxxxxxxxxABC12345", makeConfig());
	const { k6: _k, ...ctxBase } = ctx;
	const { k6: _k2, ...ctx2Base } = ctx2;
	assert.deepStrictEqual(ctxBase, ctx2Base, "derivation must be deterministic");
	assert.strictEqual(
		ctx.k6("read-one").podName,
		ctx2.k6("read-one").podName,
		"k6 names deterministic",
	);
	assert.ok(
		Object.isFrozen(ctx) && Object.isFrozen(ctx.app) && Object.isFrozen(ctx.db),
		"context must be frozen",
	);
	assert.strictEqual(ctx.k6("read-one").podName, `k6-${ctx.suffix}-read-one`);
	assert.strictEqual(ctx.k6("read-one").configMapName, `k6-script-${ctx.suffix}-read-one`);

	// Different database engine changes db names only
	const mongoCtx = createRunContext(
		"clxxxxxxxxxxxxxxxxxxxxABC12345",
		makeConfig({ database: "mongodb" }),
	);
	assert.strictEqual(mongoCtx.db.deploymentName, "mongodb-deployment-abc12345");
	assert.strictEqual(
		mongoCtx.app.deploymentName,
		"app-deployment-abc12345",
		"app names must not depend on database",
	);

	// Repo name sanitization
	const weird = createRunContext("run00000001", makeConfig({ repoName: "My.Repo_42!!" }));
	assert.strictEqual(
		weird.imageTag,
		"my-repo-42:run00001".replace("run00001", "n0000001".slice(-8) === "" ? "" : weird.suffix),
	);
	assert.ok(/^[a-z0-9-]+$/.test(weird.imageTag.split(":")[0]), "repo slug must be k8s-name-safe");

	// Fallback repo name
	const fallback = createRunContext(
		"run00000001",
		makeConfig({ repoName: "", repoUrl: "https://github.com/x/y.git" }),
	);
	assert.strictEqual(fallback.repoName, "y");
	console.log("run-context derivation tests passed.");
}

function testDefaultConfig() {
	console.log("run-context: testing default config...");
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.appMemLimit, "512Mi");
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.vus, 100);
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.totalRecords, 100000);
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.maxPoolSize, 100);
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.appCpuLimit, "1");
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.dbCpuLimit, "4");
	assert.strictEqual(DEFAULT_BENCHMARK_CONFIG.dbMemLimit, "8Gi");
	assert.strictEqual(
		DEFAULT_BENCHMARK_CONFIG.repoUrl,
		"https://github.com/chatnarongt/nestjs-platform-express-node.git",
	);
	console.log("default config tests passed.");
}

testExtractRepoName();
testRunContextDerivation();
testDefaultConfig();
