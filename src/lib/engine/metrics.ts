export function parseCpuToM(cpuStr: string | number): number {
  if (typeof cpuStr === "number") return cpuStr;
  if (!cpuStr) return 0;
  const s = cpuStr.trim();
  if (s.toLowerCase().endsWith("m")) {
    return parseFloat(s.slice(0, -1));
  }
  return parseFloat(s) * 1000;
}

export function parseMemToMi(memStr: string | number): number {
  if (typeof memStr === "number") return memStr;
  if (!memStr) return 0;
  const s = memStr.trim().toLowerCase();
  if (s.endsWith("gi")) return parseFloat(s.slice(0, -2)) * 1024;
  if (s.endsWith("mi")) return parseFloat(s.slice(0, -2));
  if (s.endsWith("ki")) return parseFloat(s.slice(0, -2)) / 1024;
  return parseFloat(s);
}

export function ipToHex(ip: string): string {
  const parts = ip.split(".").map(Number);
  return parts
    .reverse()
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

export interface PodCgroupState {
  lastUsageUsec?: number;
  lastTimestampMs?: number;
}

export function parseCgroupCpuAndMem(
  rawOutput: string,
  state: PodCgroupState,
  nowMs: number = Date.now()
): { cpu: number; memory: number } {
  let usageUsec: number | null = null;
  let memoryBytes: number | null = null;

  const [cgroupPart, memPart] = rawOutput.split("---MEM---");

  if (cgroupPart) {
    const match = cgroupPart.match(/usage_usec\s+(\d+)/);
    if (match) {
      usageUsec = parseInt(match[1], 10);
    } else {
      const lines = cgroupPart.trim().split("\n");
      for (const line of lines) {
        const num = parseInt(line.trim(), 10);
        if (!isNaN(num) && num > 100000) {
          usageUsec = Math.round(num / 1000);
          break;
        }
      }
    }
  }

  if (memPart) {
    const lines = memPart.trim().split("\n");
    for (const line of lines) {
      const num = parseInt(line.trim(), 10);
      if (!isNaN(num) && num > 0) {
        memoryBytes = num;
        break;
      }
    }
  }

  let cpu = 0;
  if (
    usageUsec !== null &&
    state.lastUsageUsec !== undefined &&
    state.lastTimestampMs !== undefined
  ) {
    const elapsedSec = (nowMs - state.lastTimestampMs) / 1000;
    const deltaUsec = usageUsec - state.lastUsageUsec;
    if (elapsedSec > 0.05 && deltaUsec >= 0) {
      cpu = Math.round(deltaUsec / (elapsedSec * 1000));
    }
  }

  if (usageUsec !== null) {
    state.lastUsageUsec = usageUsec;
    state.lastTimestampMs = nowMs;
  }

  const memory = memoryBytes !== null ? Math.round(memoryBytes / (1024 * 1024)) : 0;
  return { cpu, memory };
}

/** Count connections to `port` on the db pod originating from app pod IPs,
 *  from /proc/net/tcp or ss/netstat textual output. */
export function countEstablishedConnections(
  netOutput: string,
  port: number,
  appPodIps: string[]
): number {
  const portHex = port.toString(16).toUpperCase().padStart(4, "0");
  const appIpHexes = appPodIps.map(ipToHex);
  let count = 0;

  for (const line of netOutput.trim().split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4 && parts[1]?.includes(":")) {
      const localAddr = parts[1];
      const remAddr = parts[2];
      const state = parts[3];
      if (
        localAddr.endsWith(`:${portHex}`) &&
        state === "01" &&
        remAddr &&
        appIpHexes.some((hex) => remAddr.startsWith(`${hex}:`))
      ) {
        count++;
      }
    } else if (parts.length >= 5) {
      const isNetstat = parts[0].startsWith("tcp");
      const state = isNetstat ? parts[5] : parts[0];
      const localAddr = isNetstat ? parts[3] : parts[3] || "";
      const remAddr = isNetstat ? parts[4] : parts[4] || "";
      if (
        localAddr.endsWith(`:${port}`) &&
        (state === "ESTABLISHED" || state === "ESTAB") &&
        remAddr &&
        appPodIps.some((ip) => remAddr.startsWith(`${ip}:`))
      ) {
        count++;
      }
    }
  }
  return count;
}

/** Parse the combined db-pod exec output (netstat + cgroup sections). */
export function parseDbMetricsAndConnections(
  rawOutput: string,
  port: number,
  appPodIps: string[],
  dbCgroupState: PodCgroupState
): { connections: number; cpu: number; memory: number } {
  const [netPart, cgroupAndMemPart] = rawOutput.split("---CGROUP---");

  let connections = 0;
  if (netPart && appPodIps.length > 0) {
    connections = countEstablishedConnections(netPart, port, appPodIps);
  }

  let cpu = 0;
  let memory = 0;
  if (cgroupAndMemPart) {
    const cgroupRes = parseCgroupCpuAndMem(cgroupAndMemPart, dbCgroupState);
    cpu = cgroupRes.cpu;
    memory = cgroupRes.memory;
  }

  return { connections, cpu, memory };
}

export const CGROUP_READ_COMMAND =
  "cat /sys/fs/cgroup/cpu.stat 2>/dev/null || cat /sys/fs/cgroup/cpuacct/cpuacct.usage 2>/dev/null ; echo '---MEM---' ; cat /sys/fs/cgroup/memory.current 2>/dev/null || cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null";

export const DB_POD_READ_COMMAND = `cat /proc/net/tcp /proc/net/tcp6 2>/dev/null || ss -tan 2>/dev/null || netstat -tan 2>/dev/null ; echo '---CGROUP---' ; cat /sys/fs/cgroup/cpu.stat 2>/dev/null || cat /sys/fs/cgroup/cpuacct/cpuacct.usage 2>/dev/null ; echo '---MEM---' ; cat /sys/fs/cgroup/memory.current 2>/dev/null || cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null`;

export function parseK6Summary(output: string): {
  totalRequests: number;
  requestPerSecond: number;
  latencyAverageMs: number;
  latencyMaxMs: number;
  latencyMinMs: number;
  errorCount: number;
} {
  const defaults = {
    totalRequests: 0,
    requestPerSecond: 0,
    latencyAverageMs: 0,
    latencyMaxMs: 0,
    latencyMinMs: 0,
    errorCount: 0,
  };

  const startMarker = "K6_JSON_SUMMARY_START";
  const endMarker = "K6_JSON_SUMMARY_END";
  const startIdx = output.indexOf(startMarker);
  const endIdx = output.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    return defaults;
  }

  try {
    const jsonStr = output.substring(startIdx + startMarker.length, endIdx).trim();
    const data = JSON.parse(jsonStr);

    const httpReqs = data.metrics?.http_reqs?.values;
    const httpDuration = data.metrics?.http_req_duration?.values;
    const httpFailed = data.metrics?.http_req_failed?.values;

    return {
      totalRequests: httpReqs?.count || 0,
      requestPerSecond: Number((httpReqs?.rate || 0).toFixed(2)),
      latencyAverageMs: Number((httpDuration?.avg || 0).toFixed(4)),
      latencyMaxMs: Number((httpDuration?.max || 0).toFixed(4)),
      latencyMinMs: Number((httpDuration?.min || 0).toFixed(4)),
      errorCount: httpFailed?.passes || 0,
    };
  } catch {
    return defaults;
  }
}

export interface ErrorSample {
  status: number;
  body: string;
}

export function parseK6Errors(output: string): ErrorSample[] {
  const prefix = "K6_ERROR_SAMPLE:";
  const samples: ErrorSample[] = [];
  const seen = new Set<string>();

  for (const line of output.split("\n")) {
    const idx = line.indexOf(prefix);
    if (idx === -1) continue;
    try {
      const raw = JSON.parse(line.substring(idx + prefix.length).trim());
      const key = `${raw.status}:${raw.body}`;
      if (!seen.has(key)) {
        seen.add(key);
        samples.push({ status: raw.status, body: raw.body });
      }
    } catch {}
  }
  return samples;
}
