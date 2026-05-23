# Swagger

## What this module does

This module generates an interactive API reference (Swagger UI) for the application. It reads special comment annotations (`@openapi`) from the controller source files, turns them into an OpenAPI 3.0 specification document, and serves a browsable HTML page at `/api-docs` so developers can read and manually test every API endpoint without writing a single line of client code.

## Why this module exists

During development and QA it is useful to have a self-updating, human-readable description of every route — what it expects, what it returns, and what errors it can produce — without maintaining a separate document that drifts out of sync. Swagger/OpenAPI is the industry-standard way to do that. The module is intentionally restricted to non-production environments (and one specific partners URL) so the internal route map is never exposed to the public internet in a standard production deployment.

## When this module runs / is used

- **At startup**, `app.js` calls `require('./swagger')`, which runs `swaggerJsdoc` immediately and builds the spec object in memory. If any `@openapi` annotation in the scanned controllers is malformed, the parse error surfaces here, before any request is handled.
- **On every GET `/api-docs`** (and `/api-docs/*`) request, `swagger-ui-express` serves the pre-built HTML/JS bundle using the in-memory spec. This path is only mounted when `NODE_ENV !== "production"` or when `CLIENT_APP_URL` contains `"partners.atozsuvidhaa.com"` (see `app.js`, lines 88–91).
- There are no scheduled jobs, background workers, or database calls — the module is entirely passive after startup.

## How it fits in

| Direction  | Module / file                          | Relationship |
|------------|----------------------------------------|--------------|
| Depends on | `app.js` (`app-bootstrap`)             | `app.js` requires `swagger.js`, evaluates the guard condition, and mounts the UI at `/api-docs`. |
| Depends on | Every `controllers/*.js` file          | `swagger-jsdoc` scans these files for `@openapi` JSDoc blocks to build the spec. |
| Depends on | `process.env.APP_NAME`, `APP_PORT`     | Used to populate the spec's `info.title`, `info.description`, and `servers[0].url`. |
| Depended on by | `app.js` (`app-bootstrap`)         | Consumes the exported `specs` object directly. No other module imports `swagger.js`. |

## Key files

| File | Purpose |
|------|---------|
| `swagger.js` | Configures `swagger-jsdoc` options (OpenAPI version, title, security schemes, server URL, file glob to scan) and exports the compiled spec object. |
| `app.js` (lines 48–49, 87–91) | Imports `swagger-ui-express` and the spec, then conditionally mounts the UI at `/api-docs`. |
| `controllers/*.js` | Contain the inline `@openapi` JSDoc blocks that become the actual endpoint documentation; the swagger module reads but does not modify them. |

## Optimization opportunities

- **What**: Remove the dead first `apis` entry in `swagger.js` (line 26).
  **Why**: `swagger.js` declares the `apis` property twice — `'./routes/*.js'` on line 26 and `'./controllers/*.js'` on line 27. In JavaScript, duplicate object keys silently discard the first value, so routes are never scanned. The dead entry misleads anyone reading the file into thinking routes are also annotated and scanned.
  **When**: Now
  **Where**: `swagger.js`, line 26

- **What**: Add fallback defaults for `APP_NAME` and `APP_PORT` inside `swagger.js`.
  **Why**: If either environment variable is unset, the generated spec contains `"undefined App"` as its title and `"http://localhost:undefined"` as its server URL. This produces a confusing UI and can cause the "Try it out" feature to fire requests at an invalid host. A simple `process.env.APP_NAME ?? 'A2Z Insurance'` guard costs one line.
  **When**: Now
  **Where**: `swagger.js`, lines 7–9 and 22

- **What**: Guard `CLIENT_APP_URL` before calling `.indexOf()` in `app.js`.
  **Why**: `process.env.CLIENT_APP_URL.indexOf(...)` (line 89) throws a `TypeError` at startup whenever `CLIENT_APP_URL` is unset (e.g., in a fresh local checkout or a CI environment). The whole process crashes before accepting any request. Using optional chaining (`process.env.CLIENT_APP_URL?.includes(...)`) fixes this with one character.
  **When**: Now
  **Where**: `app.js`, line 89

- **What**: Add HTTP Basic Auth (or a static token check) in front of the `/api-docs` route.
  **Why**: The UI is currently unprotected. Anyone who can reach the server — including an attacker who discovers the dev port — gets a complete, interactive map of every internal API endpoint, parameter shape, and security scheme. A simple `express-basic-auth` middleware with credentials read from env vars would close this gap.
  **When**: Next quarter
  **Where**: `app.js`, lines 87–91

- **What**: Migrate the `apis` glob from `controllers/*.js` to `routes/*.js`.
  **Why**: Express best practice is to put route-level annotations on the route definitions rather than on controllers, because the route file is where the HTTP method and URL path are declared. Mixing them into controllers couples the HTTP contract to the business logic. Since no route files currently have `@openapi` blocks, this is a migration, not a one-line fix — but it would align with the intent suggested by the original (now-dead) line 26.
  **When**: Nice to have
  **Where**: `swagger.js`, line 27; all `controllers/*.js` files that contain `@openapi` blocks

## Open questions

- Was routing annotations via `routes/*.js` deliberately abandoned in favour of `controllers/*.js`, or was the second `apis` line accidentally duplicated and the routes glob is the intended target? The git history shows only a single "init commit" so no migration trail is visible.
- Is the `bearerAuth` security scheme (defined in `swagger.js`, lines 13–18) actually enforced anywhere? No `security:` field was found on any `@openapi` endpoint block in a spot-check of the controllers, which means the scheme is declared but never applied to any documented route.
- Should the `/api-docs` URL be exposed on the `partners.atozsuvidhaa.com` production-adjacent environment? The comment above the guard says "FOR THE MOMENT ENABLE DOC ON OUR DEV SERVER", suggesting the partners-URL exception was temporary.
