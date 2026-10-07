import type { TestType } from "./types";

export interface K6ScriptOptions {
	/** When set, emit a time-boxed warmup scenario (constant-vus) instead of the measured iteration budget. */
	durationSeconds?: number;
}

export function generateK6Script(
	targetUrl: string,
	testType: TestType,
	vus: number,
	totalRecords: number,
	opts?: K6ScriptOptions,
): { script: string; iterations: number } {
	const isMany =
		testType === "read-many" ||
		testType === "create-many" ||
		testType === "update-many" ||
		testType === "delete-many";

	const warmup = opts?.durationSeconds != null && opts.durationSeconds > 0;
	const iterations = warmup ? 0 : isMany ? Math.ceil(totalRecords / 20) : totalRecords;

	const scenario = warmup
		? `      executor: 'constant-vus',
      vus: ${vus},
      duration: '${opts?.durationSeconds}s',`
		: `      executor: 'shared-iterations',
      vus: ${vus},
      iterations: ${iterations},
      maxDuration: '45m',`;

	const script = `
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';

export const options = {
  scenarios: {
    benchmark: {
${scenario}
    },
  },
};

const TARGET_URL = '${targetUrl}';
const TEST_TYPE = '${testType}';
const _seenErrors = new Set();

export default function () {
  const iter = exec.scenario.iterationInTest;
  let res;

  if (TEST_TYPE === 'plaintext') {
    res = http.get(TARGET_URL + '/bench/plaintext');
  } else if (TEST_TYPE === 'json') {
    res = http.get(TARGET_URL + '/bench/json');
  } else if (TEST_TYPE === 'read-one') {
    const id = iter + 1;
    res = http.get(TARGET_URL + '/bench/read-one?id=' + id);
  } else if (TEST_TYPE === 'read-many') {
    const offset = iter * 20;
    res = http.get(TARGET_URL + '/bench/read-many?limit=20&offset=' + offset);
  } else if (TEST_TYPE === 'create-one') {
    const rand = Math.floor(Math.random() * 1000001);
    res = http.get(TARGET_URL + '/bench/create-one?randomNumber=' + rand);
  } else if (TEST_TYPE === 'create-many') {
    let q = '';
    for (let i = 0; i < 20; i++) {
      q += (i === 0 ? '' : '&') + 'randomNumber=' + Math.floor(Math.random() * 1000001);
    }
    res = http.get(TARGET_URL + '/bench/create-many?' + q);
  } else if (TEST_TYPE === 'update-one') {
    const id = iter + 1;
    const rand = Math.floor(Math.random() * 1000001);
    const rec = JSON.stringify({ id: id, randomNumber: rand });
    res = http.get(TARGET_URL + '/bench/update-one?record=' + rec);
  } else if (TEST_TYPE === 'update-many') {
    const baseId = iter * 20 + 1;
    let q = '';
    for (let i = 0; i < 20; i++) {
      const rec = JSON.stringify({ id: baseId + i, randomNumber: Math.floor(Math.random() * 1000001) });
      q += (i === 0 ? '' : '&') + 'record=' + rec;
    }
    res = http.get(TARGET_URL + '/bench/update-many?' + q);
  } else if (TEST_TYPE === 'delete-one') {
    const id = iter + 1;
    res = http.get(TARGET_URL + '/bench/delete-one?id=' + id);
  } else if (TEST_TYPE === 'delete-many') {
    const baseId = iter * 20 + 1;
    let q = '';
    for (let i = 0; i < 20; i++) {
      q += (i === 0 ? '' : '&') + 'id=' + (baseId + i);
    }
    res = http.get(TARGET_URL + '/bench/delete-many?' + q);
  }

  if (res) {
    const ok = check(res, {
      'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    if (!ok) {
      const body = String(res.body || '').substring(0, 300);
      const key = res.status + ':' + body;
      if (!_seenErrors.has(key)) {
        _seenErrors.add(key);
        console.log('K6_ERROR_SAMPLE:' + JSON.stringify({ status: res.status, body: body }));
      }
    }
  }
}

export function handleSummary(data) {
  return {
    stdout: "K6_JSON_SUMMARY_START\\n" + JSON.stringify(data) + "\\nK6_JSON_SUMMARY_END\\n",
  };
}
`;

	return { script, iterations };
}
