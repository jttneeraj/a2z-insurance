# Insurer API Field Master

## What this module does

This module provides an admin CRUD interface for defining which API fields each insurer's integration accepts. Each record names a field (for example `vehicle_registration_number`), links it to a specific insurer, and stores optional metadata: a human-readable description, the maximum character length, and the data type (string, integer, date, etc.). Records can be individually enabled or disabled via an `is_active` flag.

## Why this module exists

Every insurer's API has a different vocabulary of field names and constraints. Rather than hard-coding that vocabulary inside the adapter code, this module stores it as managed data so it can be inspected, updated, and extended without a code deployment. It also acts as the reference catalog for the sibling module `insurer-api-field-validation-rule`, which cannot attach a validation rule to a field that hasn't been declared here first.

## When this module runs / is used

- **Admin staff** trigger it manually by calling the five REST endpoints under `/api/admin/insurer-api-field-master/*` — typically when onboarding a new insurer or updating field metadata for an existing one.
- **The `insurer-api-field-validation-rule` controller** performs a live FK lookup against this module on every `add` call, rejecting validation rules that reference undeclared fields.
- **The master-import pipeline** (`controllers/import-master.js`, `masterType = api_fields_validation`) bulk-populates this table from an Excel file ("All Motor Product" sheet of `API Fields Validation.xlsx`) using `ON DUPLICATE KEY UPDATE` with unique key `(insurer_id, field_name)`.
- **Planned future use**: `information.md` records that this table was designed to feed a quote-request validation engine (checking payload fields against per-insurer rules before calling the insurer API), but that engine is not yet implemented in the current codebase.

## How it fits in

**Depends on:**
- `models/mysqldb/insurer.js` — `add` verifies that `insurer_id` references a real insurer record before inserting.
- `shared-library` — `MysqlInsurerApiFieldMasterModel` base class provides the Sequelize model definition and DB connection.

**Depended on by:**
- `controllers/insurer-api-field-validation-rule.js` — queries this table as an FK check when adding validation rules.
- `controllers/import-master.js` — writes to the underlying table during Excel bulk imports.

## Key files

| File | Purpose |
|---|---|
| `routes/insurer-api-field-master.js` | Declares the five Express routes (POST /add, POST /list, GET /:id, PUT /update/:id, PATCH /status/:id) and wires them to the controller. |
| `controllers/insurer-api-field-master.js` | Implements the five request handlers, including insurer FK validation on `add` and duplicate `(insurer_id, field_name)` detection. |
| `models/mysqldb/insurer-api-field-master.js` | Thin Sequelize wrapper: `add`, `update`, `find`, `findById`, `findByQuery`, `findAllCount`. Exports a ready-made singleton. |

## Optimization opportunities

- **What**: Add an existence check in `updateStatus` before calling `model.update()`.
  **Why**: `PATCH /status/:id` with a non-existent ID currently returns `200 OK` with "status updated successfully" because Sequelize's `update()` returns `[0]` without throwing. The caller cannot distinguish a successful toggle from a silent no-op.
  **When**: Now
  **Where**: `controllers/insurer-api-field-master.js` lines 495–514

- **What**: Add `insurer_id` FK re-validation and duplicate `(insurer_id, field_name)` collision check in `update`.
  **Why**: `add` guards both conditions; `update` skips them. A rename to a non-existent insurer produces an opaque 500, and renaming to a field name that already exists for the same insurer also triggers a DB constraint 500 instead of a descriptive 400.
  **When**: Now
  **Where**: `controllers/insurer-api-field-master.js` lines 404–441

- **What**: Use the existing record as a fallback for optional fields in `update` instead of defaulting to `null`.
  **Why**: `payload.field_description || null` (line 421) and `payload.field_type || null` (line 423) silently wipe existing values when the caller sends a partial update. The `existing` record is already fetched on line 408 and can supply safe defaults.
  **When**: Now
  **Where**: `controllers/insurer-api-field-master.js` lines 418–424

- **What**: Call `CommonService.errorHandler` in the `list` and `detail` catch blocks.
  **Why**: `add` already calls `CommonService.errorHandler` for structured Winston logging, but `list` and `detail` only `console.log` the error, producing unstructured output that the log-aggregation pipeline cannot parse.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-master.js` lines 248–255 and 332–339

- **What**: Add a hard cap on the `limit` parameter in `list`.
  **Why**: There is no upper bound, so a single API call can dump the entire table in one response, putting avoidable load on the database.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-master.js` line 215

- **What**: Fix the JSDoc `@openapi` path for `updateStatus` to match the actual route.
  **Why**: The annotation documents the path as `/update-status/{id}` (line 446) but the registered route is `/status/:id` (routes file line 11), so the Swagger "Try it out" button sends requests to a non-existent path.
  **When**: Nice to have
  **Where**: `controllers/insurer-api-field-master.js` line 446

- **What**: Replace raw `res.status().json()` calls with `ResponseHandler` across all five handlers.
  **Why**: The module bypasses the i18n-keyed response envelope (`ResponseHandler#success`, `#failure`, etc.) used in the customer-facing motor flow, producing inconsistent response shapes for API consumers.
  **When**: Nice to have
  **Where**: `controllers/insurer-api-field-master.js` (all five handlers)

## Open questions

- **Is the validation engine still planned?** `information.md` describes using `insurer_api_field_master` and `insurer_api_field_validation_rule` as the data source for a quote-request validation layer, but no code in the motor-quote flow reads from either table. Confirming whether this is in scope would clarify whether the data in these tables is actively maintained or has drifted from the real insurer field list.
- **What is the authoritative source for `field_type` values?** The field accepts a free-text string (e.g. `"string"`, `"integer"`, `"date"`), but there is no enum constraint or validation in the controller or model. Are there expected canonical values that downstream code would rely on?
