# Headers Middleware

## What this module does

The headers middleware is a two-function Express gate that sits in front of every authenticated route. `validateHeaders` checks that every inbound request includes a `userdata` HTTP header, rejecting requests without one with HTTP 401. `decodeUserData` then Base64-decodes that header, JSON-parses the result, and writes the JavaScript object back into `req.headers['userdata']` so downstream controllers can read user identity directly from that location.

## Why this module exists

Rather than handling login itself, this service operates behind an upstream API gateway that authenticates the caller and encodes their identity as a Base64-JSON blob in the `userdata` header before forwarding the request here. The middleware unpacks that blob so every controller can access user identity without re-implementing authentication. This is a gateway-forwarding pattern common in micro-service architectures: one central service handles login; all downstream services trust and unpack the forwarded identity claim.

## When this module runs / is used

`validateHeaders` and `decodeUserData` run on **every inbound HTTP request except `/ping`** (the unauthenticated health check). They are mounted globally in `app.js` at lines 140–141, before any route handler is reached. This means both functions execute on all admin endpoints (`/api/admin/*`) and all customer motor endpoints (`/api/customer/motor/*`).

## How it fits in

- **Depends on**: Nothing — both functions are pure Express middleware with no external imports.
- **Called by**: `app.js` mounts both functions globally via `app.use()`.
- **Used by**: Every controller in the application reads the decoded user identity from `req.headers['userdata']` (e.g., `controllers/insurance.js` line 78). The `CLAUDE.md` explicitly documents this as the canonical location for user identity.

## Key files

| File | Purpose |
|------|---------|
| `middlewares/headers.js` | Contains both middleware functions: `validateHeaders` (header presence check) and `decodeUserData` (Base64-decode + JSON-parse + header replacement) |
| `app.js` (lines 107, 140–141) | Imports and globally mounts both functions in the correct order after the `/ping` route |

## Optimization opportunities

- **What**: Remove `console.log(req.headers)` on line 9 (inside the `/ping` branch of `validateHeaders`)
  **Why**: Every health-check call from a load balancer dumps the full request-header map — including any Authorization, Cookie, or X-forwarded-* tokens — to stdout. In production, health checks fire constantly; this floods logs with sensitive data and makes log searches for real errors much harder.
  **When**: Now
  **Where**: `middlewares/headers.js` lines 9 and 12

- **What**: Remove `console.log("NODE_ENV"+process.env.NODE_ENV)` and `console.log("CLIENT_APP_URL"+process.env.CLIENT_APP_URL)` from `validateHeaders`
  **Why**: These lines execute on every non-ping request, leaking deployment configuration (environment name and the partner URL) into stdout logs on every authenticated call. The values never change at runtime — logging them per-request is pure noise with no diagnostic value, and it exposes topology info in any log aggregator or log-shipping pipeline.
  **When**: Now
  **Where**: `middlewares/headers.js` lines 14–15

- **What**: Fix the stale JSDoc comment above `decodeUserData` that says "Attaches decoded object to req.userData"
  **Why**: The code stores the parsed object at `req.headers['userdata']` (line 55), not `req.userData`. `CLAUDE.md` also explicitly documents the `req.headers['userdata']` location. A new maintainer reading the comment will look for `req.userData` in controllers and find nothing, wasting time. The inconsistency is compounded by line 35, which actually does set `req.userData = null` on the "no header" path — making the two branches inconsistent with each other.
  **When**: Now
  **Where**: `middlewares/headers.js` lines 25–27 (JSDoc) and line 35 (`req.userData = null` branch)

- **What**: Remove the dead `/common-api/acl` auth-bypass in `validateHeaders`
  **Why**: No route is mounted at `/common-api/acl` in `app.js`; any request to that path returns 404 before it ever reaches a controller. The bypass was ported from a sibling service (the main api-server) and has never applied here. It is dead code that misleads readers into thinking there is an auth-exempt endpoint that does not exist.
  **When**: Next quarter
  **Where**: `middlewares/headers.js` line 8

- **What**: Fix the double-parse bug in `controllers/insurance.js` (line 79: `JSON.parse(userdata)` where `userdata` is already a JavaScript object after `decodeUserData` runs)
  **Why**: `decodeUserData` replaces `req.headers['userdata']` with a parsed object. Calling `JSON.parse()` on a non-string value coerces it to `[object Object]` and then throws a `SyntaxError`, so `authLogin` would always crash. Since `insurance.js` has no current route mount, this bug is dormant — but it will surface the moment a route is wired up.
  **When**: Next quarter (before mounting the route)
  **Where**: `controllers/insurance.js` line 79

- **What**: Add automated tests for both middleware functions
  **Why**: This middleware is the single authentication choke point for every endpoint in the service. A regression here (e.g., accidentally skipping the `userdata` check, or breaking the Base64 decode) would silently compromise every route. No `*.spec.js` file currently exists for `middlewares/headers.js`; the module has zero test coverage.
  **When**: Next quarter
  **Where**: `tests/api/` (following the pattern from `package.json` test scripts)

- **What**: Remove the dead header-normalization lines that copy `ip-address` → `ip_address` and `request-mode` → `request_mode`
  **Why**: No controller or service in this repository reads `req.headers.ip_address` or `req.headers.request_mode`. The normalization was likely cargo-ported from a sibling service. It runs on every request and silently misleads readers into thinking these fields are consumed somewhere.
  **When**: Nice to have
  **Where**: `middlewares/headers.js` lines 6–7

- **What**: Clean up the eight commented-out `console.log` / `console.warn` lines left in the file
  **Why**: Commented-out debug statements (lines 4, 5, 31, 34, 41, 50, 54) clutter the file and make it harder to read the active logic. They add no value over the git history.
  **When**: Nice to have
  **Where**: `middlewares/headers.js` lines 4, 5, 31, 34, 41, 50, 54

## Open questions

- **Who sets the `userdata` header?** The upstream API gateway or API server is presumed to set and Base64-encode this header, but no documentation describes what fields the JSON object must contain (only `id` and `role_id` are referenced in commented-out logs, and `id` is referenced in `insurance.js`). A schema for the expected user object would help validate the decode and catch malformed payloads earlier.
- **Is the `userdata` header signed or verified?** The middleware performs no signature check — it trusts whatever is Base64-encoded in the header. If network-level controls (e.g., the upstream gateway is the only caller, or a mutual-TLS layer prevents direct access) are not in place, any client could craft an arbitrary `userdata` header to impersonate any user. The answer determines whether a signature check needs to be added here.
- **What is the intended maximum size for the `userdata` header?** The current 20,000-byte cap (line 40) appears arbitrary. Knowing the actual maximum payload size from the upstream service would let this be tightened to a realistic value.
