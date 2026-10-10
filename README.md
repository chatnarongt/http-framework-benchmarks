# HTTP Framework Benchmarks

Automated HTTP framework benchmarking engine built with Next.js 16 (App Router), Kubernetes (`kubectl` / Colima), k6, and SQLite (Prisma).

---

## Competitor Repository Requirements

Any repository benchmarked by this tool must satisfy the following specification:

### 1. Dockerfile
- A `Dockerfile` must exist at the root of the repository.
- The built container image must expose and listen on port `3000` (or the port specified by `PORT`).
- The application must support receiving configuration via environment variables and via a `.env` file located at `/app/.env`.

### 2. Environment Variables & `.env`
The runner automatically injects the following environment variables and mounts `/app/.env`:

| Variable | Description | Example |
|---|---|---|
| `PORT` | Listening HTTP port | `3000` |
| `DATABASE` | Selected database engine | `postgres`, `mssql`, `mongodb` |
| `DATABASE_HOST` | Database host name / Kubernetes Service | `postgres-service-xxx` |
| `DATABASE_PORT` | Database port | `5432`, `1433`, `27017` |
| `DATABASE_USER` | Database username | `root`, `sa` |
| `DATABASE_PASSWORD` | Database password | `benchmark`, `Benchmark123!` |
| `DATABASE_NAME` | Database name | `benchmark` |
| `DATABASE_MIN_POOL_SIZE` | Minimum pool connections | `1` |
| `DATABASE_MAX_POOL_SIZE` | Maximum pool connections | Configured in benchmark UI (e.g. `100`) |

### 3. Health Probes
The application must expose the following HTTP GET probe endpoints:
- `GET /probe/readiness` -> HTTP 200 when ready to receive requests.
- `GET /probe/liveness` -> HTTP 200 while operational.

### 4. Database Schema
For database benchmarks, the application connects to a table/collection named `world`:
- `id`: Sequential integer primary key (`1` to `N`).
- `random_number`: Integer value.

### 5. Benchmark HTTP Endpoints
All benchmark operations are executed using HTTP `GET` requests:

| Test Type | HTTP Route | Query Parameters / Format | Expected Behavior |
|---|---|---|---|
| `plaintext` | `GET /bench/plaintext` | None | Returns `Hello, World!` as text/plain. |
| `json` | `GET /bench/json` | None | Returns `{"message":"Hello, World!"}` as application/json. |
| `read-one` | `GET /bench/read-one` | `?id=1` | Returns single record by ID. |
| `read-many` | `GET /bench/read-many` | `?limit=20&afterId=0` | Returns up to 20 records with `id > afterId`, ordered by ID. |
| `create-one` | `GET /bench/create-one` | `?randomNumber=42` | Inserts single record with random number. |
| `create-many` | `GET /bench/create-many` | `?randomNumber=42&randomNumber=43...` (20 items) | Inserts 20 records from repeated query params. |
| `update-one` | `GET /bench/update-one` | `?record={"id":1,"randomNumber":42}` | Updates `random_number` for record with specified ID. |
| `update-many` | `GET /bench/update-many` | `?record={"id":1,...}&record={"id":2,...}...` (20 items) | Updates 20 records from repeated JSON query params. |
| `delete-one` | `GET /bench/delete-one` | `?id=1` | Deletes single record by ID. |
| `delete-many` | `GET /bench/delete-many` | `?id=1&id=2...` (20 items) | Deletes 20 records by repeated ID query params. |

---

## Example Repository

Reference implementations — identical application code and contract, varying only the HTTP adapter and the runtime:

| Repository | HTTP adapter | Runtime |
|---|---|---|
| [chatnarongt/nestjs-platform-express-node](https://github.com/chatnarongt/nestjs-platform-express-node.git) | Express | Node.js |
| [chatnarongt/nestjs-platform-express-bun](https://github.com/chatnarongt/nestjs-platform-express-bun.git) | Express | Bun |
| [chatnarongt/nestjs-platform-fastify-node](https://github.com/chatnarongt/nestjs-platform-fastify-node.git) | Fastify | Node.js |
| [chatnarongt/nestjs-platform-fastify-bun](https://github.com/chatnarongt/nestjs-platform-fastify-bun.git) | Fastify | Bun |

---

## Running BenchHub

### Prerequisites
- Node.js 22+ or Bun 1.4+
- Docker
- Kubernetes (`kubectl`) configured to an active cluster (e.g. Colima / k3s with metrics-server enabled)

### Development
```bash
bun install
bun run dev
```

Visit `http://localhost:3000` to configure and start benchmarks.
