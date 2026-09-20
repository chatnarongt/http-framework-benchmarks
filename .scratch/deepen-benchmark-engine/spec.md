# Spec: Deepen the Benchmark Engine

Status: ready-for-agent

## Problem Statement

Maintainers of the HTTP Framework Benchmarks engine (BenchHub) cannot safely change the benchmark engine. Every Kubernetes resource name for a run is derived twice — once in the orchestrator, once inside the manifest generators — and the two derivations only agree by silent convention; nothing checks them. Every fact about a target database engine (image, port, credentials, seed script for the world table) is copied across five places. The orchestrator's execution body is a single ~500-line undifferentiated mass: to change anything (a rollout timeout, a poller interval, the restart dance) you must load everything. There is no seam between the orchestrator and the cluster: it speaks raw kubectl command strings, so the orchestrator can only be exercised by burning a real Colima cluster, a real Docker build, and a real competitor repo — and the test suite proves it, containing a hand-forked re-implementation of the queue because the real queue had no seam to test through.

Users see the consequences, even if they can't name them: default resource limits disagree between the setup page and the API (256Mi vs 512Mi), so two users who never touch the advanced panel run different benchmarks. Benchmark logs live in an in-memory string flushed to the database only at completion, so a crash forty minutes into a run erases the exact logs needed to diagnose it. And peak metrics are tracked by three copy-pasted merge blocks that must stay in lockstep by hand — adding a metric dimension means remembering to update all three, and nothing fails if you miss one; peaks silently under-report.

## Solution

Deepen the engine's modules so each concern has one home, without changing the engine's external behavior. The queue and the HTTP API contracts stay exactly as they are. Internally:

1. **Run context**: one small module derives every Kubernetes name for a run (deployment, service, configmap, label, image tag) from the run id and benchmark config, once. Manifest generators and the orchestrator both consume it; neither derives names anymore. The tacit "these strings must match" contract becomes a typed fact with a single source.

2. **Database profiles**: one profile table keyed by target database engine, each entry an adapter carrying the engine's image, port, credentials, seed script, and manifest generation. The orchestrator's duplicated `if postgres / else if mssql / else if mongodb` branch blocks collapse to a single profile call. The app manifest, the metrics connection-counting, and the setup page's database cards all read the same table. Adding a new database engine becomes one table entry instead of edits across five files.

3. **Orchestrator phases**: the benchmark execution body keeps its existing small interface (run id, benchmark config, abort signal) but its implementation becomes named phases matching the log lines it already emits: provision the target database, deploy the competitor app, run a single test type (fresh database, k6 load, metric sampling), collect the result, teardown. Abort checking concentrates into one phase-gate helper instead of five scattered inline checks.

4. **Cluster seam**: a single interface between the orchestrator and the cluster/Docker world — apply manifest, delete resource, wait for rollout, read pod phase, exec in pod, list active pods — with two adapters: the real kubectl adapter (a thin body over the existing command runner) and an in-memory fake adapter that models pod lifecycle. This is the only new seam in the codebase. The orchestrator's phases become testable in milliseconds against the fake, no cluster required, and the test suite's forked queue mock is replaced by tests through the real queue.

5. **Run store**: one module owns all writes to the run record. Log appends go to the database incrementally (not held hostage in RAM until completion), status transitions route through one method, and the queued-run log message that currently overwrites instead of appends is fixed.

6. **Peak tracker**: the three copy-pasted peak-merge blocks (fast poller, top poller, final sample) become one tiny module with an observe/peaks interface. Adding a metric dimension is one field, not three sites.

7. **Default config**: one exported default-config constant sits beside the benchmark config interface. The setup page, the start route, and the database schema agree by construction. The 256Mi/512Mi drift dies.

## User Stories

1. As a benchmark maintainer, I want every Kubernetes resource name for a run derived in exactly one place, so that renaming a resource can never silently break the rollout-wait or cleanup calls that reference it.
2. As a benchmark maintainer, I want the manifest generators to accept names rather than re-derive them, so that I can verify naming rules with one assertion block instead of trusting four generators to stay in sync.
3. As a benchmark maintainer, I want the orchestrator to stop hardcoding name templates that mirror the manifest generators' internals, so that there is no tacit cross-module string contract left in the engine.
4. As a benchmark maintainer, I want all facts about a target database engine (image, port, credentials, seed script) in one profile per engine, so that a version bump like postgres 18→19 is a one-line change.
5. As a benchmark maintainer, I want the orchestrator's duplicated database-branching collapsed into a single profile lookup, so that the per-test fresh-database redeploy and the initial deploy provably run the same code path.
6. As a benchmark maintainer, I want the app manifest's database wiring (host, port, user, password) read from the same profile the database manifest used, so that credentials can never disagree between the two.
7. As a benchmark maintainer, I want the connection-counting port table and the setup page's database cards to come from the profile table, so that adding MongoDB Atlas or MySQL touches one entry rather than five files.
8. As a benchmarks user, I want to run benchmarks against a newly supported database engine, so that my framework comparison covers the engines I actually deploy to.
9. As a benchmark maintainer, I want the orchestrator's implementation organized into named phases that match its log output, so that reading "runSingleTest" is enough to debug a restart-timing bug instead of reading the whole execution body.
10. As a benchmark maintainer, I want abort checking handled by a single phase-gate helper, so that adding a new phase cannot forget to check the stop signal.
11. As a benchmarks user, I want my stopped benchmark to actually stop promptly at a phase boundary, so that I don't burn cluster resources on a run I've cancelled.
12. As a benchmark maintainer, I want the orchestrator to speak to the cluster only through one Cluster interface, so that a kubectl flag change (say, grace period behavior) is a one-adapter edit rather than fifteen string sites.
13. As a benchmark maintainer, I want an in-memory fake cluster adapter that models pod lifecycle, so that I can test the full orchestration sequence — deploy, wait, restart, poll, teardown — in milliseconds without Colima, Docker, or a competitor repo.
14. As a benchmark maintainer, I want the real queue tested through its own seam, so that the test suite no longer contains a re-implementation of the queue's algorithm that can drift from the real one.
15. As a benchmark maintainer, I want the teardown logic guaranteed to run for every cluster resource the run created, so that a failed run doesn't leak deployments into the cluster.
16. As a benchmarks user, I want my run's logs written to the database incrementally as they're emitted, so that a crash forty minutes into a run still leaves me the logs up to the crash.
17. As a benchmarks user, I want to reconnect to a run's log stream after a page reload, so that I see the full history including everything streamed before I reconnected.
18. As a benchmark maintainer, I want one module owning all run-record writes, so that the queued-run message appends instead of overwriting existing logs.
19. As a benchmark maintainer, I want peak metric tracking (CPU, RAM, DB connections, idle and peak) implemented once, so that adding a new metric dimension (e.g., DB I/O) is a one-field change that can't silently under-report.
20. As a benchmark maintainer, I want the three sampling sites (fast poller, top poller, final sample) to share one peak tracker, so that their merge behavior is identical by construction.
21. As a benchmarks user, I want the default resource limits identical on the setup page and in the API, so that two users who never open the advanced panel run comparable benchmarks.
22. As a benchmarks user, I want the reset-to-defaults button to restore exactly the defaults the server would use, so that "default" means one thing across the app.
23. As a benchmark maintainer, I want the default config exported from beside the benchmark config interface, so that a default change is a one-line edit with one source of truth.
24. As a benchmarks user, I want the report page to keep showing all 25 collected metric dimensions after this refactor, so that no analysis capability is lost.
25. As a benchmarks user, I want the SSE log stream and status events to behave exactly as before, so that the live-run page keeps working without changes.
26. As a benchmarks user, I want the queue to keep enforcing strict sequential execution of runs, so that benchmarks never contend for the cluster.
27. As a benchmark maintainer, I want the existing pure-function tests (k6 script generation, manifest content, metric parsers, repo-name extraction) to keep passing unchanged, so that the refactor provably preserves behavior.
28. As a benchmark maintainer, I want the database schema unchanged, so that existing benchmark history and reports survive the refactor untouched.
29. As a benchmark maintainer, I want phase-level unit tests runnable in CI without any cluster, so that orchestration regressions are caught before burning real cluster time.
30. As a benchmark maintainer, I want the fake cluster adapter to be the second adapter at a real seam (two adapters = real seam), so that the interface is honest — shaped by the real kubectl adapter's needs and verified by the fake's behavior.

## Implementation Decisions

- **Run context module** (new): a pure derivation from run id + benchmark config producing a frozen record of every Kubernetes name the run touches — image tag, app deployment/service/env-configmap/label, database deployment/service/configmap/label. The manifest generators' interfaces change from taking a bare suffix plus config fields to taking the context plus the fields they genuinely vary (total records, seed flag). The orchestrator reads names from the context and never formats them itself.
- **Database profiles** (new): a profile table keyed by database type, each entry carrying: display label and version, container image, connection port, credentials (user, password), seed script generator for the world table, and manifest generation. Consumers: the orchestrator's two deploy sites (collapsed into one code path), the app manifest's env wiring, the connection-counting port lookup, the setup page's database selection cards. The three manifest generator functions become internal to the profile entries rather than separate exported modules.
- **Orchestrator phases**: the benchmark execution function's interface (run id, config, abort signal) is unchanged — the queue calls it identically. The body is reorganized into named phase functions with explicit inputs: provision target database, deploy the competitor app, run a single test type (fresh database, k6 script + pod, metric sampling, result persistence), teardown. Phases take the run context and the cluster interface. Abort becomes one phase-gate helper called at phase entry.
- **Cluster interface** (the single new seam): apply(manifest), deleteResource(ref), rolloutWait(deployment), podPhase(pod), execInPod(pod, command), activePods(label). The kubectl adapter is a thin body over the existing command runner; the in-memory fake adapter models pod lifecycle transitions (Pending→Running→Succeeded/Failed) so phase polling, rollout waiting, and restart behavior are exercisable. The Docker build step is provisioned through the same seam (the interface grows whatever the real adapter needs for image build — e.g. buildImage(repo, tag) — rather than a second seam).
- **Run store module** (new): owns all writes to the run record — appendLog (SSE emit + incremental database append), setStatus (with optional error). The orchestrator, the queue's enqueue/cancel paths, and status transitions route through it. Log accumulation into an in-memory string for the final flush is removed; each append persists. The enqueue log write becomes a true append.
- **Peak tracker module** (new): createPeakTracker with observe(sample)/peaks() interface over the tracked dimensions (app CPU/mem, db CPU/mem, db connections). Idle values seed it; the fast poller, top poller, and final sample all observe into one tracker; persistence reads peaks().
- **Default config constant** (new, exported beside the benchmark config interface): single source for all defaults (vus, total records, pool size, the four resource limits, repo url fallback). Setup page state initialization and the start route's fallbacks read it.
- **No schema changes**: the Prisma models, the HTTP routes' contracts, the SSE event format, and the queue's sequential semantics are all preserved.
- **The log prefix vocabulary is preserved** ("[Orchestrator]", "[Kubernetes]", "[Metrics]", "[k6]", "[Cleanup]", "[Queue]", "[Docker]") — the phases are named to match it, since the live terminal already teaches users this vocabulary.

## Testing Decisions

- **Good tests here assert external behavior through a seam, never implementation details.** The highest existing seam — the benchmark execution entrypoint as the queue calls it — is the primary surface: given a run, a config, a fake cluster, and a fake run store, a full execution must produce the same observable outcomes as today (status transitions in order, results persisted with identical metric fields, teardown issued for every created resource, abort producing the stopped status). The one new seam (Cluster) exists precisely so this surface is reachable without a real cluster.
- **Modules tested:**
  - Run context: pure derivation — names are deterministic, stable-suffixed, and internally consistent (app/db names share the suffix; label matches manifest content).
  - Database profiles: each profile generates manifests containing its own image/port/credentials and the requested seed script; profile table covers all three engines exhaustively.
  - Orchestrator phases through the Cluster fake: full-run sequence, per-test-type database recreation (fresh database + app restart + terminating-pod wait), k6 pod lifecycle (Running → Succeeded → logs parsed → pod deleted), abort at each phase boundary, and teardown-completeness on both success and failure paths.
  - Queue through its real seam: sequential execution, in-queue cancellation, active-run abort — replacing the existing hand-forked MockQueue re-implementation.
  - Run store: append semantics (never overwrite), status transition writing, incremental persistence.
  - Peak tracker: synthetic sample sequences converge to true peaks across all dimensions; sparse and interleaved samples from three observers.
  - Default config: single source consumed by both UI and API — the drift regression is asserted directly.
- **Prior art**: the existing self-check suite (assert-based, no framework, run as a plain Node script) tests pure functions — repo-name extraction, k6 script generation, manifest contents, metric parsers, and a sequential-execution behavioral check. The new tests extend exactly this pattern: same assert style, same single entrypoint, extended to the fake-adapter-backed orchestration tests. The in-memory cluster fake follows the "in-memory fake adapter" pattern the skill vocabulary names as the large-adapter-small-implementation case.

## Out of Scope

- Any change to the competitor repository specification (Dockerfile, probes, bench endpoints, .env contract) — that interface is fixed and published in the README.
- Any change to the Prisma schema, database engine, or migration.
- Any change to the HTTP API contracts or SSE event format.
- Parallelizing benchmark runs — the queue stays strictly sequential.
- New metric dimensions (e.g., DB I/O) — the peak tracker makes them cheap later, but collecting new ones is not in scope.
- UI redesign; the setup page only changes where its defaults and database cards are sourced from.
- Adding new database engines (e.g., MySQL) — the profile table makes it a follow-up-sized task, but no new engine ships here.
- Replacing kubectl-based interactions with a client library, and replacing the EventEmitter-based SSE transport.

## Further Notes

- Recommended implementation order (dependency-driven): run context first (keystone — profiles and phases consume it), then database profiles, then default config (independent, tiny), then the Cluster seam, then the orchestrator phases (they need the seam's fake to be testable), then peak tracker and run store (independent, can land anytime after phases).
- No ADRs or domain glossary exist in this repo yet. Domain terms used throughout this spec, drawn from the code itself: **run**, **orchestrator**, **queue**, **competitor repo**, **target database**, **test type**, **world table**, **k6 load generator**, **cluster**, **run store**. Recording these in a CONTEXT.md and the key decisions (one new seam; profiles over branches) as ADRs is a worthwhile follow-up but not required to implement.
- The 45-minute k6 deadline, the dual-poller strategy (300ms cgroup / 1000ms kubectl-top), and the terminating-pod wait loop are deliberate existing design; they are preserved as-is, merely relocated into named phases and a shared peak tracker.
- The engine's external interface today is genuinely good (small surface: start → queue → execute → SSE → report). This refactor deepens internals only; callers are unaffected.
