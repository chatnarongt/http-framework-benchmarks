# AGENTS.md

Bun + Next.js 16 app that benchmarks third-party HTTP framework repos on Kubernetes with k6. Run results live in SQLite via Prisma 7.

## Commands
- Run everything from the repo root. The SQLite URL `file:./prisma/benchmark.db` in `src/lib/prisma.ts` and `prisma.config.ts` resolves against the working directory, not the schema file.
- `bun run typecheck`, then `bun run test`, then `bun run build`. There is no lint or formatter config.
- `test`, `build`, and `dev` all run `prisma generate` first.
- To run one suite: `bun test/<name>.test.ts`. Suites are plain `node:assert` scripts, not `bun test` specs. Each new suite has to be added to the `suites` list in `test/run-self-checks.ts`.
- `test/self-check.ts` writes to the real `prisma/benchmark.db`. The other suites don't touch the DB.

## Prisma 7
- The client is generated into `src/generated/prisma/`, which is gitignored. Import it from `@/generated/prisma/client`, never `@prisma/client`.
- Runtime connects through `@prisma/adapter-libsql` (`PrismaLibSql`). The CLI datasource URL lives in `prisma.config.ts` because the schema has no `url`.
- There are no migrations and `*.db` is gitignored. On a fresh checkout, create the DB with `bunx prisma db push`.
- Versions are pinned exactly (`7.10.0`). `prisma` is a devDependency.

## Architecture
- API routes in `src/app/api/**` call `benchmarkQueue` (`src/lib/engine/queue.ts`), an in-process `globalThis` singleton that runs one job at a time. Restarting the server drops queued jobs.
- `executeBenchmark` in `src/lib/engine/runner.ts` goes through the phases build image, provision DB, deploy app, then one k6 pod per test type, then teardown. DB test types recreate the DB and restart the app before each test. `plaintext`/`json` skip the DB.
- All cluster I/O goes through the `Cluster` interface (`src/lib/engine/cluster.ts`). `KubectlCluster` shells out to `kubectl`/`docker buildx`. Tests inject `FakeCluster` via `deps`, so they need no cluster.
- Per-engine manifests (postgres, mssql, mongodb) live in `src/lib/engine/database-profiles.ts`. To add an engine, update `DatabaseType` in `types.ts` and add a profile.
- Request input is validated in `src/lib/engine/input-validation.ts`. Keep that boundary, because the values end up interpolated into shell commands.
- Git repos are cloned to `/tmp/opencode/repos/<name>`. k6 scripts and manifests are written to `/tmp`.
- `README.md` defines the contract benchmarked repos must meet (endpoints, env vars, probes). Keep it in sync with `k6-script.ts` and `database-profiles.ts`.

## Real runs
- Real runs need Docker with buildx, a `kubectl` context whose cluster can see locally built images (e.g. Colima/k3s), and metrics-server.
- The API has no auth. Don't expose it beyond localhost.
