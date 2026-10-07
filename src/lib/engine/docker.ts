import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./k8s";

export async function prepareRepoAndBuildImage(
	repoUrl: string,
	imageTag: string,
	onLog?: (msg: string) => void,
): Promise<string> {
	let workDir = repoUrl;

	if (
		repoUrl.startsWith("http://") ||
		repoUrl.startsWith("https://") ||
		repoUrl.startsWith("git@")
	) {
		const repoName =
			repoUrl
				.split("/")
				.pop()
				?.replace(/\.git$/, "") || "repo";
		workDir = path.join("/tmp/opencode/repos", repoName);

		if (fs.existsSync(path.join(workDir, ".git"))) {
			onLog?.(`[Docker] Updating existing repository in ${workDir}...\n`);
			await runCommand(`git -C "${workDir}" fetch && git -C "${workDir}" pull`, onLog);
		} else {
			fs.mkdirSync(path.dirname(workDir), { recursive: true });
			onLog?.(`[Docker] Cloning repository ${repoUrl} to ${workDir}...\n`);
			await runCommand(`git clone --depth 1 "${repoUrl}" "${workDir}"`, onLog);
		}
	}

	const dockerfilePath = path.join(workDir, "Dockerfile");
	if (!fs.existsSync(dockerfilePath)) {
		throw new Error(
			`Dockerfile not found in repository root (${workDir}). Please ensure a Dockerfile exists.`,
		);
	}

	onLog?.(`[Docker] Building Docker image ${imageTag} from ${workDir}...\n`);
	await runCommand(`docker buildx build --load -t "${imageTag}" "${workDir}"`, onLog, 600000);
	onLog?.(`[Docker] Docker image ${imageTag} built successfully.\n`);

	return imageTag;
}
