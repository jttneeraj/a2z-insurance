# App Bootstrap

## What this module does

`app.js` is the entry point for the entire application. It creates the Express web server, configures all shared middleware (body parsing, CORS, i18n, Swagger UI), wires together every route group in the correct order, and attaches the global 404 and error handlers. The server listens on the port defined by `APP_PORT` in the environment once `app.js` is loaded.

## Why this module exists

Every Express application needs one central file that owns the middleware stack and route mount order. Keeping all of this in `app.js` makes it easy to see the full request lifecycle in one place, understand which middleware runs before authentication, and know exactly which URL prefixes map to which route groups. The alternative — spreading mount logic across multiple files — would make it harder to reason about middleware ordering and security boundaries.

## When this module runs / is used

`app.js` runs once at process start. It is loaded by:

- `node app.js` (or via `npm start` / nodemon) in development and production.
- `entrypoint.sh`, which execs the app process after pre-creating log directories.
- `process.json` (PM2 config) in the deployed environment.
- Test suites via `require('./app')` — the Mocha specs import this file to get the Express app instance for `supertest`.

The server starts listening on `APP_PORT` (default `4015`) immediately when the file finishes loading.

## How it fits in

**Depends on:**
- `middlewares/headers.js` — `validateHeaders` and `decodeUserData` applied globally after `/ping`.
- `winston.js` — logger used in 404 and error handlers.
- `swagger.js` — Swagger document served at `/api-docs` in non-production or partners environments.
- All route modules under `routes/` — each is `require()`d and mounted at a specific URL prefix.

**Depended on by:**
- `entrypoint.sh` — execs the Node process that loads this file.
- `process.json` (PM2) — references `app.js` as the main entry.
- Test specs — import `app.js` to get the Express instance.
- Nothing else at runtime; `app.js` is the root, not a library.

## Key files

| File | Purpose |
|---|---|
| `app.js` | Express app creation, middleware stack, route mounting, 404/error handlers, `app.listen()` |
| `middlewares/headers.js` | `validateHeaders` (requires `userdata` header) and `decodeUserData` (Base64-decodes it into a parsed object) — applied to every non-`/ping` route |
| `routes/index.js` | Handles `/ping` (health check), `/ping/test-post`, and `/ping/test-file-upload`; mounted before auth middleware |
| `controllers/index.js` | Handler functions for the ping/test routes above |

## Optimization opportunities

- **What**: Remove the `console.log('app.js is running...insurance nik')` debug line at line 1 and the several other `console.log` / `console.error` calls inside `middlewares/headers.js` that log raw headers and environment variables on every request.
  **Why**: These print sensitive data (full request headers, `CLIENT_APP_URL`, `NODE_ENV`) to stdout in production, increase log noise, and can expose credential-adjacent values in log aggregation systems.
  **When**: Now
  **Where**: `app.js:1`, `middlewares/headers.js:9,14,15`

- **What**: Move the `multer.memoryStorage()` instance created in `app.js` (lines 102–103) to the route or controller that actually needs it, or remove it entirely since the resulting `upload` variable is never passed to any route in `app.js`.
  **Why**: The instantiation is dead code — `upload` is created but never used. Having it here implies it is applied globally, which is misleading to future readers.
  **When**: Now
  **Where**: `app.js:102–105`

- **What**: Guard `process.env.CLIENT_APP_URL.indexOf(...)` at line 89 with a null check before calling `.indexOf()`.
  **Why**: If `CLIENT_APP_URL` is not set, the app will crash with `TypeError: Cannot read properties of undefined` at startup in production, before serving any requests. A simple `(process.env.CLIENT_APP_URL || '').indexOf(...)` prevents this.
  **When**: Now
  **Where**: `app.js:89`

- **What**: Separate `decodeUserData` from `validateHeaders` into the dedicated `headers-middleware` module review, but also consider moving both into a single `authenticate` middleware to eliminate the two-step `app.use()` calls (lines 140–141) that must always appear together.
  **Why**: The two middleware functions are always registered as a pair and have an implicit ordering dependency. A combined function would make it impossible to accidentally reorder them.
  **When**: Next quarter
  **Where**: `app.js:140–141`, `middlewares/headers.js`

- **What**: Validate that `APP_PORT` is a valid port number at startup (similar to the existing `NODE_ENV` check), rather than silently passing `undefined` to `app.listen()`.
  **Why**: If `APP_PORT` is missing from the `.env` file, `app.listen(undefined)` binds to a random OS-assigned port, which is hard to diagnose in a deployed environment.
  **When**: Next quarter
  **Where**: `app.js:211`

- **What**: Replace the `tests` directory being served as static files (`app.use(express.static(path.join(__dirname, 'tests')))` at line 65) with a conditional block that only runs outside production.
  **Why**: Serving test fixtures as public static files in production is an unnecessary information disclosure. The directory doesn't currently exist, so this is harmless today — but it becomes a risk if tests are ever added.
  **When**: Nice to have
  **Where**: `app.js:65`

## Open questions

- The `validateHeaders` function (line 8 in `middlewares/headers.js`) has a branch for paths that `include('/common-api/acl')`, but no such route is mounted in `app.js`. Is this a remnant of a shared-library gateway pattern, or a planned route that was never added?
- The `originList` variable (line 42) uses `ALLOWED_HOST` as a comma-split array if set, but falls back to a plain string (`CLIENT_APP_URL`) if not. CORS `origin` accepts a string (single origin) or an array, so this works today — but it means the two env vars have subtly different behaviors. Is this intentional, and should both support multiple comma-separated origins?
