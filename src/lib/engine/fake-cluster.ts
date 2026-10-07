import {
	type Cluster,
	type PodInfo,
	type PodPhase,
	type ResourceRef,
	resourceKindsInManifest,
} from "./cluster";

interface FakePod {
	name: string;
	label: string;
	phase: PodPhase;
	podIP?: string;
	deletionTimestamp?: string;
	restarts: number;
	phaseReads: number;
}

/**
 * In-memory cluster adapter modeling pod lifecycle:
 *  - applied Pods start Pending; tick() advances Pending -> Running
 *  - pods from applied Deployments auto-tick to Running
 *  - standalone pods (k6) auto-complete: after `autoCompleteAfterReads`
 *    podPhase() reads in Running they transition to Succeeded
 *  - rolloutRestart marks existing pods terminating and adds a fresh Running pod
 *  - tick() removes terminating pods
 */
export class FakeCluster implements Cluster {
	public stdLogs: Record<string, string> = {};
	public builtImages: string[] = [];
	public execCalls: Array<{ pod: string; command: string }> = [];
	public appliedManifests: string[] = [];
	public restartedDeployments: string[] = [];
	/** podPhase() reads in Running before auto-completing standalone pods. */
	public autoCompleteAfterReads = 2;
	private resources = new Map<string, ResourceRef>();
	private pods: FakePod[] = [];

	constructor(private hooks: { onApply?: (manifest: string) => void } = {}) {}

	async applyManifest(manifest: string): Promise<void> {
		this.appliedManifests.push(manifest);
		this.hooks.onApply?.(manifest);
		for (const ref of resourceKindsInManifest(manifest)) {
			this.resources.set(`${ref.kind}/${ref.name}`, ref);
			if (ref.kind === "pod") {
				this.pods.push({
					name: ref.name,
					label: ref.name,
					phase: "Pending",
					podIP: undefined,
					restarts: 0,
					phaseReads: 0,
				});
			}
		}
		await this.tick(); // applied pods go Running (fake has no scheduler)
	}

	async deleteResource(ref: ResourceRef): Promise<void> {
		// ponytail: deleting a deployment does not cascade to its pods here (real
		// kubectl terminates them); fine for resource-accounting assertions — add
		// pod cleanup if a test ever asserts pod teardown after deployment delete.
		this.resources.delete(`${ref.kind}/${ref.name}`);
		this.pods = this.pods.filter((p) => !(ref.kind === "pod" && p.name === ref.name));
	}

	async rolloutWait(_deploymentName: string): Promise<void> {}

	async rolloutRestart(deploymentName: string): Promise<void> {
		this.restartedDeployments.push(deploymentName);
		const deploymentPods = this.pods.filter((p) => p.name.startsWith(`${deploymentName}-`));
		for (const p of deploymentPods) {
			if (p.phase === "Running" && !p.deletionTimestamp) {
				p.deletionTimestamp = new Date().toISOString();
			}
		}
		this.pods.push({
			name: `${deploymentName}-restart${deploymentPods.length + 1}`,
			label: deploymentPods[0]?.label ?? `app-${deploymentName}`,
			phase: "Running",
			podIP: "10.42.1.1",
			restarts: deploymentPods.length,
			phaseReads: 0,
		});
	}

	async podPhase(podName: string): Promise<PodPhase> {
		const pod = this.pods.find((p) => p.name === podName);
		if (!pod) return "";
		if (pod.phase === "Running" && !pod.deletionTimestamp) {
			pod.phaseReads++;
			if (this.autoCompleteAfterReads >= 0 && pod.phaseReads > this.autoCompleteAfterReads) {
				pod.phase = "Succeeded";
			}
		}
		return pod.phase;
	}

	async podLogs(podName: string): Promise<string> {
		return this.stdLogs[podName] ?? "";
	}

	async listPods(label: string): Promise<PodInfo[]> {
		return this.pods
			.filter((p) => p.label === label)
			.map((p) => ({
				name: p.name,
				phase: p.phase,
				podIP: p.podIP,
				deletionTimestamp: p.deletionTimestamp,
			}));
	}

	async execInPod(podName: string, command: string): Promise<string> {
		this.execCalls.push({ pod: podName, command });
		return this.stdLogs[`${podName}:exec:${command}`] ?? "";
	}

	async buildImage(_repoUrl: string, imageTag: string): Promise<void> {
		this.builtImages.push(imageTag);
	}

	async createConfigMapFromFile(name: string, _key: string, _filePath: string): Promise<void> {
		this.resources.set(`configmap/${name}`, { kind: "configmap", name });
	}

	async tick(): Promise<void> {
		for (const [i, p] of this.pods.entries()) {
			if (p.phase === "Pending" && !p.deletionTimestamp) {
				p.phase = "Running";
				p.podIP = `10.42.${(i % 250) + 1}.${(i % 250) + 2}`;
			}
		}
		this.pods = this.pods.filter((p) => !p.deletionTimestamp);
	}

	/** Mark a pod's terminal phase (Succeeded/Failed). */
	async completePod(podName: string, phase: "Succeeded" | "Failed"): Promise<void> {
		const p = this.pods.find((pod) => pod.name === podName);
		if (p) p.phase = phase;
	}

	/** Add a Running pod owned by a deployment (for restart/terminating-pod scenarios). */
	addDeploymentPod(deploymentName: string, label: string, podName: string): void {
		this.resources.set(`deployment/${deploymentName}`, {
			kind: "deployment",
			name: deploymentName,
		});
		this.pods.push({
			name: podName,
			label,
			phase: "Running",
			podIP: "10.42.0.10",
			restarts: 0,
			phaseReads: 0,
		});
	}

	createdResourceNames(): string[] {
		return [...this.resources.values()].map((r) => r.name);
	}

	remainingResourceCount(): number {
		return this.resources.size;
	}

	async deleteAllCreated(): Promise<void> {
		for (const ref of [...this.resources.values()]) {
			await this.deleteResource(ref);
		}
	}
}
