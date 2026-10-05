"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_TEST_TYPES, DatabaseType, TestType, extractRepoName, DEFAULT_BENCHMARK_CONFIG } from "@/lib/engine/types";
import { DATABASE_ENGINES, databaseProfiles } from "@/lib/engine/database-profiles";
import { Database, Play, CheckSquare, Square, Settings, Layers, Zap, RotateCcw, Plus, X } from "lucide-react";

const STORAGE_KEY = "benchhub_config";

export default function SetupPage() {
  const router = useRouter();

  const [repoUrls, setRepoUrls] = useState<string[]>([DEFAULT_BENCHMARK_CONFIG.repoUrl]);
  const [database, setDatabase] = useState<DatabaseType>(DEFAULT_BENCHMARK_CONFIG.database);
  const [selectedTypes, setSelectedTypes] = useState<TestType[]>([...ALL_TEST_TYPES]);
  const [vus, setVus] = useState(DEFAULT_BENCHMARK_CONFIG.vus);
  const [totalRecords, setTotalRecords] = useState(DEFAULT_BENCHMARK_CONFIG.totalRecords);
  const [maxPoolSize, setMaxPoolSize] = useState(DEFAULT_BENCHMARK_CONFIG.maxPoolSize);
  const [runCount, setRunCount] = useState(1);
  const [typeWorkloads, setTypeWorkloads] = useState<Partial<Record<TestType, { vus: number; totalRecords: number }>>>({});
  const [showTypeOverrides, setShowTypeOverrides] = useState(false);

  const [appCpuLimit, setAppCpuLimit] = useState(DEFAULT_BENCHMARK_CONFIG.appCpuLimit);
  const [appMemLimit, setAppMemLimit] = useState(DEFAULT_BENCHMARK_CONFIG.appMemLimit);
  const [dbCpuLimit, setDbCpuLimit] = useState(DEFAULT_BENCHMARK_CONFIG.dbCpuLimit);
  const [dbMemLimit, setDbMemLimit] = useState(DEFAULT_BENCHMARK_CONFIG.dbMemLimit);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load configuration from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.repoUrls) && parsed.repoUrls.length > 0) {
          setRepoUrls(parsed.repoUrls.map((u: unknown) => String(u)));
        } else if (typeof parsed.repoUrl === "string") {
          setRepoUrls([parsed.repoUrl]);
        }
        if (parsed.database !== undefined) setDatabase(parsed.database);
        if (Array.isArray(parsed.selectedTypes) && parsed.selectedTypes.length > 0) {
          setSelectedTypes(parsed.selectedTypes);
        }
        if (parsed.vus !== undefined) setVus(Number(parsed.vus));
        if (parsed.totalRecords !== undefined) setTotalRecords(Number(parsed.totalRecords));
        if (parsed.maxPoolSize !== undefined) setMaxPoolSize(Number(parsed.maxPoolSize));
        if (parsed.runCount !== undefined) setRunCount(Number(parsed.runCount));
        if (parsed.typeWorkloads && typeof parsed.typeWorkloads === "object") {
          setTypeWorkloads(parsed.typeWorkloads);
        }
        if (parsed.showTypeOverrides !== undefined) {
          setShowTypeOverrides(Boolean(parsed.showTypeOverrides));
        }
        if (parsed.appCpuLimit !== undefined) setAppCpuLimit(parsed.appCpuLimit);
        if (parsed.appMemLimit !== undefined) setAppMemLimit(parsed.appMemLimit);
        if (parsed.dbCpuLimit !== undefined) setDbCpuLimit(parsed.dbCpuLimit);
        if (parsed.dbMemLimit !== undefined) setDbMemLimit(parsed.dbMemLimit);
      }
    } catch { }
    setIsLoaded(true);
  }, []);

  // Save configuration to localStorage whenever it changes
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const config = {
        repoUrls,
        database,
        selectedTypes,
        vus,
        totalRecords,
        typeWorkloads,
        showTypeOverrides,
        maxPoolSize,
        runCount,
        appCpuLimit,
        appMemLimit,
        dbCpuLimit,
        dbMemLimit,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch { }
  }, [
    isLoaded,
    repoUrls,
    database,
    selectedTypes,
    vus,
    totalRecords,
    typeWorkloads,
    showTypeOverrides,
    maxPoolSize,
    runCount,
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

  const updateRepoUrl = (index: number, value: string) => {
    setRepoUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  };

  const addRepoUrl = () => setRepoUrls((prev) => [...prev, ""]);

  const removeRepoUrl = (index: number) =>
    setRepoUrls((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const activeRepos = repoUrls.map((u) => u.trim()).filter(Boolean);

  const resetDefaults = () => {
    setRepoUrls([DEFAULT_BENCHMARK_CONFIG.repoUrl]);
    setDatabase(DEFAULT_BENCHMARK_CONFIG.database);
    setSelectedTypes([...ALL_TEST_TYPES]);
    setVus(DEFAULT_BENCHMARK_CONFIG.vus);
    setTotalRecords(DEFAULT_BENCHMARK_CONFIG.totalRecords);
    setMaxPoolSize(DEFAULT_BENCHMARK_CONFIG.maxPoolSize);
    setRunCount(1);
    setTypeWorkloads({});
    setShowTypeOverrides(false);
    setAppCpuLimit(DEFAULT_BENCHMARK_CONFIG.appCpuLimit);
    setAppMemLimit(DEFAULT_BENCHMARK_CONFIG.appMemLimit);
    setDbCpuLimit(DEFAULT_BENCHMARK_CONFIG.dbCpuLimit);
    setDbMemLimit(DEFAULT_BENCHMARK_CONFIG.dbMemLimit);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { }
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
      setError("Please add at least one target repository.");
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
          repoUrls: activeRepos,
          database,
          types: selectedTypes,
          vus,
          totalRecords,
          typeWorkloads,
          maxPoolSize,
          runCount,
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
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <Zap className="w-8 h-8 text-sky-400" />
          Benchmark Setup
        </h1>
        <p className="mt-2 text-slate-400 text-sm">
          Configure test parameters, target repository, and target database. Executes inside Kubernetes using k6.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-slate-900 border border-dashed border-slate-600 text-slate-200 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Repository */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-semibold text-slate-200">
              Target Repositories (Git URLs or Local Paths)
              <span className="ml-2 text-xs font-normal text-slate-500">
                {activeRepos.length} selected — {runCount} run{runCount === 1 ? "" : "s"} each
              </span>
            </label>
            <button
              type="button"
              onClick={() => setShowRequirements(!showRequirements)}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold"
            >
              {showRequirements ? "Hide Specification" : "View Repository Requirements"}
            </button>
          </div>

          <div className="space-y-2">
            {repoUrls.map((url, index) => (
              <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => updateRepoUrl(index, e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-sky-500 font-mono"
                  placeholder="https://github.com/..."
                />
                <div className="flex items-center gap-2 sm:w-56">
                  <span className="text-xs text-slate-500 flex-1 truncate">
                    Name:{" "}
                    <span className="text-sky-400 font-mono font-semibold">
                      {url.trim() ? extractRepoName(url) : "—"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRepoUrl(index)}
                    disabled={repoUrls.length <= 1}
                    className="p-1.5 text-slate-500 hover:text-white rounded transition-colors disabled:opacity-30 disabled:hover:text-slate-500 disabled:cursor-not-allowed"
                    title={repoUrls.length <= 1 ? "At least one repository is required" : "Remove repository"}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
            <button
              type="button"
              onClick={addRepoUrl}
              className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Repository</span>
            </button>
            <span>Each must contain a valid Dockerfile in the repository root.</span>
          </div>

          {showRequirements && (
            <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-300 space-y-3 font-mono">
              <div className="text-sky-400 font-bold font-sans text-sm">Competitor Repository Specification</div>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
                <li><strong className="text-slate-200">Dockerfile:</strong> Must exist in repository root; listens on port 3000.</li>
                <li><strong className="text-slate-200">Environment:</strong> Receives `.env` at <code className="text-sky-300">/app/.env</code> with <code className="text-sky-300">PORT</code>, <code className="text-sky-300">DATABASE</code>, <code className="text-sky-300">DATABASE_HOST</code>, <code className="text-sky-300">DATABASE_PORT</code>, <code className="text-sky-300">DATABASE_USER</code>, <code className="text-sky-300">DATABASE_PASSWORD</code>, <code className="text-sky-300">DATABASE_NAME</code>, <code className="text-sky-300">DATABASE_MAX_POOL_SIZE</code>.</li>
                <li><strong className="text-slate-200">Health Probes:</strong> Must implement <code className="text-sky-300">GET /probe/readiness</code> and <code className="text-sky-300">GET /probe/liveness</code> returning 200.</li>
                <li><strong className="text-slate-200">Schema:</strong> Table / collection <code className="text-sky-300">world</code> with fields <code className="text-sky-300">id</code> (int) and <code className="text-sky-300">random_number</code> (int).</li>
                <li><strong className="text-slate-200">Endpoints:</strong> All GET: <code className="text-sky-300">/bench/plaintext</code>, <code className="text-sky-300">/bench/json</code>, <code className="text-sky-300">/bench/read-one?id=1</code>, <code className="text-sky-300">/bench/read-many?limit=20&offset=0</code>, <code className="text-sky-300">/bench/create-one?randomNumber=X</code>, <code className="text-sky-300">/bench/create-many?randomNumber=X&...</code>, <code className="text-sky-300">/bench/update-one?record=JSON</code>, <code className="text-sky-300">/bench/update-many?record=JSON&...</code>, <code className="text-sky-300">/bench/delete-one?id=X</code>, <code className="text-sky-300">/bench/delete-many?id=X&...</code>.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Database Selection */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Database className="w-4 h-4 text-sky-400" />
            <span>Target Database</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DATABASE_ENGINES.map((id) => {
              const db = { id, label: databaseProfiles[id].label, desc: databaseProfiles[id].description };
              return (
              <button
                key={db.id}
                type="button"
                onClick={() => setDatabase(db.id)}
                className={`p-4 rounded-lg border text-left transition-all ${database === db.id
                  ? "border-sky-500 bg-sky-950/30 ring-1 ring-sky-500"
                  : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                  }`}
              >
                <div className="font-semibold text-white text-sm">{db.label}</div>
                <div className="text-xs text-slate-400 mt-1">{db.desc}</div>
              </button>
              );
            })}
          </div>
        </div>

        {/* Test Types Selection */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Benchmark Test Types ({selectedTypes.length} selected)</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {ALL_TEST_TYPES.map((type) => {
              const isSelected = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-mono transition-colors ${isSelected
                    ? "border-sky-500 bg-sky-950/40 text-sky-300 font-semibold"
                    : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                    }`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-sky-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <span className="truncate">{type}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Workload Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Workload Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Global defaults applied to all tests unless overridden per type.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTypeOverrides(!showTypeOverrides)}
                className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 font-semibold rounded-lg transition-colors border border-slate-700"
              >
                {showTypeOverrides ? "Hide Per-Type Settings" : "Configure Per-Type Workload"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Default Virtual Users (VUs)
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={vus}
                onChange={(e) => setVus(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
              <p className="text-xs text-slate-500 mt-1">Default concurrency for all test types</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Default Total Records / Requests
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                value={totalRecords}
                onChange={(e) => setTotalRecords(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
              <p className="text-xs text-slate-500 mt-1">Default 100,000</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                App DB Max Pool Size
              </label>
              <input
                type="number"
                min="1"
                value={maxPoolSize}
                onChange={(e) => setMaxPoolSize(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
              <p className="text-xs text-slate-500 mt-1">Connection % denominator</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Runs per Repo
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={runCount}
                onChange={(e) => setRunCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                {activeRepos.length * runCount} queued sequentially
              </p>
            </div>
          </div>

          {/* Per-Type Workload Table */}
          {showTypeOverrides && (
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Per-Type Workload Overrides ({selectedTypes.length} selected types)
                </span>
                {Object.keys(typeWorkloads).length > 0 && (
                  <button
                    type="button"
                    onClick={applyDefaultsToAllTypes}
                    className="text-xs text-slate-400 hover:text-white font-medium"
                  >
                    Reset all to global defaults
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Test Type</th>
                      <th className="py-2.5 px-3">VUs</th>
                      <th className="py-2.5 px-3">Target Records / Reqs</th>
                      <th className="py-2.5 px-3">Actual k6 Requests</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {selectedTypes.map((type) => {
                      const isMany = type === "read-many" || type === "create-many" || type === "update-many" || type === "delete-many";
                      const currentVus = typeWorkloads[type]?.vus ?? vus;
                      const currentRecords = typeWorkloads[type]?.totalRecords ?? totalRecords;
                      const calculatedReqs = isMany ? Math.ceil(currentRecords / 20) : currentRecords;
                      const isOverridden = typeWorkloads[type] !== undefined;

                      return (
                        <tr key={type} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3">
                            <div className="font-semibold text-sky-400 flex items-center gap-2">
                              <span>{type}</span>
                              {isMany && (
                                <span className="text-[10px] font-sans px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                                  batch (20/req)
                                </span>
                              )}
                              {isOverridden && (
                                <span className="text-[10px] font-sans px-1.5 py-0.5 bg-sky-950 text-sky-300 border border-sky-800 rounded">
                                  custom
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="1"
                              max="1000"
                              value={currentVus}
                              onChange={(e) => updateTypeWorkload(type, "vus", Number(e.target.value))}
                              className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono focus:border-sky-500"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="1000"
                              step="1000"
                              value={currentRecords}
                              onChange={(e) => updateTypeWorkload(type, "totalRecords", Number(e.target.value))}
                              className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono focus:border-sky-500"
                            />
                          </td>
                          <td className="py-2 px-3 text-slate-400">
                            {calculatedReqs.toLocaleString()} reqs
                          </td>
                          <td className="py-2 px-3 text-right">
                            {isOverridden ? (
                              <button
                                type="button"
                                onClick={() => clearTypeWorkload(type)}
                                className="text-slate-500 hover:text-white text-xs"
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span>Kubernetes Pod Resource Limits</span>
            <span className="text-xs text-slate-500 font-normal ml-2">
              {showAdvanced ? "(Hide)" : "(Show)"}
            </span>
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-800">
              <div>
                <label className="block text-xs text-slate-400 mb-1">App CPU Limit</label>
                <input
                  type="text"
                  value={appCpuLimit}
                  onChange={(e) => setAppCpuLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">App Mem Limit</label>
                <input
                  type="text"
                  value={appMemLimit}
                  onChange={(e) => setAppMemLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">DB CPU Limit</label>
                <input
                  type="text"
                  value={dbCpuLimit}
                  onChange={(e) => setDbCpuLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">DB Mem Limit</label>
                <input
                  type="text"
                  value={dbMemLimit}
                  onChange={(e) => setDbMemLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-4 pb-5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={resetDefaults}
            className="px-5 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 border border-slate-700"
            title="Reset configuration to default settings"
          >
            <RotateCcw className="w-4 h-4 text-slate-400" />
            <span>Reset Defaults</span>
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-base rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 disabled:opacity-50"
          >
            <Play className="w-5 h-5 fill-current" />
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
