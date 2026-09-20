import { DatabaseType } from "./types";
import { RunContext } from "./run-context";

export interface DatabaseManifestOptions {
  totalRecords: number;
  seedData: boolean;
}

export interface AppManifestOptions {
  maxPoolSize: number;
}

export interface DatabaseProfile {
  id: DatabaseType;
  label: string;
  version: string;
  description: string;
  image: string;
  port: number;
  user: string;
  password: string;
  generateManifest(ctx: RunContext, options: DatabaseManifestOptions): string;
  generateAppManifest(ctx: RunContext, options: AppManifestOptions): string;
}

function resourceBlock(cpuLimit: string, memLimit: string): string {
  return `        resources:
          requests:
            cpu: "${cpuLimit}"
            memory: "${memLimit}"
          limits:
            cpu: "${cpuLimit}"
            memory: "${memLimit}"`;
}

function generatePostgresManifest(
  ctx: RunContext,
  { totalRecords, seedData }: DatabaseManifestOptions
): string {
  const { deploymentName, serviceName, configMapName, label: appLabel } = ctx.db;
  const { image, port, user, password } = postgresFacts;

  const seedSql = seedData
    ? `\n    INSERT INTO world (random_number)\n    SELECT FLOOR(RANDOM() * 1000001)::INT\n    FROM generate_series(1, ${totalRecords})\n    WHERE NOT EXISTS (SELECT 1 FROM world);`
    : "";

  return `
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${configMapName}
data:
  init.sql: |
    CREATE TABLE IF NOT EXISTS world (
        id SERIAL PRIMARY KEY,
        random_number INT NOT NULL
    );${seedSql}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appLabel}
  template:
    metadata:
      labels:
        app: ${appLabel}
    spec:
      containers:
      - name: postgres
        image: ${image}
        args:
        - "-c"
        - "max_connections=2000"
        - "-c"
        - "superuser_reserved_connections=20"
        env:
        - name: POSTGRES_USER
          value: ${user}
        - name: POSTGRES_PASSWORD
          value: ${password}
        - name: POSTGRES_DB
          value: benchmark
        ports:
        - containerPort: ${port}
        volumeMounts:
        - name: init-script
          mountPath: /docker-entrypoint-initdb.d
        readinessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - ${user}
            - -d
            - benchmark
          initialDelaySeconds: 2
          periodSeconds: 2
${resourceBlock(ctx.dbCpuLimit, ctx.dbMemLimit)}
      volumes:
      - name: init-script
        configMap:
          name: ${configMapName}
---
apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
spec:
  selector:
    app: ${appLabel}
  ports:
  - protocol: TCP
    port: ${port}
    targetPort: ${port}
`;
}

function generateMssqlManifest(
  ctx: RunContext,
  { totalRecords, seedData }: DatabaseManifestOptions
): string {
  const { deploymentName, serviceName, configMapName, label: appLabel } = ctx.db;
  const { image, port, user, password } = mssqlFacts;

  const seedSql = seedData
    ? `\n    INSERT INTO world (random_number)\n    SELECT TOP (${totalRecords}) ABS(CHECKSUM(NEWID())) % 1000001\n    FROM sys.all_objects a\n    CROSS JOIN sys.all_objects b\n    CROSS JOIN sys.all_objects c;`
    : "";

  return `
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${configMapName}
data:
  init.sql: |
    IF DB_ID('benchmark') IS NULL
        CREATE DATABASE benchmark;
    GO
    USE benchmark;
    GO
    IF OBJECT_ID('world') IS NULL
    BEGIN
        CREATE TABLE world (
            id INT IDENTITY(1,1) PRIMARY KEY,
            random_number INT NOT NULL
        );${seedSql}
    END
    GO
  entrypoint.sh: |
    #!/bin/bash
    set -e
    /opt/mssql/bin/sqlservr &
    for i in {1..45}; do
      if /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" > /dev/null 2>&1; then
        echo "MSSQL is ready, running init.sql..."
        /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -i /scripts/init.sql
        echo "MSSQL initialization complete."
        break
      fi
      sleep 2
    done
    wait
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appLabel}
  template:
    metadata:
      labels:
        app: ${appLabel}
    spec:
      containers:
      - name: mssql
        image: ${image}
        command: ["/bin/bash", "-c", "/scripts/entrypoint.sh"]
        env:
        - name: ACCEPT_EULA
          value: "Y"
        - name: MSSQL_SA_PASSWORD
          value: "${password}"
        ports:
        - containerPort: ${port}
        volumeMounts:
        - name: scripts
          mountPath: /scripts
        readinessProbe:
          exec:
            command:
            - /opt/mssql-tools18/bin/sqlcmd
            - -S
            - localhost
            - -U
            - sa
            - -P
            - "${password}"
            - -C
            - -Q
            - "SELECT 1"
          initialDelaySeconds: 10
          periodSeconds: 3
${resourceBlock(ctx.dbCpuLimit, ctx.dbMemLimit)}
      volumes:
      - name: scripts
        configMap:
          name: ${configMapName}
          defaultMode: 0755
---
apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
spec:
  selector:
    app: ${appLabel}
  ports:
  - protocol: TCP
    port: ${port}
    targetPort: ${port}
`;
}

function generateMongodbManifest(
  ctx: RunContext,
  { totalRecords, seedData }: DatabaseManifestOptions
): string {
  const { deploymentName, serviceName, configMapName, label: appLabel } = ctx.db;
  const { image, port, user, password } = mongodbFacts;

  const seedJs = seedData
    ? `
    if (world.countDocuments() === 0) {
      for (let id = 1; id <= ${totalRecords}; id += 1000) {
        const count = Math.min(1000, ${totalRecords} - id + 1);
        world.insertMany(
          Array.from({ length: count }, (_, index) => ({
            id: id + index,
            random_number: Math.floor(Math.random() * 1000001),
          }))
        );
      }
    }
    const highest = world.find().sort({ id: -1 }).limit(1).next();
    database.getCollection('counters').updateOne(
      { _id: 'world' },
      { $max: { seq: highest ? highest.id : 0 } },
      { upsert: true }
    );`
    : `
    database.getCollection('counters').updateOne(
      { _id: 'world' },
      { $set: { seq: 0 } },
      { upsert: true }
    );`;

  return `
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${configMapName}
data:
  init.js: |
    const database = db.getSiblingDB('benchmark');
    const world = database.getCollection('world');
    world.createIndex({ id: 1 }, { unique: true });${seedJs}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appLabel}
  template:
    metadata:
      labels:
        app: ${appLabel}
    spec:
      containers:
      - name: mongodb
        image: ${image}
        env:
        - name: MONGO_INITDB_ROOT_USERNAME
          value: ${user}
        - name: MONGO_INITDB_ROOT_PASSWORD
          value: ${password}
        - name: MONGO_INITDB_DATABASE
          value: benchmark
        ports:
        - containerPort: ${port}
        volumeMounts:
        - name: init-script
          mountPath: /docker-entrypoint-initdb.d
        readinessProbe:
          exec:
            command:
            - mongosh
            - --quiet
            - -u
            - ${user}
            - -p
            - ${password}
            - --authenticationDatabase
            - admin
            - --eval
            - "db.adminCommand('ping').ok"
          initialDelaySeconds: 5
          periodSeconds: 2
${resourceBlock(ctx.dbCpuLimit, ctx.dbMemLimit)}
      volumes:
      - name: init-script
        configMap:
          name: ${configMapName}
---
apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
spec:
  selector:
    app: ${appLabel}
  ports:
  - protocol: TCP
    port: ${port}
    targetPort: ${port}
`;
}

const postgresFacts = { image: "postgres:18-alpine", port: 5432, user: "root", password: "benchmark" };
const mssqlFacts = { image: "mcr.microsoft.com/mssql/server:2022-latest", port: 1433, user: "sa", password: "Benchmark123!" };
const mongodbFacts = { image: "mongo:8", port: 27017, user: "root", password: "benchmark" };

export const databaseProfiles: Record<DatabaseType, DatabaseProfile> = {
  postgres: {
    id: "postgres",
    label: "PostgreSQL",
    version: "18",
    description: "v18 Alpine",
    ...postgresFacts,
    generateManifest: generatePostgresManifest,
    generateAppManifest,
  },
  mssql: {
    id: "mssql",
    label: "Microsoft SQL Server",
    version: "2022",
    description: "2022 Latest",
    ...mssqlFacts,
    generateManifest: generateMssqlManifest,
    generateAppManifest,
  },
  mongodb: {
    id: "mongodb",
    label: "MongoDB",
    version: "8",
    description: "v8 Community",
    ...mongodbFacts,
    generateManifest: generateMongodbManifest,
    generateAppManifest,
  },
};

export const DATABASE_ENGINES: DatabaseType[] = Object.keys(databaseProfiles) as DatabaseType[];

export function getDatabaseProfile(id: DatabaseType): DatabaseProfile {
  const profile = databaseProfiles[id];
  if (!profile) {
    throw new Error(`Unsupported database engine: ${id}`);
  }
  return profile;
}

function generateAppManifest(ctx: RunContext, { maxPoolSize }: AppManifestOptions): string {
  const { imageTag, database } = ctx;
  const profile = getDatabaseProfile(database);
  const { deploymentName, serviceName: appServiceName } = ctx.app;
  const { configMapName, serviceName: dbServiceName } = {
    configMapName: ctx.app.envConfigMapName,
    serviceName: ctx.db.serviceName,
  };
  const appLabel = ctx.app.label;
  const { port: dbPort, user: dbUser, password: dbPassword } = profile;

  const envContent = `PORT=3000
DATABASE=${database}
DATABASE_HOST=${dbServiceName}
DATABASE_PORT=${dbPort}
DATABASE_USER=${dbUser}
DATABASE_PASSWORD=${dbPassword}
DATABASE_NAME=benchmark
DATABASE_MIN_POOL_SIZE=1
DATABASE_MAX_POOL_SIZE=${maxPoolSize}
`;

  return `
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${configMapName}
data:
  .env: |
${envContent.split("\n").map((l) => "    " + l).join("\n")}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: ${appLabel}
  template:
    metadata:
      labels:
        app: ${appLabel}
    spec:
      terminationGracePeriodSeconds: 2
      containers:
      - name: app
        image: ${imageTag}
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          value: "3000"
        - name: DATABASE
          value: "${database}"
        - name: DATABASE_HOST
          value: "${dbServiceName}"
        - name: DATABASE_PORT
          value: "${dbPort}"
        - name: DATABASE_USER
          value: "${dbUser}"
        - name: DATABASE_PASSWORD
          value: "${dbPassword}"
        - name: DATABASE_NAME
          value: "benchmark"
        - name: DATABASE_MIN_POOL_SIZE
          value: "1"
        - name: DATABASE_MAX_POOL_SIZE
          value: "${maxPoolSize}"
        volumeMounts:
        - name: env-volume
          mountPath: /app/.env
          subPath: .env
${resourceBlock(ctx.appCpuLimit, ctx.appMemLimit)}
        readinessProbe:
          httpGet:
            path: /probe/readiness
            port: 3000
          initialDelaySeconds: 2
          periodSeconds: 2
        livenessProbe:
          httpGet:
            path: /probe/liveness
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: env-volume
        configMap:
          name: ${configMapName}
---
apiVersion: v1
kind: Service
metadata:
  name: ${appServiceName}
spec:
  selector:
    app: ${appLabel}
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
`;
}
