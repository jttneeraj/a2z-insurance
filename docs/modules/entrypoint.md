# Entrypoint

## What this module does

`entrypoint.sh` is a POSIX shell script designed to run once at container startup, before the Node.js application process launches. It creates the full directory tree under `logs/` that the application's logger expects to find at runtime, then hands control to the container's command — typically `node app.js` — via a POSIX `exec "$@"` call.

## Why this module exists

The logger (`winston.js`) writes to `logs/combined` and `logs/error` using file transports. If those directories are missing when the process starts, the first write attempt will crash the transport. Placing the `mkdir -p` calls in a startup script keeps filesystem setup logic outside of application code and guarantees directories exist before any log is ever written.

## When this module runs / is used

It is designed to run once per container start, as the Docker `ENTRYPOINT`, immediately before the process in `CMD` is launched.

**Critical gap**: The current `Dockerfile` has no `ENTRYPOINT` directive — only `CMD ["node", "app.js"]`. As a result, `entrypoint.sh` is never executed in the Docker or Kubernetes (Helm) deployment paths. The Dockerfile manually creates a partial set of directories (`mkdir -p logs uploads public/storage/temp` at line 27), which omits `logs/error` and all `logs/services/*` sub-directories that `entrypoint.sh` would otherwise create.

The `appspec.yml` CodeDeploy scripts (`scripts/install_dependencies.sh`, `scripts/setup_app.sh`, `scripts/start_server.sh`, `scripts/stop_server.sh`) also do not reference `entrypoint.sh`, so the bare-metal EC2 deployment path is similarly unaffected.

## How it fits in

| Direction | Module |
|-----------|--------|
| Depends on | Nothing — pure shell, no imports |
| Used by | Nothing currently invokes it (see gap above) |
| Sibling context | `winston.js` (winston-logger module) writes to `logs/combined` and `logs/error`, the only two paths the application actually uses today |

## Key files

| File | Purpose |
|------|---------|
| `entrypoint.sh` | The only file in this module. Creates ~45 log directories under `logs/`, then `exec`s the container command. |

## Optimization opportunities

- **What**: Add `ENTRYPOINT ["/bin/sh", "entrypoint.sh"]` to the `Dockerfile` and remove the manual `mkdir -p logs uploads public/storage/temp` line (line 27), replacing it with the script invocation.
  **Why**: Without the `ENTRYPOINT` directive the script never runs; log directories are only partially created, and any new transport that targets `logs/error` or `logs/services/*` will fail silently or crash on the first write.
  **When**: Now
  **Where**: `Dockerfile` line 27

- **What**: Remove the ~40 `logs/services/*` directory entries that no code in this repository writes to (e.g. `logs/services/payu`, `logs/services/kotak`, `logs/services/razorpay`).
  **Why**: A `grep` across all JS files in the project finds zero references to any `logs/services/*` path. The directories appear to be cargo-copied from a sibling fintech service. Keeping them is misleading — they imply integrations that do not exist in this codebase and obscure which paths actually matter.
  **When**: Next quarter
  **Where**: `entrypoint.sh` lines 8–21

- **What**: Confirm whether `logs/combibned` (the intentional typo on line 6) is ever written to, and remove it if not.
  **Why**: `winston.js` writes to `logs/combined` (no typo). No other file in the project references `logs/combibned`. The `CLAUDE.md` warns against removing it without verifying Winston transports — that verification now shows no transport uses this path. Removing it eliminates a confusing dead directory.
  **When**: Nice to have
  **Where**: `entrypoint.sh` line 6

- **What**: Either wire `logs/sms` to an actual SMS-service file transport or remove the directory creation.
  **Why**: `logs/sms` is pre-created (line 6) but no file transport in the codebase targets it. It is either legacy or a placeholder for an SMS logging feature that was never completed.
  **When**: Nice to have
  **Where**: `entrypoint.sh` line 6

## Open questions

- Was the `ENTRYPOINT` directive in `Dockerfile` deliberately omitted, or was it accidentally dropped during a refactor?
- Do any `logs/services/*` entries correspond to integrations planned for a near-term release? If so, which ones should stay?
- Does the CodeDeploy EC2 path run `entrypoint.sh` from any step not visible in the checked-in `scripts/` files (for example, a User Data script on the EC2 instance)?
