import assert from "node:assert";
import { createPeakTracker } from "../src/lib/engine/peak-tracker";

function testSeededIdleConverges() {
	console.log("peak-tracker: idle seed + single observer...");
	const t = createPeakTracker({ appCpu: 5, appMem: 40, dbCpu: 10, dbMem: 100, dbConnections: 2 });
	assert.deepStrictEqual(t.peaks(), {
		appCpu: 5,
		appMem: 40,
		dbCpu: 10,
		dbMem: 100,
		dbConnections: 2,
	});

	t.observe({ appCpu: 800, appMem: 120, dbCpu: 0, dbMem: 0, dbConnections: 0 });
	assert.deepStrictEqual(t.peaks(), {
		appCpu: 800,
		appMem: 120,
		dbCpu: 10,
		dbMem: 100,
		dbConnections: 2,
	});

	t.observe({ appCpu: 100, appMem: 50, dbCpu: 300, dbMem: 512, dbConnections: 64 });
	assert.deepStrictEqual(t.peaks(), {
		appCpu: 800,
		appMem: 120,
		dbCpu: 300,
		dbMem: 512,
		dbConnections: 64,
	});

	// Later smaller samples never lower peaks
	t.observe({ appCpu: 1, appMem: 1, dbCpu: 1, dbMem: 1, dbConnections: 1 });
	assert.deepStrictEqual(t.peaks(), {
		appCpu: 800,
		appMem: 120,
		dbCpu: 300,
		dbMem: 512,
		dbConnections: 64,
	});
	console.log("seed/single observer tests passed.");
}

function testPartialSamples() {
	console.log("peak-tracker: partial samples from different observers...");
	const t = createPeakTracker({ appCpu: 0, appMem: 0, dbCpu: 0, dbMem: 0, dbConnections: 0 });
	// top poller observes only cpu/mem dimensions
	t.observe({ appCpu: 900, appMem: 256, dbCpu: 500, dbMem: 2048 });
	// fast poller observes all dimensions
	t.observe({ appCpu: 400, appMem: 128, dbCpu: 200, dbMem: 1024, dbConnections: 90 });
	assert.deepStrictEqual(t.peaks(), {
		appCpu: 900,
		appMem: 256,
		dbCpu: 500,
		dbMem: 2048,
		dbConnections: 90,
	});
	console.log("partial sample tests passed.");
}

function testInterleavedSparse() {
	console.log("peak-tracker: interleaved sparse sequences...");
	const t = createPeakTracker({ appCpu: 2, appMem: 20, dbCpu: 2, dbMem: 200, dbConnections: 0 });
	const fast = [3, 700, 5, 950, 4, 6].map((v) => ({ appCpu: v, appMem: v * 2 }));
	const top = [10, 720, 8].map((v) => ({ appCpu: v, appMem: v, dbCpu: v * 3, dbMem: v * 4 }));
	const final = [{ appCpu: 999, appMem: 1, dbCpu: 1, dbMem: 1, dbConnections: 120 }];
	let i = 0;
	while (i < fast.length || i < top.length) {
		if (fast[i]) t.observe(fast[i]);
		if (top[i]) t.observe(top[i]);
		i++;
	}
	for (const s of final) t.observe(s);
	assert.strictEqual(t.peaks().appCpu, 999);
	assert.strictEqual(t.peaks().appMem, 1900);
	assert.strictEqual(t.peaks().dbCpu, 2160);
	assert.strictEqual(t.peaks().dbMem, 2880);
	assert.strictEqual(t.peaks().dbConnections, 120);
	console.log("interleaved sparse tests passed.");
}

testSeededIdleConverges();
testPartialSamples();
testInterleavedSparse();
console.log("All peak-tracker tests passed!");
