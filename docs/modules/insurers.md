# Insurers

## What this module does

Provides a CRUD API for managing insurer company records — entities like ICICI Lombard or HDFC Ergo that offer motor insurance products on the platform. It lets administrators create insurers, browse the catalog (with pagination and search), view a single insurer's details, edit their information, and toggle them active or inactive.

## Why this module exists

The insurer catalog is the root master record for the entire motor insurance flow. Every product, credential, quote, and policy is ultimately linked to an insurer row. Centralising the lifecycle of these records in one admin module ensures a single source of truth for insurer identity and status, rather than scattering that responsibility across the downstream modules that consume it.

## When this module runs / is used

- Invoked whenever an admin user hits any of the five `/api/admin/insurers/*` endpoints.
- All requests must carry the `userdata` header (enforced by the global `validateHeaders` + `decodeUserData` middleware mounted in `app.js`); unauthenticated calls are rejected before reaching these handlers.
- There is no automated or scheduled trigger — this module responds to human admin actions only.

## How it fits in

**Depends on:**
- `shared-library` — provides the `MysqlInsurersModel` base class that owns the Sequelize model definition and DB connection.
- `services/common.js` — `CommonService.errorHandler()` is called in the `add` handler to log structured errors to Winston.
- `utils/response-handler.js` — imported but currently unused (see Optimization opportunities).

**Depended on by:**
- `controllers/import-master.js` — references the `insurers` table directly via a raw SQL query (line 749) to validate insurer IDs during master-data imports.
- `services/insurers/insurer.factory.js` — factory uses the insurer `code` string (e.g. `DIGIT`) to route calls to the right adapter; codes must match what is stored in this catalog.
- `routes/insurer-products.js`, `routes/insurer-api-credentials.js`, `routes/insurer-api-field-master.js`, `routes/insurer-api-field-validation-rule.js` — all downstream admin modules that associate their records with a foreign-keyed insurer ID.

## Key files

| File | Purpose |
|------|---------|
| `routes/insurers.js` | Declares the 5 Express routes (`POST /add`, `POST /list`, `GET /:id`, `PUT /update/:id`, `PATCH /status/:id`) and wires them to the controller. |
| `controllers/insurers.js` | Implements all 5 handler functions; owns the duplicate-code check on create, pagination and search on list, and the existence guard on update. |
| `models/mysqldb/insurer.js` | Thin Sequelize wrapper extending the shared-library base class; adds `findAllCount`, `find` (paginated), `findByCodeExceptId`, and the standard `add`/`update`/`findById`/`findByQuery` helpers. |

## Optimization opportunities

- **What**: Remove the unused `moment` import from `controllers/insurers.js` (line 1).
  **Why**: The package is required and parsed on every module load despite not being called anywhere in the file; misleads readers into thinking timestamps are manipulated here.
  **When**: Now
  **Where**: `controllers/insurers.js` line 1

- **What**: Remove the unused `Sequelize` identifier from the sequelize destructure (line 2); only `Op` is used.
  **Why**: Dead import adds noise and implies Sequelize-level operations (like `Sequelize.literal`) that do not exist here.
  **When**: Nice to have
  **Where**: `controllers/insurers.js` line 2

- **What**: Add server-side validation that `name` and `code` are present and non-empty before hitting the database.
  **Why**: Both fields are marked `required` in the OpenAPI spec but there is no runtime guard. A missing `name` or `code` falls through to the DB and produces a cryptic database constraint error that becomes an opaque 500 response instead of a clear 400. This is a trust-boundary gap — the HTTP layer is the right place to catch it.
  **When**: Now
  **Where**: `controllers/insurers.js` — beginning of `add` and `update` handlers

- **What**: Replace the imported-but-never-called `ResponseHandler` with actual usage across all five handlers.
  **Why**: The controller imports `ResponseHandler` (line 7) but every handler builds raw `res.status(n).json({...})` objects instead. The rest of the application uses `ResponseHandler.success()`, `ResponseHandler.failure()`, etc., which wire into the i18n layer and produce a consistent response envelope. Bypassing it here breaks that consistency and makes error messages in this module invisible to any i18n key audit.
  **When**: Next quarter
  **Where**: `controllers/insurers.js` — all five handler functions

- **What**: Add an existence check in `updateStatus` before applying the update.
  **Why**: `PATCH /status/:id` calls `MysqlInsurersModel.update()` unconditionally. If the provided ID does not exist, Sequelize updates zero rows and still returns without error — the caller receives a `200 OK` with "Insurer status updated successfully" for a record that does not exist. The `update` handler already guards against this (lines 411–419); `updateStatus` should do the same.
  **When**: Next quarter
  **Where**: `controllers/insurers.js` — `updateStatus` function (~line 513)

- **What**: Standardise error logging across all five handlers.
  **Why**: The `add` handler calls both `console.log(error)` and `CommonService.errorHandler()` (which logs to Winston with structured fields). The other four handlers only call `console.log(error)`, so their errors never reach the Winston pipeline or any downstream log aggregator configured to read from it.
  **When**: Next quarter
  **Where**: `controllers/insurers.js` — `list`, `detail`, `update`, `updateStatus` catch blocks

- **What**: Replace the two sequential DB calls in `list` (count then find) with a single `findAndCountAll()`.
  **Why**: Two round-trips to the database where one would do; the gap between them means the count and the page can diverge if a row is inserted between the two calls (phantom read).
  **When**: Nice to have
  **Where**: `controllers/insurers.js` — `list` function, lines 224–232; `models/mysqldb/insurer.js` — add a `findAndCountAll` method

- **What**: Change `POST /list` to `GET /list` (or `GET /` with query parameters).
  **Why**: Using `POST` for a read-only list operation violates REST conventions and prevents HTTP-level caching. Browsers, CDNs, and API gateways cache `GET` responses; `POST` responses are never cached. Current behaviour requires consumers to send a body for a side-effect-free operation.
  **When**: Nice to have (requires coordinating the change with existing API clients)
  **Where**: `routes/insurers.js` line 11; `controllers/insurers.js` — `list` would shift from `req.body` to `req.query`

## Open questions

- The shared-library `MysqlInsurersModel` owns the Sequelize model definition (column names, types, constraints). It is not visible in this repo. Confirming whether `code` has a UNIQUE database constraint would clarify whether the application-level duplicate check in `add` is a safety net or the only guard.
- There is no delete endpoint. Whether this is intentional (soft-delete via `is_active`) or an oversight should be confirmed with the team; deactivating an insurer does not prevent its existing products and credentials from being queried by downstream modules.
