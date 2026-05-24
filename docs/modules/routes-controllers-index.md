# Routes / Controllers Index

## What this module does

This module is the root entry point for the Express application's routing layer. It serves the unauthenticated health-check endpoint at `GET /ping` and also exposes two development-only test endpoints (`POST /ping/test-post` and `POST /ping/test-file-upload`) that were added during initial scaffolding and were never cleaned up.

## Why this module exists

The application needs at least one route that is reachable without authentication so that load-balancer health checks can verify the service is running. `routes/index.js` owns that route and is deliberately mounted in `app.js` before the `validateHeaders` authentication middleware, allowing it to respond to `/ping` without a `userdata` header. The two `test-*` routes were added early in development to verify body-parsing and file-upload plumbing; they were never removed.

## When this module runs / is used

- `GET /ping` — hit by load-balancer health checks and any caller verifying the service is alive. This is the only route in the entire application that requires no authentication.
- `POST /ping/test-post` — reached by any HTTP client posting JSON/form data to `/ping/test-post`; no auth required.
- `POST /ping/test-file-upload` — reached by any HTTP client posting to `/ping/test-file-upload`; no auth required. Due to the dead Multer configuration (see Optimization opportunities), `req.file` is always `undefined` so this endpoint always returns "No file uploaded".

## How it fits in

- **Depends on**: `winston.js` (imported in the controller but never actually called), `moment-timezone` (imported but unused).
- **Depended on by**: `app.js` mounts `routes/index.js` at `/ping` — it is the first router registered, before the auth middleware pair.
- **No other module** in the codebase imports `routes/index.js` or `controllers/index.js`.

## Key files

| File | Purpose |
|---|---|
| `routes/index.js` | Defines the Express router, creates a Multer disk-storage config, and wires three route handlers from `controllers/index.js`. |
| `controllers/index.js` | Implements `index` (the actual `/ping` handler), `test_post`, `test_file_upload`, and an orphaned `ping` function that is exported but never routed. |

## Optimization opportunities

- **What**: Remove `POST /ping/test-post` and `POST /ping/test-file-upload` (or move them behind the auth middleware).
  **Why**: Both endpoints are mounted before `validateHeaders` in `app.js`, so they are publicly reachable by anyone without authentication. While they are low-risk in their current form, they expand the unauthenticated attack surface and may log request bodies to stdout.
  **When**: Now
  **Where**: `routes/index.js:25–27`, `app.js` mount order

- **What**: Delete the dead Multer instance in `routes/index.js` (or wire it to the test-file-upload route).
  **Why**: The `storage` config and `upload` middleware are created at lines 6–19 but never attached to any route. `POST /ping/test-file-upload` therefore always enters the "No file uploaded" branch — the intended upload behaviour is completely unreachable. If the test route is kept, the middleware must be passed as a second argument to `router.post()`; if the route is removed, the entire Multer block is dead code that should be deleted.
  **When**: Now
  **Where**: `routes/index.js:6–19`, `routes/index.js:27`

- **What**: Remove the exported `ping` function from `controllers/index.js` (or wire it to `GET /`).
  **Why**: `controllers/index.js` exports four functions (`index`, `ping`, `test_file_upload`, `test_post`) but `routes/index.js` only imports and uses three of them. `ping` is never routed — the actual `GET /ping` request is handled by `indexController.index`. The `ping` function also contains roughly 70 lines of commented-out MongoDB and MySQL model test code that adds noise without providing value. This is dead code.
  **When**: Now
  **Where**: `controllers/index.js:70–148`, `controllers/index.js:151`

- **What**: Replace `console.log` calls in all three active handlers with the Winston `logger` that is already imported.
  **Why**: `index`, `test_post`, and `test_file_upload` all write to stdout via `console.log`. The imported `logger` from `winston.js` is never actually called, bypassing log-level controls, daily rotation, and the HTTP transport. In particular, `index` logs `process.env.APP_NAME + " /ping"` on every health-check — potentially hundreds of lines per minute in production.
  **When**: Now
  **Where**: `controllers/index.js:22`, `:37`, `:38`, `:49`, `:50`

- **What**: Remove the unused `moment-timezone` and `logger` imports from `controllers/index.js`.
  **Why**: `moment` is imported on line 1 and `logger` on line 2, but neither is called anywhere in the file. Dead imports add load time and mislead readers into thinking these dependencies are needed.
  **When**: Nice to have
  **Where**: `controllers/index.js:1–2`

- **What**: Fix or remove the OpenAPI JSDoc annotations on `test_post` and `test_file_upload`.
  **Why**: Both annotations declare path `/` with method `POST` and `operationId: "Index"`, which collides with the `index` function's own annotation. The actual paths are `/test-file-upload` and `/test-post`. These incorrect annotations generate a malformed OpenAPI spec entry. If the test routes are removed (see above), the annotations disappear with them.
  **When**: Nice to have
  **Where**: `controllers/index.js:30–46`, `:54–65`

## Open questions

- Is the destination directory `public/storage/temp` guaranteed to exist at runtime? Multer's disk-storage driver throws if the path is missing; neither `entrypoint.sh` nor the Dockerfile creates this path.
- Are the test endpoints (`/ping/test-post`, `/ping/test-file-upload`) intentionally kept for some internal testing workflow, or are they safe to delete?
