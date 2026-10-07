import assert from "node:assert";
import { FakeCluster } from "../src/lib/engine/fake-cluster";

const APP_MANIFEST = `
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-env-s1
data:
  .env: |
    PORT=3000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deployment-s1
---
apiVersion: v1
kind: Service
metadata:
  name: app-service-s1
`;

function newFake(): FakeCluster {
	const fake = new FakeCluster();
	fake.stdLogs = {
		"k6-s1-read-one": [
			"K6_JSON_SUMMARY_START",
			JSON.stringify({
				metrics: {
					http_reqs: { values: { count: 100, rate: 500.25 } },
					http_req_duration: { values: { avg: 2.5, max: 40.25, min: 0.25 } },
					http_req_failed: { values: { passes: 2 } },
				},
			}),
			"K6_JSON_SUMMARY_END",
		].join("\n"),
	};
	return fake;
}

async function testApplyTracksResources() {
	console.log("fake-cluster: apply tracks created resources...");
	const fake = newFake();
	await fake.applyManifest(APP_MANIFEST);
	assert.deepStrictEqual(fake.createdResourceNames(), [
		"app-env-s1",
		"app-deployment-s1",
		"app-service-s1",
	]);
	assert.strictEqual(fake.remainingResourceCount(), 3);
	console.log("apply tracking tests passed.");
}

async function testPodLifecycle() {
	console.log("fake-cluster: pod lifecycle...");
	const fake = newFake();
	const podManifest = JSON.stringify({
		apiVersion: "v1",
		kind: "Pod",
		metadata: { name: "k6-s1-read-one", labels: { app: "k6-s1-read-one" } },
		spec: { restartPolicy: "Never", containers: [{ name: "k6", image: "grafana/k6:latest" }] },
	});
	await fake.applyManifest(podManifest);

	// Applied standalone pod is immediately Running (the fake models no scheduler)
	assert.strictEqual(await fake.podPhase("k6-s1-read-one"), "Running");

	// listPods by label finds it with an IP
	const pods = await fake.listPods("k6-s1-read-one");
	assert.strictEqual(pods.length, 1);
	assert.strictEqual(pods[0].phase, "Running");
	assert.ok(pods[0].podIP, "running pod must have an IP");

	// pod auto-completes after a bounded number of phase reads (k6 finishes)
	for (let i = 0; i < fake.autoCompleteAfterReads - 1; i++) {
		assert.strictEqual(await fake.podPhase("k6-s1-read-one"), "Running");
	}
	await fake.completePod("k6-s1-read-one", "Succeeded");
	assert.strictEqual(await fake.podPhase("k6-s1-read-one"), "Succeeded");
	const logs = await fake.podLogs("k6-s1-read-one");
	assert(logs.includes("K6_JSON_SUMMARY_START"));

	await fake.deleteResource({ kind: "pod", name: "k6-s1-read-one" });
	assert.strictEqual(await fake.podPhase("k6-s1-read-one"), "");
	console.log("pod lifecycle tests passed.");
}

async function testDeploymentRolloutAndRestart() {
	console.log("fake-cluster: deployment rollout + restart...");
	const fake = newFake();
	await fake.applyManifest(APP_MANIFEST);

	// rolloutWait resolves once deployment pods are Running
	await fake.rolloutWait("app-deployment-s1"); // no pods yet — should still resolve (models ready deployment)
	assert.deepStrictEqual(await fake.rolloutWait("app-deployment-s1"), undefined);

	// rolloutRestart: old pod gets deletionTimestamp, new pod Running after tick
	fake.addDeploymentPod("app-deployment-s1", "app-s1", "app-deployment-s1-old");
	await fake.rolloutRestart("app-deployment-s1");
	const pods = await fake.listPods("app-s1");
	assert.strictEqual(pods.length, 2, "old terminating + new pod");
	const terminating = pods.find((p) => p.deletionTimestamp);
	assert.ok(terminating, "restarted pod must carry deletionTimestamp");
	await fake.tick();
	const afterTick = await fake.listPods("app-s1");
	assert.strictEqual(afterTick.length, 1, "terminating pod gone after tick");
	assert.strictEqual(afterTick[0].phase, "Running");
	console.log("rollout/restart tests passed.");
}

async function testDeleteIsIdempotent() {
	console.log("fake-cluster: deletes are idempotent...");
	const fake = newFake();
	await fake.applyManifest(APP_MANIFEST);
	await fake.deleteResource({ kind: "deployment", name: "app-deployment-s1" });
	await fake.deleteResource({ kind: "deployment", name: "app-deployment-s1" }); // must not throw
	assert.strictEqual(fake.remainingResourceCount(), 2);
	await fake.deleteAllCreated();
	assert.strictEqual(fake.remainingResourceCount(), 0, "teardown of every created resource");
	console.log("idempotent delete tests passed.");
}

async function testExecInPod() {
	console.log("fake-cluster: exec in pod...");
	const fake = newFake();
	fake.addDeploymentPod("app-deployment-s1", "app-s1", "app-deployment-s1-x");
	await fake.tick();
	const out = await fake.execInPod("app-deployment-s1-x", "cat /sys/fs/cgroup/cpu.stat");
	assert.strictEqual(typeof out, "string");
	console.log("exec tests passed.");
}

async function testBuildImageAndConfigMap() {
	console.log("fake-cluster: buildImage + configmap...");
	const fake = newFake();
	await fake.buildImage("https://github.com/x/demo.git", "demo:s1");
	assert.deepStrictEqual(fake.builtImages, ["demo:s1"]);

	await fake.createConfigMapFromFile("k6-script-s1-read-one", "script.js", "/tmp/x.js");
	assert(fake.createdResourceNames().includes("k6-script-s1-read-one"));
	console.log("build/configmap tests passed.");
}

async function main() {
	await testApplyTracksResources();
	await testPodLifecycle();
	await testDeploymentRolloutAndRestart();
	await testDeleteIsIdempotent();
	await testExecInPod();
	await testBuildImageAndConfigMap();
	console.log("All fake-cluster tests passed!");
}

main().catch((err) => {
	console.error("fake-cluster test failed:", err);
	process.exit(1);
});
