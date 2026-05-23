# Deploy Runtime Config

## What this module does

This module contains every file that controls how the application is packaged and deployed: the `Dockerfile` that builds the container image, the AWS CodeDeploy spec (`appspec.yml`) and its four lifecycle shell scripts that handle bare-metal EC2 deployments, the PM2 process descriptor (`process.json`) that keeps the Node process alive on EC2, and the Helm chart under `helm/` that deploys the same image to Kubernetes (three environment-specific values files: dev, staging, and prod).

## Why this module exists

The application runs in two parallel deployment paths: a legacy EC2 path managed by AWS CodeDeploy, and a newer Kubernetes/Helm path targeting DigitalOcean Kubernetes. Both paths need a shared container image (built by the `Dockerfile`) and separate environment configuration. Keeping all of these artefacts together makes it clear how a code change travels from source to a running process.

## When this module runs / is used

- **On every CI push**: the `Dockerfile` is the build target that produces the container image pushed to the DigitalOcean container registry.
- **On every EC2 CodeDeploy deployment**: the CodeDeploy agent reads `appspec.yml` to discover and run the four lifecycle scripts in order: `BeforeInstall` → `AfterInstall` → `ApplicationStart` → `ApplicationStop`.
- **On every Kubernetes release**: a Helm operator or CI step runs `helm upgrade` using one of the `values-{dev,staging,prod}.yaml` overrides to deploy to the target namespace.
- **PM2 process management**: `process.json` is consumed by `pm2 restart process.json` inside `start_server.sh` to launch or restart the Node process on EC2.

## How it fits in

- **Depends on**: `app.js` (the entry point that `CMD` and PM2 both target), `entrypoint.sh` (pre-creates log directories — but see optimization notes), `winston.js` (writes logs to paths that must exist before the process starts).
- **Depended on by**: Nothing in the application source imports these files. They are consumed exclusively by external tooling: Docker, the CodeDeploy agent, `pm2`, and Helm/Kubernetes.

## Key files

| File | Purpose |
|---|---|
| `Dockerfile` | Builds a Node 22 Alpine image; injects a `GITHUB_TOKEN` build arg to install the private `shared-library` dependency, then removes the token from git config. |
| `appspec.yml` | AWS CodeDeploy manifest: declares file copy destination and the four lifecycle hook scripts. |
| `scripts/install_dependencies.sh` | CodeDeploy `BeforeInstall` hook — sets filesystem ownership and runs `apt-get update`. |
| `scripts/setup_app.sh` | CodeDeploy `AfterInstall` hook — downloads `.env` from S3, runs `npm install`, downloads and installs the `shared-library` zip from S3. |
| `scripts/start_server.sh` | CodeDeploy `ApplicationStart` hook — copies `newrelease/` to `current/`, then calls `pm2 restart process.json`. |
| `scripts/stop_server.sh` | CodeDeploy `ApplicationStop` hook — intentionally does nothing; a comment explains the team chose to skip stopping the server to minimize downtime. |
| `process.json` | PM2 app descriptor: names the process `a2z-insurance`, points at `app.js`, sets `NODE_ENV=production` and `PORT=4015`, disables file watching. |
| `helm/a2z-insurance/Chart.yaml` | Helm chart metadata (name, version, description). |
| `helm/a2z-insurance/values.yaml` | Default Helm values (dev/staging configuration used as the base). |
| `helm/a2z-insurance/values-dev.yaml` | Dev environment overrides. |
| `helm/a2z-insurance/values-staging.yaml` | Staging environment overrides. |
| `helm/a2z-insurance/values-prod.yaml` | Production environment overrides — see optimization notes for critical issues. |
| `helm/a2z-insurance/templates/deployment.yaml` | Kubernetes Deployment; mounts env from ConfigMap + two Secrets; wires liveness/readiness probes to `/ping`. |
| `helm/a2z-insurance/templates/configmap.yaml` | Renders all `config:` entries from the values file into a Kubernetes ConfigMap. |
| `helm/a2z-insurance/templates/hpa.yaml` | Horizontal Pod Autoscaler template (disabled in all current values files). |
| `helm/a2z-insurance/templates/pdb.yaml` | Pod Disruption Budget template (disabled in all current values files). |

## Optimization opportunities

### 1. Production Helm values are copy-pasted from staging and never corrected
- **What**: `values-prod.yaml` contains `NODE_ENV: "development"`, `nodeSelector: env: staging`, staging internal service URLs (`.a2z-staging.svc.cluster.local`), staging DB hosts (`proxysql.a2z-dev.svc.cluster.local`), staging S3 buckets (`a2z-staging`), and the `non-prod` container registry. The file comment even reads "DB values copied from callback dev Helm values."
- **Why**: Running production pods with `NODE_ENV=development` enables dev-only features (e.g. the Swagger UI is mounted for any request, not just partner URLs) and may suppress production-mode framework optimizations. Wrong service URLs will silently route traffic to staging microservices. This is a live correctness and security risk.
- **When**: Now
- **Where**: `helm/a2z-insurance/values-prod.yaml`, lines 65 (`nodeSelector`), 71 (`NODE_ENV`), 78–119 (all DB/Redis/S3/service URLs)

### 2. `entrypoint.sh` is never called in containerized deployments
- **What**: The `Dockerfile` ends with `CMD ["node", "app.js"]` and has no `ENTRYPOINT` directive, so `entrypoint.sh` never runs inside Docker or Kubernetes pods.
- **Why**: `entrypoint.sh` pre-creates ~50 `logs/services/*` subdirectories that Winston transports may try to write to. Without those directories the process either fails silently or crashes on the first log write to a missing path. The `Dockerfile` manually creates only `logs uploads public/storage/temp` — `logs/error` and all `logs/services/*` paths are absent in containerized deployments.
- **When**: Now
- **Where**: `Dockerfile` line 23 (`CMD`); fix is to add `ENTRYPOINT ["/bin/sh", "entrypoint.sh"]` and ensure the script is executable, or reproduce the full `mkdir -p` list from the script in the `Dockerfile`.

### 3. GITHUB_TOKEN baked into intermediate image layer
- **What**: The `Dockerfile` writes the token into the global git config (`git config --global url.…`), runs `npm install` (which creates a new layer), then removes it in a subsequent `RUN` step. The token exists in an intermediate layer that anyone with registry pull access can read with `docker history --no-trunc`.
- **Why**: If the registry or any image cache is accessible to a third party, the GitHub token (which must have `read:packages` / `repo` scope to clone the private shared-library) can be extracted. This is a credential-leak risk.
- **When**: Now
- **Where**: `Dockerfile` lines 19–27; fix is to use a multi-stage build or Docker BuildKit `--secret` mount (`RUN --mount=type=secret,id=github_token …`) so the token never appears in any committed layer.

### 4. CodeDeploy `setup_app.sh` always pulls the dev `.env` from S3 regardless of deployment group
- **What**: Line `aws s3 cp s3://a2zsuvidhaa/a2z-config/dev/a2z-insurance/.env …` is hardcoded to the `dev` S3 path. There is no branch on `$DEPLOYMENT_GROUP_NAME` or any other variable to select the correct config for staging or production CodeDeploy deployments.
- **Why**: A production CodeDeploy deployment will receive the dev environment's credentials, API keys, and DB connection strings. This is both a correctness and a data-privacy risk.
- **When**: Now
- **Where**: `scripts/setup_app.sh` line (the `aws s3 cp` call); fix is to parameterize the S3 path using `$DEPLOYMENT_GROUP_NAME` or a separate deployment-group-specific script.

### 5. Single replica with no HPA or PodDisruptionBudget in production
- **What**: `values-prod.yaml` sets `replicaCount: 1`, `autoscaling.enabled: false`, and `podDisruptionBudget.enabled: false`.
- **Why**: Any pod restart (node drain, OOM kill, rolling update) causes a complete outage — there is no second replica to absorb traffic. The HPA and PDB templates are already written and wired; they just need to be enabled.
- **When**: Next quarter
- **Where**: `helm/a2z-insurance/values-prod.yaml` lines 4, 53–55, 58–60; set `replicaCount: 2`, `autoscaling.enabled: true`, and `podDisruptionBudget.enabled: true`.

### 6. Logs are lost on pod restart — no persistent volume for log files
- **What**: The Helm Deployment template has no `volumes` or `volumeMounts` entries for the `logs/` directory. Log files are written to the ephemeral container filesystem and are permanently lost when a pod is replaced.
- **Why**: The Winston logger writes to daily-rotated files under `logs/` as the primary audit trail for the application. Losing logs on restart makes post-incident investigation difficult.
- **When**: Next quarter
- **Where**: `helm/a2z-insurance/templates/deployment.yaml`; add an `emptyDir` or PVC volume mount at `/var/www/node/a2z-insurance/logs`, or switch to stdout-only logging and aggregate via a log collector.

### 7. `LONGITUTE` typo in all Helm values files
- **What**: All three environment values files define `LONGITUTE` instead of `LONGITUDE`.
- **Why**: Any code that reads `process.env.LONGITUTE` will silently get `undefined` if the key name is ever corrected on either side.
- **When**: Nice to have
- **Where**: `helm/a2z-insurance/values.yaml` line 107, `values-dev.yaml` line 107, `values-staging.yaml` (same line), `values-prod.yaml` line 109.

### 8. `NODE_ENV=development` baked into the Docker image
- **What**: `ENV NODE_ENV=development` is set at the image level in the `Dockerfile`. It is overridden by the Helm ConfigMap in Kubernetes, but any `docker run` of the image without an explicit `-e NODE_ENV=` override starts in development mode.
- **Why**: Development mode mounts the Swagger UI unconditionally, may change error verbosity, and can suppress production-only security headers. An operator running the image ad-hoc for debugging would be in a different mode than they expect.
- **When**: Nice to have
- **Where**: `Dockerfile` line 8; remove the `ENV NODE_ENV` line and require the caller to always supply it explicitly (e.g. via `--env-file` or Helm values).

## Open questions

1. **Two parallel deployment paths**: The repo contains both a CodeDeploy/PM2 path (EC2) and a Helm/Kubernetes path. It is not clear which one is currently active for production traffic, or whether both are maintained simultaneously. The prod CodeDeploy scripts reference `dev` S3 paths (finding #4), which suggests the EC2 path may be unused or unmaintained for prod.
2. **`values-staging.yaml` content**: The file was not examined in detail during this review — it likely has the same class of issues as `values-prod.yaml` but should be audited separately.
3. **`scripts/change_permissions.sh`**: This script exists in the `scripts/` directory but is not referenced by `appspec.yml`. It is unclear whether it is a leftover, a manual utility, or intended for a future CodeDeploy hook.
4. **Shared-library distribution method in CodeDeploy**: `setup_app.sh` downloads `shared-library.zip` from `s3://a2zsuvidhaa/a2z-shared-library-dev` — a path that also hardcodes `dev`. Who publishes this zip, how often, and is there a separate prod zip?
