import { STATUS_BADGE } from "./status";

export interface RunFilters {
	name: string;
	status: string;
	from: string;
	to: string;
}

export const EMPTY_FILTERS: RunFilters = { name: "", status: "all", from: "", to: "" };

export const STATUS_OPTIONS = ["all", ...Object.keys(STATUS_BADGE)];

export interface FilterableRun {
	id: string;
	repoName: string;
	status: string;
	createdAt: string | Date;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayBound(day: string, endOfDay: boolean): number | null {
	if (!DAY.test(day)) return null;
	const ms = new Date(`${day}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).getTime();
	return Number.isFinite(ms) ? ms : null;
}

export function filterRuns<T extends FilterableRun>(runs: T[], filters: RunFilters): T[] {
	const q = filters.name.trim().toLowerCase();
	const from = dayBound(filters.from, false);
	const to = dayBound(filters.to, true);
	return runs.filter((run) => {
		if (filters.status !== "all" && run.status !== filters.status) return false;
		const created = new Date(run.createdAt).getTime();
		if (from !== null && created < from) return false;
		if (to !== null && created > to) return false;
		if (q) {
			const name = (run.repoName || run.id).toLowerCase();
			if (!name.includes(q) && !run.id.toLowerCase().includes(q)) return false;
		}
		return true;
	});
}
