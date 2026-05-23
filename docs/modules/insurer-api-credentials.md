# Insurer API Credentials

## What this module does

This module provides an admin-only CRUD interface for storing the API connection details (base URLs, client IDs, secrets, usernames, and passwords) that the system would need to call each insurer's external API. Each record is scoped to a specific insurer and an environment — either UAT (test/staging) or PROD (live). The five endpoints cover creating, listing, viewing, updating, and enabling/disabling a credential record.

## Why this module exists

Different insurers expose different API endpoints and require different authentication schemes. Centralising these details in a database table means an admin can add or rotate credentials without a code deployment. The module is designed to eventually replace the current approach of reading insurer credentials directly from environment variables.

## When this module runs / is used

All five endpoints are active and mounted at `/api/admin/insurer-api-credentials` in `app.js` (line 154). They fire whenever an admin makes a request to:

- `POST /api/admin/insurer-api-credentials/add` — create a new credential record
- `POST /api/admin/insurer-api-credentials/list` — paginated list with optional filters
- `GET  /api/admin/insurer-api-credentials/:id` — fetch a single record
- `PUT  /api/admin/insurer-api-credentials/update/:id` — replace a record's fields
- `PATCH /api/admin/insurer-api-credentials/status/:id` — toggle active/inactive

Every request must carry a valid `userdata` header (enforced by the global `validateHeaders` middleware in `middlewares/headers.js`). There are no role checks beyond that header, so any authenticated user can read or modify insurer credentials.

**Important: the credentials stored here are not yet read by any insurer adapter.** The Digit integration (`services/insurers/digit/digit.config.js`) reads its URLs and credentials from environment variables (`DIGIT_UAT_USERNAME`, `DIGIT_UAT_PASSWORD`, `DIGIT_PROD_AUTH_URL`, etc.), not from this table. The module appears to be a placeholder for a DB-driven credential management feature that has not yet been wired up.

## How it fits in

**Depends on:**
- `models/mysqldb/insurer-api-credential.js` — the Sequelize model wrapping `insurer_api_credential` table
- `models/mysqldb/insurer.js` (`MysqlInsurersModel`) — used in `add` to validate that the given `insurer_id` exists
- `services/common.js` (`CommonService.errorHandler`) — called in the `add` error path only
- `middlewares/headers.js` — global auth gate applied before this router

**Depended on by:**
- `app.js` — mounts this router at `/api/admin/insurer-api-credentials`
- No motor-flow controller or insurer service currently reads from this module

## Key files

| File | Purpose |
|------|---------|
| `routes/insurer-api-credentials.js` | Declares the five REST routes and binds them to the controller |
| `controllers/insurer-api-credential.js` | Implements `add`, `list`, `detail`, `update`, `updateStatus` handlers with OpenAPI JSDoc annotations |
| `models/mysqldb/insurer-api-credential.js` | Thin Sequelize wrapper around the `insurer_api_credential` table; extends the shared-library base model |

## Optimization opportunities

### 1. Credentials are never consumed — wire them up or document the gap clearly
- **What**: Connect `digit.config.js` (and future insurer adapters) to read `base_url`, `client_id`, `client_secret`, `username`, and `password` from the `insurer_api_credential` table instead of environment variables.
- **Why**: The feature promises DB-driven credential management but currently has no effect; an admin editing records gets no actual change in behaviour. This also means credential rotation still requires a deployment.
- **When**: Next quarter
- **Where**: `services/insurers/digit/digit.config.js` lines 4–33; `services/insurers/digit/digit.auth.service.js` lines 22–27

### 2. Sensitive fields are returned in plaintext by `list` and `detail`
- **What**: Mask `client_secret`, `password`, and optionally `client_id` in all read responses (return `"******"` or omit them from the list projection entirely).
- **Why**: Any holder of a valid `userdata` header can retrieve all insurer passwords and secrets in cleartext via a single `POST /list` call. This is the highest-severity finding in this module.
- **When**: Now
- **Where**: `controllers/insurer-api-credential.js` lines 254–268 (`list` response), lines 338–361 (`detail` response)

### 3. `updateStatus` silently returns 200 for non-existent IDs
- **What**: Add an existence check (`findById`) before calling `model.update()` in `updateStatus`, and return 404 if the record is not found.
- **Why**: `model.update()` with a WHERE clause on a missing ID returns `[0]` without throwing; the handler currently treats that as a success. Same pattern documented across all prior admin modules.
- **When**: Now
- **Where**: `controllers/insurer-api-credential.js` lines 536–554

### 4. Duplicate-check bypass in `add` when `environment` is omitted
- **What**: Normalise `environment` (apply the `|| "UAT"` default) **before** the duplicate-existence check, not only in `DBPayload`.
- **Why**: The current code checks `findByQuery({ insurer_id, environment: payload.environment })` where `payload.environment` may be `undefined`. The DB query finds nothing, so the check passes; then the insert uses `"UAT"`. A caller can create multiple UAT credentials for the same insurer by omitting `environment` on subsequent calls.
- **When**: Now
- **Where**: `controllers/insurer-api-credential.js` lines 102–120

### 5. `update` silently overwrites fields with defaults when omitted
- **What**: Fall back to the existing record's values rather than hard-coded defaults or `null` when a field is absent from the request. The `existing` record is already fetched at line 442 and can be used for this.
- **Why**: A caller sending `{ base_url: "https://new.url" }` to update a URL will also silently set `environment` back to `"UAT"` and wipe all other URL fields to `null`. This makes partial updates destructive.
- **When**: Now
- **Where**: `controllers/insurer-api-credential.js` lines 452–465

### 6. `update` does not re-validate the FK or guard against duplicate `(insurer_id, environment)` pairs
- **What**: When `insurer_id` or `environment` is changed, validate that the new `insurer_id` exists and that the new `(insurer_id, environment)` combination is not already taken by another record.
- **Why**: Without this check, `update` can produce an orphaned FK reference or trigger an opaque 500 from the DB unique constraint, whereas `add` handles both cases with a clear 400 response.
- **When**: Next quarter
- **Where**: `controllers/insurer-api-credential.js` lines 438–482

### 7. `list` has no upper-bound cap on `limit`
- **What**: Enforce a maximum page size (e.g. 100) on the `limit` parameter.
- **Why**: Without a cap an authenticated caller can fetch all rows in a single request, which both leaks all credentials at once and can put significant load on the database.
- **When**: Next quarter
- **Where**: `controllers/insurer-api-credential.js` lines 236–237

### 8. JSDoc path mismatch for `updateStatus`
- **What**: Correct the `@openapi` annotation path from `/admin/insurer-api-credentials/update-status/{id}` to `/admin/insurer-api-credentials/status/{id}` to match the registered route.
- **Why**: The Swagger UI "Try it out" button calls the documented path, which does not exist, giving a 404 to anyone using the API explorer.
- **When**: Nice to have
- **Where**: `controllers/insurer-api-credential.js` line 487

### 9. Inconsistent error logging — `list`, `detail`, `update`, `updateStatus` only `console.log`
- **What**: Replace bare `console.log(error)` in the four catch blocks with `CommonService.errorHandler(...)` calls, matching the pattern already used in the `add` handler.
- **Why**: These errors are invisible to the structured Winston log pipeline and the HTTP transport, making production diagnosis harder.
- **When**: Nice to have
- **Where**: `controllers/insurer-api-credential.js` lines 270–276, 354–361, 474–481, 547–554

## Open questions

1. **Is the DB-driven credential feature planned?** The table schema and admin UI exist but no adapter reads from them. Is there a timeline for wiring `digit.config.js` (and future adapters) to pull from this table instead of env vars?
2. **Access control**: All admin endpoints share the same `userdata` header gate with no role differentiation. Should writing (add/update/status) require a higher-privilege role than reading, given that credentials are extremely sensitive?
3. **Encryption at rest**: The `insurer_api_credential` table stores `client_secret` and `password` in plaintext. Is there a plan to encrypt sensitive columns before the DB-driven feature is activated?
