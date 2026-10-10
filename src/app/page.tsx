"use client";

import {
	CheckSquare,
	ChevronDown,
	Layers,
	Play,
	Plus,
	RotateCcw,
	Settings,
	Square,
	X,
	Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type KnownRepo, RepoCombobox } from "@/components/RepoCombobox";
import { cn } from "@/lib/cn";
import { DATABASE_ENGINES, databaseProfiles } from "@/lib/engine/database-profiles";
import { validDatabase } from "@/lib/engine/input-validation";
import {
	ALL_TEST_TYPES,
	type DatabaseType,
	DEFAULT_BENCHMARK_CONFIG,
	extractRepoName,
	type TestType,
} from "@/lib/engine/types";

const STORAGE_KEY = "benchhub_config";

interface RepoEntry {
	id: string;
	url: string;
	database: DatabaseType;
	enabled: boolean;
}

const defaultRepo = (): RepoEntry => ({
	id: crypto.randomUUID(),
	url: DEFAULT_BENCHMARK_CONFIG.repoUrl,
	database: DEFAULT_BENCHMARK_CONFIG.database,
	enabled: true,
});

export default function SetupPage() {
	const router = useRouter();

	const [repos, setRepos] = useState<RepoEntry[]>([defaultRepo()]);
	const [knownRepos, setKnownRepos] = useState<KnownRepo[]>([]);
	const [selectedTypes, setSelectedTypes] = useState<TestType[]>([...ALL_TEST_TYPES]);
	const [vus, setVus] = useState(DEFAULT_BENCHMARK_CONFIG.vus);
	const [totalRecords, setTotalRecords] = useState(DEFAULT_BENCHMARK_CONFIG.totalRecords);
	const [warmupSeconds, setWarmupSeconds] = useState(DEFAULT_BENCHMARK_CONFIG.warmupSeconds);
	const [cooldownSeconds, setCooldownSeconds] = useState(DEFAULT_BENCHMARK_CONFIG.cooldownSeconds);
	const [maxPoolSize, setMaxPoolSize] = useState(DEFAULT_BENCHMARK_CONFIG.maxPoolSize);
	const [runCount, setRunCount] = useState(1);
	const [typeWorkloads, setTypeWorkloads] = useState<
		Partial<Record<TestType, { vus: number; totalRecords: number }>>
	>({});
	const [showTypeOverrides, setShowTypeOverrides] = useState(false);

	const [namespace, setNamespace] = useState(DEFAULT_BENCHMARK_CONFIG.namespace);
	const [appCpuLimit, setAppCpuLimit] = useState(DEFAULT_BENCHMARK_CONFIG.appCpuLimit);
	const [appMemLimit, setAppMemLimit] = useState(DEFAULT_BENCHMARK_CONFIG.appMemLimit);
	const [dbCpuLimit, setDbCpuLimit] = useState(DEFAULT_BENCHMARK_CONFIG.dbCpuLimit);
	const [dbMemLimit, setDbMemLimit] = useState(DEFAULT_BENCHMARK_CONFIG.dbMemLimit);

	const [showAdvanced, setShowAdvanced] = useState(false);
	const [showRequirements, setShowRequirements] = useState(false);
	const [loading, setLoading] = useState(false);
	const [isLoaded, setIsLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Saved-repo registry for the combobox
	const loadKnownRepos = useCallback(async () => {
		try {
			const res = await fetch("/api/repos");
			if (res.ok) setKnownRepos(await res.json());
		} catch {}
	}, []);

	useEffect(() => {
		loadKnownRepos();
	}, [loadKnownRepos]);

	// Load configuration from localStorage on mount
	useEffect(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = JSON.parse(saved);
				if (Array.isArray(parsed.repos) && parsed.repos.length > 0) {
					setRepos(
						parsed.repos.map((r: unknown) => {
							const e = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
							return {
								id: typeof e.id === "string" ? e.id : crypto.randomUUID(),
								url: String(e.url ?? ""),
								database: validDatabase(e.database),
								enabled: e.enabled !== false,
							};
						}),
					);
				} else if (Array.isArray(parsed.repoUrls) && parsed.repoUrls.length > 0) {
					setRepos(
						parsed.repoUrls.map((u: unknown) => ({
							id: crypto.randomUUID(),
							url: String(u),
							database: validDatabase(parsed.database),
							enabled: true,
						})),
					);
				}
				if (Array.isArray(parsed.selectedTypes) && parsed.selectedTypes.length > 0) {
					setSelectedTypes(parsed.selectedTypes);
				}
				if (parsed.vus !== undefined) setVus(Number(parsed.vus));
				if (parsed.totalRecords !== undefined) setTotalRecords(Number(parsed.totalRecords));
				if (parsed.warmupSeconds !== undefined) setWarmupSeconds(Number(parsed.warmupSeconds));
				if (parsed.cooldownSeconds !== undefined)
					setCooldownSeconds(Number(parsed.cooldownSeconds));
				if (parsed.maxPoolSize !== undefined) setMaxPoolSize(Number(parsed.maxPoolSize));
				if (parsed.runCount !== undefined) setRunCount(Number(parsed.runCount));
				if (parsed.typeWorkloads && typeof parsed.typeWorkloads === "object") {
					setTypeWorkloads(parsed.typeWorkloads);
				}
				if (parsed.showTypeOverrides !== undefined) {
					setShowTypeOverrides(Boolean(parsed.showTypeOverrides));
				}
				if (parsed.namespace !== undefined) setNamespace(String(parsed.namespace));
				if (parsed.appCpuLimit !== undefined) setAppCpuLimit(parsed.appCpuLimit);
				if (parsed.appMemLimit !== undefined) setAppMemLimit(parsed.appMemLimit);
				if (parsed.dbCpuLimit !== undefined) setDbCpuLimit(parsed.dbCpuLimit);
				if (parsed.dbMemLimit !== undefined) setDbMemLimit(parsed.dbMemLimit);
			}
		} catch {}
		setIsLoaded(true);
	}, []);

	// Save configuration to localStorage whenever it changes
	useEffect(() => {
		if (!isLoaded) return;
		try {
			const config = {
				repos,
				selectedTypes,
				vus,
				totalRecords,
				warmupSeconds,
				cooldownSeconds,
				typeWorkloads,
				showTypeOverrides,
				maxPoolSize,
				runCount,
				namespace,
				appCpuLimit,
				appMemLimit,
				dbCpuLimit,
				dbMemLimit,
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
		} catch {}
	}, [
		isLoaded,
		repos,
		selectedTypes,
		vus,
		totalRecords,
		warmupSeconds,
		cooldownSeconds,
		typeWorkloads,
		showTypeOverrides,
		maxPoolSize,
		runCount,
		namespace,
		appCpuLimit,
		appMemLimit,
		dbCpuLimit,
		dbMemLimit,
	]);

	const updateTypeWorkload = (type: TestType, field: "vus" | "totalRecords", value: number) => {
		setTypeWorkloads((prev) => ({
			...prev,
			[type]: {
				vus: field === "vus" ? value : (prev[type]?.vus ?? vus),
				totalRecords: field === "totalRecords" ? value : (prev[type]?.totalRecords ?? totalRecords),
			},
		}));
	};

	const clearTypeWorkload = (type: TestType) => {
		setTypeWorkloads((prev) => {
			const next = { ...prev };
			delete next[type];
			return next;
		});
	};

	const applyDefaultsToAllTypes = () => {
		setTypeWorkloads({});
	};

	const saveRepo = async (url: string, database: DatabaseType) => {
		try {
			await fetch("/api/repos", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repoUrl: url, database }),
			});
			await loadKnownRepos();
		} catch {}
	};

	const deleteKnownRepo = async (id: string) => {
		try {
			await fetch(`/api/repos/${id}`, { method: "DELETE" });
			await loadKnownRepos();
		} catch {}
	};

	const updateRepo = (index: number, patch: Partial<RepoEntry>) =>
		setRepos((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

	const addRepo = () =>
		setRepos((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				url: "",
				database: DEFAULT_BENCHMARK_CONFIG.database,
				enabled: true,
			},
		]);

	const removeRepo = (index: number) =>
		setRepos((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

	const activeRepos = repos.filter((r) => r.enabled && r.url.trim());

	const resetDefaults = () => {
		setRepos([defaultRepo()]);
		setSelectedTypes([...ALL_TEST_TYPES]);
		setVus(DEFAULT_BENCHMARK_CONFIG.vus);
		setTotalRecords(DEFAULT_BENCHMARK_CONFIG.totalRecords);
		setWarmupSeconds(DEFAULT_BENCHMARK_CONFIG.warmupSeconds);
		setCooldownSeconds(DEFAULT_BENCHMARK_CONFIG.cooldownSeconds);
		setMaxPoolSize(DEFAULT_BENCHMARK_CONFIG.maxPoolSize);
		setRunCount(1);
		setTypeWorkloads({});
		setShowTypeOverrides(false);
		setNamespace(DEFAULT_BENCHMARK_CONFIG.namespace);
		setAppCpuLimit(DEFAULT_BENCHMARK_CONFIG.appCpuLimit);
		setAppMemLimit(DEFAULT_BENCHMARK_CONFIG.appMemLimit);
		setDbCpuLimit(DEFAULT_BENCHMARK_CONFIG.dbCpuLimit);
		setDbMemLimit(DEFAULT_BENCHMARK_CONFIG.dbMemLimit);
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {}
	};

	const toggleType = (type: TestType) => {
		if (selectedTypes.includes(type)) {
			setSelectedTypes(selectedTypes.filter((t) => t !== type));
		} else {
			setSelectedTypes([...selectedTypes, type]);
		}
	};

	const selectAll = () => setSelectedTypes([...ALL_TEST_TYPES]);
	const clearAll = () => setSelectedTypes([]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (activeRepos.length === 0) {
			setError("Please add and enable at least one target repository.");
			return;
		}
		if (selectedTypes.length === 0) {
			setError("Please select at least one test type.");
			return;
		}
		setError(null);
		setLoading(true);

		try {
			const res = await fetch("/api/benchmarks/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					repos: activeRepos.map((r) => ({ repoUrl: r.url.trim(), database: r.database })),
					types: selectedTypes,
					vus,
					totalRecords,
					warmupSeconds,
					cooldownSeconds,
					typeWorkloads,
					maxPoolSize,
					runCount,
					namespace: namespace.trim() || DEFAULT_BENCHMARK_CONFIG.namespace,
					appCpuLimit,
					appMemLimit,
					dbCpuLimit,
					dbMemLimit,
				}),
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || "Failed to start benchmark");
			}

			router.push("/reports");
		} catch (err: any) {
			setError(err.message);
			setLoading(false);
		}
	};

	return (
		<div className="space-y-8">
			<div>
				<h1 className="flex items-center gap-3 font-extrabold text-3xl text-white tracking-tight">
					<Zap className="h-8 w-8 text-sky-400" />
					Benchmark Setup
				</h1>
				<p className="mt-2 text-slate-400 text-sm">
					Configure test parameters, target repositories, and per-repo target database. Executes
					inside Kubernetes using k6.
				</p>
			</div>

			{error && (
				<div className="rounded-lg border border-slate-600 border-dashed bg-slate-900 p-4 text-slate-200 text-sm">
					{error}
				</div>
			)}

			<form onSubmit={handleSubmit} className="space-y-8">
				{/* Repository */}
				<div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
					<div className="flex items-center justify-between">
						<h3 className="block font-semibold text-slate-200 text-sm">
							Target Repositories (Git URLs or Local Paths)
							<span className="ml-2 font-normal text-slate-500 text-xs">
								{activeRepos.length} of {repos.length} enabled — {runCount} run
								{runCount === 1 ? "" : "s"} each
							</span>
						</h3>
						<button
							type="button"
							onClick={() => setShowRequirements(!showRequirements)}
							className="font-semibold text-sky-400 text-xs hover:text-sky-300"
						>
							{showRequirements ? "Hide Specification" : "View Repository Requirements"}
						</button>
					</div>

					<div className="space-y-2">
						{repos.map((repo, index) => (
							<div
								key={repo.id}
								className={cn(
									"flex flex-col gap-2 sm:flex-row sm:items-end",
									!repo.enabled && "opacity-60",
								)}
							>
								<div className="flex-1 space-y-1">
									<div className="truncate text-slate-500 text-xs">
										Name:{" "}
										<span className="font-mono font-semibold text-sky-400">
											{repo.url.trim() ? extractRepoName(repo.url) : "—"}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => updateRepo(index, { enabled: !repo.enabled })}
											className={cn(
												"h-9 shrink-0 rounded-lg border px-2 transition-colors",
												repo.enabled
													? "border-slate-700 text-sky-400 hover:bg-slate-800/30"
													: "border-slate-800 text-slate-600 hover:bg-slate-800/30",
											)}
											title={
												repo.enabled
													? "Included in run — click to exclude"
													: "Excluded from run — click to include"
											}
										>
											{repo.enabled ? (
												<CheckSquare className="h-4 w-4" />
											) : (
												<Square className="h-4 w-4" />
											)}
										</button>
										<RepoCombobox
											value={repo.url}
											suggestions={knownRepos}
											onChange={(url) => updateRepo(index, { url })}
											onCommit={(url) => saveRepo(url, repo.database)}
											onSelect={(url, database) => {
												updateRepo(index, { url, database: validDatabase(database) });
												saveRepo(url, validDatabase(database));
											}}
											onDelete={deleteKnownRepo}
										/>
									</div>
								</div>
								<div className="relative sm:w-40">
									<select
										value={repo.database}
										onChange={(e) => updateRepo(index, { database: validDatabase(e.target.value) })}
										className="h-9 w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 pr-8 pl-3 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
										title="Target database for this repository"
									>
										{DATABASE_ENGINES.map((id) => (
											<option key={id} value={id}>
												{databaseProfiles[id].label}
											</option>
										))}
									</select>
									<ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
								</div>
								<div className="flex h-9 items-center">
									<button
										type="button"
										onClick={() => removeRepo(index)}
										disabled={repos.length <= 1}
										className="rounded p-1.5 text-slate-500 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-slate-500"
										title={
											repos.length <= 1
												? "At least one repository is required"
												: "Remove repository"
										}
									>
										<X className="h-4 w-4" />
									</button>
								</div>
							</div>
						))}
					</div>

					<div className="flex flex-col justify-between gap-2 text-slate-500 text-xs sm:flex-row sm:items-center">
						<button
							type="button"
							onClick={addRepo}
							className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-300 transition-colors hover:bg-slate-700"
						>
							<Plus className="h-3.5 w-3.5" />
							<span>Add Repository</span>
						</button>
						<span>Each must contain a valid Dockerfile in the repository root.</span>
					</div>

					{showRequirements && (
						<div className="mt-4 space-y-3 border-slate-800 border-t pt-4 font-mono text-slate-300 text-xs">
							<div className="font-bold font-sans text-sky-400 text-sm">
								Competitor Repository Specification
							</div>
							<ul className="list-disc space-y-1.5 pl-5 text-slate-400">
								<li>
									<strong className="text-slate-200">Dockerfile:</strong> Must exist in repository
									root; listens on port 3000.
								</li>
								<li>
									<strong className="text-slate-200">Environment:</strong> Receives `.env` at{" "}
									<code className="text-sky-300">/app/.env</code> with{" "}
									<code className="text-sky-300">PORT</code>,{" "}
									<code className="text-sky-300">DATABASE</code>,{" "}
									<code className="text-sky-300">DATABASE_HOST</code>,{" "}
									<code className="text-sky-300">DATABASE_PORT</code>,{" "}
									<code className="text-sky-300">DATABASE_USER</code>,{" "}
									<code className="text-sky-300">DATABASE_PASSWORD</code>,{" "}
									<code className="text-sky-300">DATABASE_NAME</code>,{" "}
									<code className="text-sky-300">DATABASE_MAX_POOL_SIZE</code>.
								</li>
								<li>
									<strong className="text-slate-200">Health Probes:</strong> Must implement{" "}
									<code className="text-sky-300">GET /probe/readiness</code> and{" "}
									<code className="text-sky-300">GET /probe/liveness</code> returning 200.
								</li>
								<li>
									<strong className="text-slate-200">Schema:</strong> Table / collection{" "}
									<code className="text-sky-300">world</code> with fields{" "}
									<code className="text-sky-300">id</code> (int) and{" "}
									<code className="text-sky-300">random_number</code> (int).
								</li>
								<li>
									<strong className="text-slate-200">Endpoints:</strong> All GET:{" "}
									<code className="text-sky-300">/bench/plaintext</code>,{" "}
									<code className="text-sky-300">/bench/json</code>,{" "}
									<code className="text-sky-300">/bench/read-one?id=1</code>,{" "}
									<code className="text-sky-300">/bench/read-many?limit=20&afterId=0</code>,{" "}
									<code className="text-sky-300">/bench/create-one?randomNumber=X</code>,{" "}
									<code className="text-sky-300">/bench/create-many?randomNumber=X&...</code>,{" "}
									<code className="text-sky-300">/bench/update-one?record=JSON</code>,{" "}
									<code className="text-sky-300">/bench/update-many?record=JSON&...</code>,{" "}
									<code className="text-sky-300">/bench/delete-one?id=X</code>,{" "}
									<code className="text-sky-300">/bench/delete-many?id=X&...</code>.
								</li>
							</ul>
						</div>
					)}
				</div>

				{/* Test Types Selection */}
				<div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 font-semibold text-slate-200 text-sm">
							<Layers className="h-4 w-4 text-sky-400" />
							<span>Benchmark Test Types ({selectedTypes.length} selected)</span>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={selectAll}
								className="rounded bg-slate-800 px-2.5 py-1 text-slate-300 text-xs hover:bg-slate-700"
							>
								Select All
							</button>
							<button
								type="button"
								onClick={clearAll}
								className="rounded bg-slate-800 px-2.5 py-1 text-slate-300 text-xs hover:bg-slate-700"
							>
								Clear
							</button>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
						{ALL_TEST_TYPES.map((type) => {
							const isSelected = selectedTypes.includes(type);
							return (
								<button
									key={type}
									type="button"
									onClick={() => toggleType(type)}
									className={cn(
										"flex items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-xs transition-colors",
										isSelected
											? "border-sky-500 bg-sky-950/40 font-semibold text-sky-300"
											: "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
									)}
								>
									{isSelected ? (
										<CheckSquare className="h-4 w-4 shrink-0 text-sky-400" />
									) : (
										<Square className="h-4 w-4 shrink-0 text-slate-600" />
									)}
									<span className="truncate">{type}</span>
								</button>
							);
						})}
					</div>
				</div>

				{/* Workload Configuration */}
				<div className="space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
					<div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
						<div>
							<h3 className="font-semibold text-slate-200 text-sm">Workload Configuration</h3>
							<p className="mt-0.5 text-slate-500 text-xs">
								Global defaults applied to all tests unless overridden per type.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setShowTypeOverrides(!showTypeOverrides)}
								className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-sky-400 text-xs transition-colors hover:bg-slate-700"
							>
								{showTypeOverrides ? "Hide Per-Type Settings" : "Configure Per-Type Workload"}
							</button>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
						<div>
							<label htmlFor="cfg-vus" className="mb-2 block font-medium text-slate-300 text-xs">
								Default Virtual Users (VUs)
							</label>
							<input
								id="cfg-vus"
								type="number"
								min="1"
								max="1000"
								value={vus}
								onChange={(e) => setVus(Number(e.target.value))}
								className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
							/>
							<p className="mt-1 text-slate-500 text-xs">Default concurrency for all test types</p>
						</div>

						<div>
							<label
								htmlFor="cfg-total-records"
								className="mb-2 block font-medium text-slate-300 text-xs"
							>
								Default Total Records / Requests
							</label>
							<input
								id="cfg-total-records"
								type="number"
								min="1000"
								step="1000"
								value={totalRecords}
								onChange={(e) => setTotalRecords(Number(e.target.value))}
								className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
							/>
							<p className="mt-1 text-slate-500 text-xs">Default 100,000</p>
						</div>

						<div>
							<label
								htmlFor="cfg-max-pool"
								className="mb-2 block font-medium text-slate-300 text-xs"
							>
								App DB Max Pool Size
							</label>
							<input
								id="cfg-max-pool"
								type="number"
								min="1"
								value={maxPoolSize}
								onChange={(e) => setMaxPoolSize(Number(e.target.value))}
								className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
							/>
							<p className="mt-1 text-slate-500 text-xs">Connection % denominator</p>
						</div>

						<div>
							<label
								htmlFor="cfg-run-count"
								className="mb-2 block font-medium text-slate-300 text-xs"
							>
								Runs per Repo
							</label>
							<input
								id="cfg-run-count"
								type="number"
								min="1"
								max="50"
								value={runCount}
								onChange={(e) => setRunCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
								className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
							/>
							<p className="mt-1 text-slate-500 text-xs">
								{activeRepos.length * runCount} queued sequentially
							</p>
						</div>

						<div>
							<label htmlFor="cfg-warmup" className="mb-2 block font-medium text-slate-300 text-xs">
								Warmup Duration (seconds)
							</label>
							<input
								id="cfg-warmup"
								type="number"
								min="0"
								max="3600"
								value={warmupSeconds}
								onChange={(e) => setWarmupSeconds(Number(e.target.value))}
								className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
							/>
							<p className="mt-1 text-slate-500 text-xs">Unmeasured k6 run per test, 0 = off</p>
						</div>

						<div>
							<label
								htmlFor="cfg-cooldown"
								className="mb-2 block font-medium text-slate-300 text-xs"
							>
								Cooldown Duration (seconds)
							</label>
							<input
								id="cfg-cooldown"
								type="number"
								min="0"
								max="3600"
								value={cooldownSeconds}
								onChange={(e) => setCooldownSeconds(Number(e.target.value))}
								className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
							/>
							<p className="mt-1 text-slate-500 text-xs">Settle before idle baseline, 0 = off</p>
						</div>
					</div>

					{/* Per-Type Workload Table */}
					{showTypeOverrides && (
						<div className="space-y-3 border-slate-800 border-t pt-4">
							<div className="flex items-center justify-between">
								<span className="font-bold text-slate-300 text-xs uppercase tracking-wider">
									Per-Type Workload Overrides ({selectedTypes.length} selected types)
								</span>
								{Object.keys(typeWorkloads).length > 0 && (
									<button
										type="button"
										onClick={applyDefaultsToAllTypes}
										className="font-medium text-slate-400 text-xs hover:text-white"
									>
										Reset all to global defaults
									</button>
								)}
							</div>

							<div className="overflow-x-auto rounded-lg border border-slate-800">
								<table className="w-full text-left font-mono text-xs">
									<thead className="border-slate-800 border-b bg-slate-950 text-slate-400">
										<tr>
											<th className="px-3 py-2.5">Test Type</th>
											<th className="px-3 py-2.5">VUs</th>
											<th className="px-3 py-2.5">Target Records / Reqs</th>
											<th className="px-3 py-2.5">Actual k6 Requests</th>
											<th className="px-3 py-2.5 text-right">Status</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-800 text-slate-300">
										{selectedTypes.map((type) => {
											const isMany =
												type === "read-many" ||
												type === "create-many" ||
												type === "update-many" ||
												type === "delete-many";
											const currentVus = typeWorkloads[type]?.vus ?? vus;
											const currentRecords = typeWorkloads[type]?.totalRecords ?? totalRecords;
											const calculatedReqs = isMany
												? Math.ceil(currentRecords / 20)
												: currentRecords;
											const isOverridden = typeWorkloads[type] !== undefined;

											return (
												<tr key={type} className="hover:bg-slate-800/30">
													<td className="px-3 py-2">
														<div className="flex items-center gap-2 font-semibold text-sky-400">
															<span>{type}</span>
															{isMany && (
																<span className="rounded bg-slate-800 px-1.5 py-0.5 font-sans text-[10px] text-slate-400">
																	batch (20/req)
																</span>
															)}
															{isOverridden && (
																<span className="rounded border border-sky-800 bg-sky-950 px-1.5 py-0.5 font-sans text-[10px] text-sky-300">
																	custom
																</span>
															)}
														</div>
													</td>
													<td className="px-3 py-2">
														<input
															type="number"
															min="1"
															max="1000"
															value={currentVus}
															onChange={(e) =>
																updateTypeWorkload(type, "vus", Number(e.target.value))
															}
															className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100 text-xs focus:border-sky-500"
														/>
													</td>
													<td className="px-3 py-2">
														<input
															type="number"
															min="1000"
															step="1000"
															value={currentRecords}
															onChange={(e) =>
																updateTypeWorkload(type, "totalRecords", Number(e.target.value))
															}
															className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100 text-xs focus:border-sky-500"
														/>
													</td>
													<td className="px-3 py-2 text-slate-400">
														{calculatedReqs.toLocaleString()} reqs
													</td>
													<td className="px-3 py-2 text-right">
														{isOverridden ? (
															<button
																type="button"
																onClick={() => clearTypeWorkload(type)}
																className="text-slate-500 text-xs hover:text-white"
																title="Reset to global default"
															>
																Reset
															</button>
														) : (
															<span className="text-slate-600 text-xs">default</span>
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</div>
					)}
				</div>

				{/* Advanced Resource Limits */}
				<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
					<button
						type="button"
						onClick={() => setShowAdvanced(!showAdvanced)}
						className="flex items-center gap-2 font-semibold text-slate-300 text-sm hover:text-white"
					>
						<Settings className="h-4 w-4 text-slate-400" />
						<span>Kubernetes Pod Resource Limits</span>
						<span className="ml-2 font-normal text-slate-500 text-xs">
							{showAdvanced ? "(Hide)" : "(Show)"}
						</span>
					</button>

					{showAdvanced && (
						<div className="mt-4 space-y-4 border-slate-800 border-t pt-4">
							<div>
								<label htmlFor="cfg-namespace" className="mb-1 block text-slate-400 text-xs">
									Kubernetes Namespace
								</label>
								<input
									id="cfg-namespace"
									type="text"
									value={namespace}
									onChange={(e) => setNamespace(e.target.value)}
									placeholder="benchmark"
									className="w-full max-w-xs rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-slate-100 text-xs"
								/>
							</div>
							<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
								<div>
									<label htmlFor="cfg-app-cpu" className="mb-1 block text-slate-400 text-xs">
										App CPU Limit
									</label>
									<input
										id="cfg-app-cpu"
										type="text"
										value={appCpuLimit}
										onChange={(e) => setAppCpuLimit(e.target.value)}
										className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-slate-100 text-xs"
									/>
								</div>
								<div>
									<label htmlFor="cfg-app-mem" className="mb-1 block text-slate-400 text-xs">
										App Mem Limit
									</label>
									<input
										id="cfg-app-mem"
										type="text"
										value={appMemLimit}
										onChange={(e) => setAppMemLimit(e.target.value)}
										className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-slate-100 text-xs"
									/>
								</div>
								<div>
									<label htmlFor="cfg-db-cpu" className="mb-1 block text-slate-400 text-xs">
										DB CPU Limit
									</label>
									<input
										id="cfg-db-cpu"
										type="text"
										value={dbCpuLimit}
										onChange={(e) => setDbCpuLimit(e.target.value)}
										className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-slate-100 text-xs"
									/>
								</div>
								<div>
									<label htmlFor="cfg-db-mem" className="mb-1 block text-slate-400 text-xs">
										DB Mem Limit
									</label>
									<input
										id="cfg-db-mem"
										type="text"
										value={dbMemLimit}
										onChange={(e) => setDbMemLimit(e.target.value)}
										className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-slate-100 text-xs"
									/>
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 border-slate-800 border-t bg-slate-950 px-4 pt-4 pb-5 sm:-mx-6 sm:flex-row sm:px-6 lg:-mx-8 lg:px-8">
					<button
						type="button"
						onClick={resetDefaults}
						className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-4 font-semibold text-slate-300 text-sm transition-colors hover:bg-slate-700"
						title="Reset configuration to default settings"
					>
						<RotateCcw className="h-4 w-4 text-slate-400" />
						<span>Reset Defaults</span>
					</button>
					<button
						type="submit"
						disabled={loading}
						className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-500 py-4 font-bold text-base text-slate-950 shadow-lg shadow-sky-500/20 transition-colors hover:bg-sky-400 disabled:opacity-50"
					>
						<Play className="h-5 w-5 fill-current" />
						<span>
							{loading
								? "Starting Pipeline..."
								: `Start ${activeRepos.length * runCount} Benchmark${activeRepos.length * runCount === 1 ? "" : "s"}`}
						</span>
					</button>
				</div>
			</form>
		</div>
	);
}
