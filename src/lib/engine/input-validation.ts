import { DATABASE_ENGINES } from "./database-profiles";
import {
	ALL_TEST_TYPES,
	type DatabaseType,
	DEFAULT_BENCHMARK_CONFIG,
	type TestType,
} from "./types";

const REPO_URL_PATTERN = /^[A-Za-z0-9._~:@!$&'()*+,;%=-]+:\/\/[^\s"']+$/;

function isHttpLike(url: string): boolean {
	return REPO_URL_PATTERN.test(url) || url.startsWith("git@");
}

function isLocalPath(url: string): boolean {
	return url.length > 0 && !url.includes("..") && /^[A-Za-z0-9._/-]+$/.test(url);
}

export function validRepoUrl(url: unknown): string | null {
	const s = String(url ?? "").trim();
	if (!s) return DEFAULT_BENCHMARK_CONFIG.repoUrl;
	return isHttpLike(s) || isLocalPath(s) ? s : null;
}

export const MAX_REPO_URLS = 20;

/**
 * Batch variant of `validRepoUrl`. Blank entries are dropped rather than
 * defaulted, so empty form rows cannot silently become the default repo.
 * Returns null when nothing survives or when any non-blank entry is invalid.
 */
export function validRepoUrls(raw: unknown): string[] | null {
	const list: unknown[] = Array.isArray(raw) ? raw : [];
	const out: string[] = [];
	for (const item of list) {
		const s = String(item ?? "").trim();
		if (!s) continue;
		const v = validRepoUrl(s);
		if (!v) return null;
		if (out.includes(v)) continue;
		out.push(v);
		if (out.length > MAX_REPO_URLS) return null;
	}
	return out.length > 0 ? out : null;
}

export function validTestTypes(raw: unknown): TestType[] | null {
	const list: unknown[] = Array.isArray(raw) ? raw : [];
	const types = [
		...new Set(
			list.filter(
				(t): t is TestType => typeof t === "string" && (ALL_TEST_TYPES as string[]).includes(t),
			),
		),
	];
	return types.length > 0 ? types : null;
}

export function validDatabase(raw: unknown): DatabaseType {
	return DATABASE_ENGINES.includes(raw as DatabaseType)
		? (raw as DatabaseType)
		: DEFAULT_BENCHMARK_CONFIG.database;
}

export interface RepoEntry {
	repoUrl: string;
	database: DatabaseType;
}

/**
 * Batch variant pairing each repo URL with its own target database.
 * Same blank-drop / dedupe / cap rules as `validRepoUrls`, keyed on the
 * url+database pair so the same repo may run against different engines.
 * Returns null when nothing survives or when any non-blank entry is invalid.
 */
export function validRepos(raw: unknown): RepoEntry[] | null {
	const list: unknown[] = Array.isArray(raw) ? raw : [];
	const out: RepoEntry[] = [];
	const seen = new Set<string>();
	for (const item of list) {
		const entry = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
		const s = String(entry.repoUrl ?? "").trim();
		if (!s) continue;
		const repoUrl = validRepoUrl(s);
		if (!repoUrl) return null;
		const repo: RepoEntry = { repoUrl, database: validDatabase(entry.database) };
		const key = `${repoUrl}\n${repo.database}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(repo);
		if (out.length > MAX_REPO_URLS) return null;
	}
	return out.length > 0 ? out : null;
}

export function boundedInt(value: unknown, min: number, max: number, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n >= min && n <= max ? Math.trunc(n) : fallback;
}

const LIMIT_PATTERN = /^[0-9]+(\.[0-9]+)?(m|Ki|Mi|Gi|Ti)?$/;

export function validLimit(value: unknown, fallback: string): string {
	const s = String(value || "").trim();
	return LIMIT_PATTERN.test(s) ? s : fallback;
}
