# lib-redis

## What this module does

`lib/redis.js` creates and exports a single shared Redis client for the application. On load it opens a connection to the Redis server, registers event listeners that log connection state changes, and exposes one helper (`cleanSets`) that bulk-removes all members from a named Redis set.

## Why this module exists

A Redis connection is expensive to create; having one central module means the rest of the codebase can share a single connection rather than each file opening its own. The `cleanSets` helper encodes the safe way to drain a large set without exceeding Redis memory limits by processing 1 000 members at a time.

## When this module runs / is used

The client connects to Redis the moment any file `require()`s this module, because `client.connect()` is called at the top level. At the time of this review **no other file in the repository imports `lib/redis.js`**, so in practice the module is never loaded and the Redis connection is never established. The `cleanSets` function is also uncalled anywhere in the codebase.

## How it fits in

- **Depends on**: `redis` npm package (v4.6.x), `REDIS_URI` environment variable.
- **Depended on by**: Nothing — no file currently imports this module.

## Key files

| File | Purpose |
|---|---|
| `lib/redis.js` | Creates the Redis client, registers event listeners, exports the client and the `cleanSets` set-draining helper. |

## Optimization opportunities

- **What**: Fix the `client.connect()` call to use the Promise-based API.
  **Why**: In `redis` v4 the `connect()` method returns a Promise and does **not** accept a callback. The current code `client.connect((status, err) => {...})` silently ignores the callback (it never fires) and swallows connection errors. The correct form is `client.connect().catch(err => console.error('Redis connect error', err))` or `await client.connect()` inside an async initialiser.
  **When**: Now — if this module is ever imported the connection errors will be invisible.
  **Where**: `lib/redis.js` lines 4–7.

- **What**: Guard against a missing `REDIS_URI` env var by logging a warning (or throwing) when the variable is absent at startup.
  **Why**: If `REDIS_URI` is not set, the `redis` library silently falls back to `redis://127.0.0.1:6379`. In staging/production this almost certainly points at the wrong host. An early explicit check prevents confusing run-time failures.
  **When**: Now — applies whenever the module is wired into the app.
  **Where**: `lib/redis.js` line 2 (before `createClient`).

- **What**: Remove the unused `rm` variable inside `cleanSets`.
  **Why**: `let rm = await redisClient.sRem(setKey, members)` assigns a value that is never read. Removing it eliminates a lint warning and makes the intent clearer.
  **When**: Nice to have.
  **Where**: `lib/redis.js` line 24.

- **What**: Either wire this module into the application or document why it is dormant.
  **Why**: The module is currently dead code — `redis` appears as a production dependency in `package.json` but nothing calls `require('./lib/redis')`. If Redis caching or session storage is planned, the integration should be completed; if it has been superseded, the file and the `redis` npm dependency should be removed to reduce the attack surface and bundle size.
  **When**: Next quarter — confirm intent with the team before removing.
  **Where**: `lib/redis.js` (entire file); `package.json` `dependencies.redis`.

- **What**: Remove the blanket `/* istanbul ignore next */` markers and add real unit tests once the module is in use.
  **Why**: Every function and branch is excluded from code coverage. This hides real untested paths and undermines the coverage report for the broader codebase.
  **When**: Next quarter (after the module is wired in).
  **Where**: `lib/redis.js` lines 17, 21.

## Open questions

- Is Redis intended for caching quote results, rate-limiting, or session storage? Knowing the planned use case will clarify whether the module should be completed, replaced, or removed.
- Was the `cleanSets` helper written for a specific background job or cron task that has not yet been implemented?
- Is a `REDIS_URI` variable provisioned in any deployed environment? It does not appear in `.env.test` or any configuration file visible in the repository.
