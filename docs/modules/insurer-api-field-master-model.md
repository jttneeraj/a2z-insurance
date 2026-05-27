# Insurer API Field Master Model

## What this module does

Defines the database model for the `insurer_api_field_master` table and exposes the admin CRUD API for managing per-insurer API field definitions. Each record describes one named field that a specific insurer's API expects, capturing metadata such as field type, maximum character length, and a human-readable description. The model layer is a thin wrapper around a base class provided by the shared library.

## Why this module exists

Each insurance company's API uses different field names and formats for the same underlying data. This table acts as a central registry of those field definitions so that a validation engine can check incoming quote and proposal data against each insurer's specific requirements before dispatching requests outward. Without a central registry, field-level rules would have to be hard-coded per insurer, making it expensive to add or adjust fields without a code deploy. The registry also makes it possible to import bulk field definitions from an Excel file rather than configuring them one by one.

## When this module runs / is used

- The admin API endpoints (`/api/admin/insurer-api-field-master/*`) are called manually by internal administrators when onboarding a new insurer or updating field metadata.
- The `insurer-api-field-validation-rule` module reads this model at validation-rule creation time to confirm that a referenced field ID actually exists in the registry.
- The `master-import` module populates this table in bulk when an admin uploads an "API Fields Validation" Excel file (masterType `api_fields_validation`); both `insurer_api_field_master` and `insurer_api_field_validation_rule` are updated in that import.
- `information.md` documents this table as the data source for a planned quote validation engine that maps internal system fields to insurer-specific API fields before calling each insurer.

## How it fits in

**Depends on:**
- `shared-library` — provides the `MysqlInsurerApiFieldMasterModel` base class with the Sequelize model definition and database connection.
- `models/mysqldb/insurer.js` (`MysqlInsurersModel`) — the `add` controller verifies the referenced insurer exists before creating a new field record.
- `services/common.js` (`CommonService`) — structured error-logging helper called in the `add` handler.

**Used by:**
- `controllers/insurer-api-field-validation-rule.js` — queries this model to verify a field ID exists before attaching a validation rule to it.
- `controllers/import-master.js` — bulk-populates this table via the `api_fields_validation` master-import type.
- Quote validation engine (described in `information.md`) — intended future consumer that uses field metadata to validate and map quote inputs before calling insurer APIs.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/insurer-api-field-master.js` | Sequelize model wrapper exposing `add`, `update`, `find`, `findById`, `findByQuery`, and `findAllCount`. |
| `controllers/insurer-api-field-master.js` | Five admin handlers — add, list (paginated + filtered), detail, update, and updateStatus — each with inline OpenAPI annotations. |
| `routes/insurer-api-field-master.js` | Registers the five HTTP routes and is mounted at `/api/admin/insurer-api-field-master` in `app.js`. |

## Optimization opportunities

- **What**: Add an existence check in `updateStatus` — fetch the record first and return 404 if it is missing.
  **Why**: Sequelize's `update` silently reports 0 rows affected without throwing when the ID does not exist, so callers currently receive HTTP 200 with a success message for updates that changed nothing. This is a false-positive that can mask bugs in admin tooling.
  **When**: Now
  **Where**: `controllers/insurer-api-field-master.js` lines 495–513

- **What**: Switch `payload.character_length || null` to `payload.character_length ?? null` in both `add` and `update`.
  **Why**: The `||` operator coerces the value `0` to `null`. A character length of zero is a valid value to store; using nullish coalescing (`??`) preserves it correctly.
  **When**: Now
  **Where**: `controllers/insurer-api-field-master.js` lines 117 and 422

- **What**: Add a duplicate-name guard to the `update` handler mirroring the one already present in `add`.
  **Why**: Updating a record to use the same `field_name` + `insurer_id` combination as a sibling record creates a silent duplicate. The validation engine's field lookups could then return ambiguous results.
  **When**: Now
  **Where**: `controllers/insurer-api-field-master.js` lines 404–441

- **What**: Replace the two sequential database calls in `list` (`findAllCount` then `find`) with `Promise.all` so both run in parallel, or replace both with a single Sequelize `findAndCountAll` call.
  **Why**: The current approach makes two round-trips to the database on every list request. Running them concurrently (or merging them) cuts latency roughly in half for this endpoint.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-master.js` lines 231–239

- **What**: Apply `CommonService.errorHandler` in the `list`, `detail`, `update`, and `updateStatus` error handlers, consistent with how it is already used in `add`.
  **Why**: The other four handlers use bare `console.log`, which bypasses Winston and is not captured in production log files. Structured error metadata (`url`, `operation`, `relativeDetail`) is needed for post-incident diagnosis.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-master.js` lines 248–255, 330–339, 433–440, 507–513

- **What**: Add explicit request-body validation in `add` and `update` to check that `insurer_id` and `field_name` are present before touching the database.
  **Why**: Without validation, missing required fields produce an unhandled DB constraint error that the catch block converts to a generic 500. An explicit check returns a clear 400 with a useful message.
  **When**: Nice to have
  **Where**: `controllers/insurer-api-field-master.js` lines 86–144 and 404–441

## Open questions

- The shared library's `MysqlInsurerApiFieldMasterModel` base class is not available in this working tree (the package is private and requires a `GITHUB_TOKEN` to install). The exact table schema — column names, data types, indexes, and any unique constraint on `(insurer_id, field_name)` — could not be confirmed. A database-level unique index would enforce the duplicate-name invariant even if the application-layer guard is absent or bypassed.
- `information.md` describes this table as the data source for a quote-time validation engine, but no service file implementing that engine was found in the codebase. It is unclear whether the engine is planned, partially built elsewhere, or lives inside the shared library.
