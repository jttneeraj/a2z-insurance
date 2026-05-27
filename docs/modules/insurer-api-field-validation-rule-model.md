# Insurer API Field Validation Rule Model

## What this module does

This module manages the database layer for the `insurer_api_field_validation_rule` table. Each row in that table stores a single validation rule that applies to one insurer's data field in a specific context (such as a quick-quote or full-quote flow). Rules are stored as text strings (for example, `required|regex:^[A-Z0-9-]+$`) that can be read by the application to decide whether a user's input is acceptable before sending it to an insurer's API.

## Why this module exists

Different insurers accept different formats for the same field. The vehicle registration number format Digit accepts may differ from what a future insurer expects. Rather than hard-coding those rules inside application logic, this module provides a database-backed store so that rules can be added or updated through an admin UI or a bulk Excel import without touching code. It lives as its own module to separate the persistence concern from the admin-CRUD layer (`insurer-api-field-validation-rule`) and from any runtime validation logic.

## When this module runs / is used

- **Admin CRUD operations**: Called by `controllers/insurer-api-field-validation-rule.js` whenever an admin adds, lists, retrieves, updates, or toggles the active status of a validation rule via the `/api/admin/insurer-api-field-validation-rule/*` endpoints.
- **Bulk Excel import**: Called indirectly through the master-import flow (`controllers/import-master.js`, `masterType: api_fields_validation`). When an admin uploads an `API Fields Validation.xlsx` file, the `xlsxImporter` parses the sheet and bulk-inserts rows into `insurer_api_field_validation_rule` using the shared-library's upsert mechanism.

## How it fits in

| Direction | Module |
|---|---|
| Extends | `MysqlInsurerApiFieldValidationRuleModel` from the private `shared-library` package (defines the Sequelize model and table binding) |
| Used by | `controllers/insurer-api-field-validation-rule.js` — admin CRUD operations |
| Used by | `controllers/import-master.js` + `lib/xlsxImporter.js` — Excel bulk import |
| Peers with | `insurer-api-field-master-model` — the companion table that defines which fields exist per insurer; a rule must reference a field that exists in that table |

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/insurer-api-field-validation-rule.js` | The model class — wraps the shared-library base with `add`, `update`, `find`, `findAllCount`, `findById`, and `findByQuery` methods; exports a pre-instantiated singleton |
| `controllers/insurer-api-field-validation-rule.js` | Admin controller — contains the five request handlers that call this model; also performs cross-table lookups against the insurer and field-master tables before writes |
| `routes/insurer-api-field-validation-rule.js` | Express router — maps five HTTP verbs/paths to the controller handlers; mounted at `/api/admin/insurer-api-field-validation-rule` in `app.js` |
| `lib/xlsxImporter.js` (lines 424–471) | `parseApiFieldValidationRules` — parses the Excel sheet into row objects, one per field × context-code combination; the context codes (`QUICK_QUOTE_NEW`, `CREATE_QUOTE_NEW`, etc.) are hard-coded here |
| `controllers/import-master.js` (lines 428–447) | `api_fields_validation` config block — wires the `masterType` string to the target table and the custom reader function |

## Optimization opportunities

- **What**: Add structured error logging to the `list`, `detail`, `update`, and `updateStatus` handlers in `controllers/insurer-api-field-validation-rule.js` (lines 273–278, 357–362, 453–458, 525–530). Currently these catch blocks only call `console.log(error)` with no metadata, unlike the `add` handler which calls `CommonService.errorHandler`.
  **Why**: Inconsistent logging makes production debugging harder. Errors in these four paths are invisible to any log aggregation that relies on the structured Winston transport.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-validation-rule.js`, lines 273–278, 357–362, 453–458, 525–530

- **What**: Add an existence check in `updateStatus` before calling `model.update` (mirror the guard already in `update` at line 428).
  **Why**: Currently `updateStatus` silently succeeds even if the supplied `id` does not exist, returning HTTP 200 with no indication that no row was changed. This can mislead callers.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-validation-rule.js`, line 514 (`updateStatus` handler)

- **What**: Strip `undefined` fields from `DBPayload` before calling `model.update` in the `update` handler (lines 438–443). Currently, if a caller omits `insurer_id`, `field_name`, `validation_context_code`, or `validation_rule_text`, those keys are passed as `undefined` to Sequelize, which may write `NULL` to the column.
  **Why**: Data corruption risk — a partial update intended to change only `validation_rule_text` could silently clear the other three columns.
  **When**: Now
  **Where**: `controllers/insurer-api-field-validation-rule.js`, lines 438–443

- **What**: Replace the two-query count-then-fetch pattern in `list` with a single Sequelize `findAndCountAll` call.
  **Why**: Eliminates a redundant database round-trip on every list request, simplifying code and marginally improving latency at scale.
  **When**: Nice to have
  **Where**: `controllers/insurer-api-field-validation-rule.js`, lines 256–264

- **What**: Move the four validation context-code constants (`QUICK_QUOTE_NEW`, `QUICK_QUOTE_ROLLOVER_RENEWAL`, `CREATE_QUOTE_NEW`, `CREATE_QUOTE_ROLLOVER_RENEWAL`) from `lib/xlsxImporter.js` (lines 431–447) into `constants/common.js`.
  **Why**: These strings are also valid filter values for the admin list endpoint. Keeping them only in the importer makes it easy to introduce a typo or add a new context code in one place but not the other.
  **When**: Nice to have
  **Where**: `lib/xlsxImporter.js`, lines 431–447

## Open questions

- **Runtime consumption**: The table stores rule text strings (e.g., `required|regex:...`), but no code in this repository reads those strings back at runtime to validate motor-quote inputs. Either the validation logic lives in the front-end, or it lives in a service not yet in this repo. Clarify where `validation_rule_text` is actually evaluated during a customer's quote flow.
- **Context code registry**: The four context codes parsed from Excel are hard-coded in `xlsxImporter.js`. Is there a definitive source-of-truth list (database table, constant, or spec document) that the admin UI and any runtime validators should agree on?
- **`is_active` enforcement**: The `update` endpoint does not allow changing `is_active`; only `updateStatus` does. Is this intentional, or should `update` also be able to set the active flag?
