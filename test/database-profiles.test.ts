import assert from "node:assert";
import {
	DATABASE_ENGINES,
	databaseProfiles,
	getDatabaseProfile,
} from "../src/lib/engine/database-profiles";
import { createRunContext } from "../src/lib/engine/run-context";
import type { DatabaseType } from "../src/lib/engine/types";

function ctxFor(database: DatabaseType, runId = "run00000001") {
	return createRunContext(runId, {
		repoName: "demo",
		repoUrl: "https://github.com/x/demo.git",
		database,
		types: ["json"],
		vus: 1,
		totalRecords: 100,
		maxPoolSize: 10,
		appCpuLimit: "1",
		appMemLimit: "256Mi",
		dbCpuLimit: "2",
		dbMemLimit: "2Gi",
	});
}

function testProfileTableExhaustive() {
	console.log("profiles: table covers all engines...");
	assert.deepStrictEqual([...Object.keys(databaseProfiles)].sort(), [
		"mongodb",
		"mssql",
		"postgres",
	]);
	for (const id of DATABASE_ENGINES) {
		const p = getDatabaseProfile(id);
		assert.strictEqual(p.id, id);
		assert.ok(p.image.length > 0);
		assert.ok(p.port > 0);
		assert.ok(p.user.length > 0);
		assert.ok(p.password.length > 0);
		assert.ok(p.label.length > 0);
		assert.ok(p.version.length > 0);
		assert.ok(p.description.length > 0);
		assert.ok(typeof p.generateManifest === "function");
	}
	assert.throws(() => getDatabaseProfile("mysql" as DatabaseType));
	console.log("profile table tests passed.");
}

function testPostgresProfile() {
	console.log("profiles: postgres manifest...");
	const ctx = ctxFor("postgres");
	const m = databaseProfiles.postgres.generateManifest(ctx, { totalRecords: 1000, seedData: true });

	assert(m.includes("image: postgres:18-alpine"));
	assert(m.includes("containerPort: 5432"));
	assert(m.includes("value: root"), "postgres user");
	assert(m.includes("value: benchmark"), "postgres password");
	assert(m.includes(`name: postgres-deployment-${ctx.suffix}`));
	assert(m.includes(`name: postgres-service-${ctx.suffix}`));
	assert(m.includes(`name: postgres-init-${ctx.suffix}`));
	assert(m.includes(`app: postgres-${ctx.suffix}`));
	assert(m.includes("generate_series(1, 1000)"));
	assert(m.includes('cpu: "2"'));
	assert(m.includes('memory: "2Gi"'));

	const noSeed = databaseProfiles.postgres.generateManifest(ctx, {
		totalRecords: 1000,
		seedData: false,
	});
	assert(!noSeed.includes("generate_series"));
	console.log("postgres profile tests passed.");
}

function testMssqlProfile() {
	console.log("profiles: mssql manifest...");
	const ctx = ctxFor("mssql");
	const m = databaseProfiles.mssql.generateManifest(ctx, { totalRecords: 500, seedData: true });

	assert(m.includes("image: mcr.microsoft.com/mssql/server:2022-latest"));
	assert(m.includes("containerPort: 1433"));
	assert(m.includes('name: MSSQL_SA_PASSWORD\n          value: "Benchmark123!"'));
	assert(m.includes("-U\n            - sa"));
	assert(m.includes(`name: mssql-deployment-${ctx.suffix}`));
	assert(m.includes("TOP (500)"));
	console.log("mssql profile tests passed.");
}

function testMongodbProfile() {
	console.log("profiles: mongodb manifest...");
	const ctx = ctxFor("mongodb");
	const m = databaseProfiles.mongodb.generateManifest(ctx, { totalRecords: 2000, seedData: true });

	assert(m.includes("image: mongo:8"));
	assert(m.includes("containerPort: 27017"));
	assert(m.includes("MONGO_INITDB_ROOT_USERNAME"));
	assert(m.includes(`name: mongodb-deployment-${ctx.suffix}`));
	assert(m.includes("id <= 2000"));

	const noSeed = databaseProfiles.mongodb.generateManifest(ctx, {
		totalRecords: 2000,
		seedData: false,
	});
	assert(!noSeed.includes("insertMany"));
	console.log("mongodb profile tests passed.");
}

function testAppManifestUsesProfile() {
	console.log("profiles: app manifest wiring...");
	for (const id of DATABASE_ENGINES) {
		const ctx = ctxFor(id);
		const p = getDatabaseProfile(id);
		const m = databaseProfiles[id].generateAppManifest(ctx, { maxPoolSize: 42 });

		assert(m.includes(`image: demo:${ctx.suffix}`));
		assert(m.includes(`DATABASE_HOST=${ctx.db.serviceName}`));
		assert(m.includes(`DATABASE_PORT=${p.port}`));
		assert(m.includes(`DATABASE_USER=${p.user}`));
		assert(m.includes(`DATABASE_PASSWORD=${p.password}`));
		assert(m.includes("DATABASE_MAX_POOL_SIZE=42"));
		assert(m.includes(`name: app-deployment-${ctx.suffix}`));
		assert(m.includes(`name: app-env-${ctx.suffix}`));
		assert(m.includes(`/probe/readiness`));
	}
	console.log("app manifest profile tests passed.");
}

testProfileTableExhaustive();
testPostgresProfile();
testMssqlProfile();
testMongodbProfile();
testAppManifestUsesProfile();
