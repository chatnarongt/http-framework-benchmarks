import fs from "node:fs";
import { prepareRepoAndBuildImage } from "./docker";
import { kubectl, runCommand } from "./k8s";

export type PodPhase = "Pending" | "Running" | "Succeeded" | "Failed" | "";

export interface PodInfo {
	name: string;
	phase: PodPhase;
	podIP?: string;
	deletionTimestamp?: string;
}

export interface ResourceRef {
	kind: "deployment" | "service" | "configmap" | "pod";
	name: string;
}

export interface Cluster {
	applyManifest(manifest: string, onLog?: (msg: string) => void): Promise<void>;
	deleteResource(ref: ResourceRef): Promise<void>;
	rolloutWait(deploymentName: string, onLog?: (msg: string) => void): Promise<void>;
	rolloutRestart(deploymentName: string): Promise<void>;
	podPhase(podName: string): Promise<PodPhase>;
	podLogs(podName: string): Promise<string>;
	listPods(label: string): Promise<PodInfo[]>;
	execInPod(podName: string, command: string): Promise<string>;
	buildImage(repoUrl: string, imageTag: string, onLog?: (msg: string) => void): Promise<void>;
	createConfigMapFromFile(name: string, key: string, filePath: string): Promise<void>;
}

function manifestTempPath(prefix: string): string {
	return `/tmp/${prefix}-${process.pid}-${Date.now()}.yaml`;
}

export class KubectlCluster implements Cluster {
	async applyManifest(manifest: string, onLog?: (msg: string) => void): Promise<void> {
		const p = manifestTempPath("manifest");
		fs.writeFileSync(p, manifest);
		await kubectl(`apply -f "${p}"`, onLog);
		try {
			fs.unlinkSync(p);
		} catch {}
	}

	async deleteResource(ref: ResourceRef): Promise<void> {
		await kubectl(`delete ${ref.kind} ${ref.name} --ignore-not-found`, undefined);
	}

	async rolloutWait(deploymentName: string, onLog?: (msg: string) => void): Promise<void> {
		await kubectl(`rollout status deployment/${deploymentName} --timeout=300s`, onLog);
	}

	async rolloutRestart(deploymentName: string): Promise<void> {
		await kubectl(`rollout restart deployment/${deploymentName}`, undefined);
	}

	async podPhase(podName: string): Promise<PodPhase> {
		try {
			const phase = (
				await kubectl(`get pod "${podName}" -o jsonpath='{.status.phase}'`, undefined, 10000)
			)
				.trim()
				.replace(/'/g, "");
			return phase as PodPhase;
		} catch {
			return "";
		}
	}

	async podLogs(podName: string): Promise<string> {
		try {
			return await kubectl(`logs "${podName}"`, undefined, 30000);
		} catch {
			return "";
		}
	}

	async listPods(label: string): Promise<PodInfo[]> {
		try {
			const json = await kubectl(`get pods -l app=${label} -o json`, undefined, 5000);
			const data = JSON.parse(json);
			const items = Array.isArray(data.items) ? data.items : [];
			return items.map((p: any) => ({
				name: p.metadata?.name ?? "",
				phase: (p.status?.phase ?? "") as PodPhase,
				podIP: p.status?.podIP,
				deletionTimestamp: p.metadata?.deletionTimestamp,
			}));
		} catch {
			return [];
		}
	}

	async execInPod(podName: string, command: string): Promise<string> {
		const target = podName.startsWith("pod/") ? podName : `pod/${podName}`;
		return kubectl(`exec ${target} -- sh -c "${command}"`, undefined, 3000);
	}

	async buildImage(
		repoUrl: string,
		imageTag: string,
		onLog?: (msg: string) => void,
	): Promise<void> {
		await prepareRepoAndBuildImage(repoUrl, imageTag, onLog);
	}

	async createConfigMapFromFile(name: string, key: string, filePath: string): Promise<void> {
		await runCommand(
			`kubectl create configmap "${name}" --from-file=${key}="${filePath}" --dry-run=client -o yaml | kubectl apply -f -`,
			undefined,
		);
	}
}

export function resourceKindsInManifest(manifest: string): ResourceRef[] {
	const refs: ResourceRef[] = [];
	for (const doc of manifest.split(/^---$/m)) {
		if (!doc.trim()) continue;
		const kindMatch = /"?kind"?\s*:\s*"?(Deployment|Service|ConfigMap|Pod)"?/.exec(doc);
		if (!kindMatch) continue;
		const nameMatch = /"?name"?\s*:\s*"?([A-Za-z0-9._-]+)/.exec(doc);
		if (!nameMatch) continue;
		const kind = kindMatch[1].toLowerCase() as ResourceRef["kind"];
		refs.push({ kind, name: nameMatch[1] });
	}
	return refs;
}
