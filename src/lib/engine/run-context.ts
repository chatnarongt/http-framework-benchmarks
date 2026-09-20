import { BenchmarkConfig, extractRepoName } from "./types";

export interface RunContext {
  readonly runId: string;
  readonly repoName: string;
  readonly suffix: string;
  readonly imageTag: string;
  readonly database: BenchmarkConfig["database"];
  readonly appCpuLimit: string;
  readonly appMemLimit: string;
  readonly dbCpuLimit: string;
  readonly dbMemLimit: string;
  readonly app: {
    readonly label: string;
    readonly deploymentName: string;
    readonly serviceName: string;
    readonly envConfigMapName: string;
  };
  readonly db: {
    readonly serviceName: string;
    readonly deploymentName: string;
    readonly label: string;
    readonly configMapName: string;
  };
  /** k6 names per test type: pod + script configmap. */
  k6(testType: string): {
    readonly podName: string;
    readonly configMapName: string;
  };
}

function repoSlugOf(repoName: string): string {
  return (
    repoName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "app"
  );
}

export function createRunContext(runId: string, config: BenchmarkConfig): RunContext {
  const repoName = config.repoName || extractRepoName(config.repoUrl);
  const suffix = runId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-8);
  const slug = repoSlugOf(repoName);

  const base = Object.freeze({
    runId,
    repoName,
    suffix,
    imageTag: `${slug}:${suffix}`,
    database: config.database,
    appCpuLimit: config.appCpuLimit,
    appMemLimit: config.appMemLimit,
    dbCpuLimit: config.dbCpuLimit,
    dbMemLimit: config.dbMemLimit,
    app: Object.freeze({
      label: `app-${suffix}`,
      deploymentName: `app-deployment-${suffix}`,
      serviceName: `app-service-${suffix}`,
      envConfigMapName: `app-env-${suffix}`,
    }),
    db: Object.freeze({
      serviceName: `${config.database}-service-${suffix}`,
      deploymentName: `${config.database}-deployment-${suffix}`,
      label: `${config.database}-${suffix}`,
      configMapName: `${config.database}-init-${suffix}`,
    }),
  });

  return Object.freeze({
    ...base,
    k6: Object.freeze((testType: string) =>
      Object.freeze({
        podName: `k6-${suffix}-${testType}`,
        configMapName: `k6-script-${suffix}-${testType}`,
      })
    ),
  });
}
