import { prisma } from "../prisma";

/**
 * Durable per-repo timing history for the start-button ETA. Stored on TargetRepo
 * so it survives BenchmarkRun deletion. ponytail: running average only — a
 * samples table would enable percentiles and settings-aware estimates.
 */
export async function recordCompletedDuration(repoUrl: string, durationMs: number): Promise<void> {
	try {
		await prisma.targetRepo.upsert({
			where: { repoUrl },
			create: { repoUrl, durationSamples: 1, durationTotalMs: Math.round(durationMs) },
			update: {
				durationSamples: { increment: 1 },
				durationTotalMs: { increment: Math.round(durationMs) },
			},
		});
	} catch (err) {
		console.error(`Failed to record timing for ${repoUrl}:`, err);
	}
}
