import { exec } from "node:child_process";

export async function runCommand(
	cmd: string,
	onLog?: (msg: string) => void,
	timeoutMs = 300000,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = exec(
			cmd,
			{ timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
			(err, stdout, stderr) => {
				if (err) {
					reject(new Error(`Command failed: ${cmd}\n${stderr || stdout || err.message}`));
					return;
				}
				resolve(stdout);
			},
		);

		proc.stdout?.on("data", (data) => {
			onLog?.(data.toString());
		});

		proc.stderr?.on("data", (data) => {
			onLog?.(data.toString());
		});
	});
}

export async function kubectl(
	args: string,
	onLog?: (msg: string) => void,
	timeoutMs = 60000,
): Promise<string> {
	return runCommand(`kubectl ${args}`, onLog, timeoutMs);
}
