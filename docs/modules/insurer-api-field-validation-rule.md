# Insurer API Field Validation Rule

## What this module does

This module is the admin CRUD surface for attaching validation rules to individual insurer API fields. Each rule ties a specific field (e.g. `vehicle_registration_number`) owned by a specific insurer to a plain-text validation expression (e.g. `required|regex:^[A-Z0-9-]+$`) that should be applied in a particular workflow context (e.g. `QUOTE`). The table it manages is the second half of a two-table declaration system: `insurer_api_field_master` declares which fields an insurer accepts; `insurer_api_field_validation_rule` declares how those fields should be validated.

## Why this module exists

Different insurers enforce different format requirements for the same conceptual field — one insurer may accept an open-text registration number while another requires a strict alphanumeric pattern. Storing these rules in the database (rather than hard-coding them per-insurer) is meant to let operations staff configure and adjust validation without touching source code. It also supports context-scoped rules: the same field may have a `QUOTE` rule that is relaxed and a `PROPOSAL` rule that is strict.

## When this module runs / is used

The admin REST API at `/api/admin/insurer-api-field-validation-rule` is the only active entry point. It is called manually by the internal admin UI or API clients to:

- Create a rule (`POST /add`)
- List / filter rules with pagination (`POST /list`)
- Fetch a single rule by ID (`GET /:id`)
- Update a rule (`PUT /update/:id`)
- Enable or disable a rule (`PATCH /status/:id`)

Bulk population of this table is also supported via the master-data importer (`controllers/import-master.js`, `masterType: api_fields_validation`), which reads the `"All Motor Product"` sheet of an uploaded Excel file and upserts rows keyed on `(insurer_id, field_name, validation_context_code)`.

The module is **never called at runtime by the motor flow**. No service in the quote, proposal, KYC, or payment flow reads from `insurer_api_field_validation_rule`. According to `work_info.md`, a planned validation engine would consume both `insurer_api_field_master` and this table before preparing an insurer request payload, but that engine has not been implemented.

## How it fits in

- **Depends on**: `models/mysqldb/insurer-api-field-master` (FK validation in `add`), `models/mysqldb/insurer` (FK validation in `add`), `services/common` (`CommonService.errorHandler`)
- **Depended on by**: `controllers/import-master.js` references the `insurer_api_field_validation_rule` table name for bulk imports; no motor-flow module reads from this table yet
- **Mounted by**: `app.js` at `/api/admin/insurer-api-field-validation-rule`

## Key files

| File | Purpose |
|------|---------|
| `routes/insurer-api-field-validation-rule.js` | Registers the five Express endpoints and wires each to its controller function |
| `controllers/insurer-api-field-validation-rule.js` | Implements `add`, `list`, `detail`, `update`, `updateStatus` with OpenAPI JSDoc annotations |
| `models/mysqldb/insurer-api-field-validation-rule.js` | Thin Sequelize wrapper extending the shared-library base model; exposes `add`, `update`, `find`, `findById`, `findByQuery`, `findAllCount` |

## Optimization opportunities

- **What**: Add an existence check in `updateStatus` before calling `model.update()`.
  **Why**: Without it, `PATCH /status/:id` with a non-existent ID silently returns `200 OK` instead of `404`, identical to the bug documented in every prior admin module (`insurers`, `insurance-types`, `insurance-products`, `insurer-products`, `product-configs`, `product-addons`, `addons`, `product-document-requirements`, `insurer-api-credentials`, `insurer-api-field-master`).
  **When**: Now
  **Where**: `controllers/insurer-api-field-validation-rule.js:514–533`

- **What**: Fix the duplicate-check uniqueness key in `add` to be `(insurer_id, field_name, validation_context_code)`, not all four fields including `validation_rule_text`.
  **Why**: The current check (`findByQuery` on all four fields) allows multiple conflicting rules for the same field and context to coexist — only an exact text match is blocked. The semantically correct unique constraint is the three-field combination, as confirmed by the `uniqueKeys` in `import-master.js` (line 443). Multiple active rules for the same field+context makes the intended validation engine ambiguous.
  **When**: Now
  **Where**: `controllers/insurer-api-field-validation-rule.js:119–132`

- **What**: Fix the JSDoc `@openapi` path annotation for `updateStatus`.
  **Why**: The annotation documents the path as `/update-status/{id}` but the registered route is `PATCH /status/:id`. The Swagger "Try it out" button sends requests to the wrong URL and always gets a 404.
  **When**: Now
  **Where**: `controllers/insurer-api-field-validation-rule.js:465`

- **What**: Add FK re-validation and duplicate-triple guard in `update`.
  **Why**: `add` validates that `insurer_id` exists and that `(insurer_id, field_name)` exists in `insurer_api_field_master`, but `update` skips both checks. A caller can reassign a rule to a non-existent insurer or a field not declared for that insurer, producing an opaque DB constraint 500 instead of a descriptive 400. Likewise, `update` does not check whether the new `(insurer_id, field_name, validation_context_code)` combination already belongs to another rule, enabling duplicate creation via the update path.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-validation-rule.js:424–460`

- **What**: Guard against `undefined` values in the `update` DBPayload.
  **Why**: `DBPayload` is built by directly reading `payload.insurer_id`, `payload.field_name`, etc. If the caller omits a field (partial update), those keys are `undefined` in the object. Sequelize may silently NULL-out the column or behave inconsistently depending on the model configuration, causing data loss that is hard to diagnose. The `existing` record is already fetched on line 428 and could supply safe fallback values.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-validation-rule.js:438–443`

- **What**: Add server-side required-field validation in `add` for `insurer_id`, `field_name`, `validation_context_code`, and `validation_rule_text`.
  **Why**: All four are declared `required` in the OpenAPI spec, but the controller sends them straight to the DB without a null/undefined check. A missing field hits the DB constraint and returns an uninformative 500.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-field-validation-rule.js:92–164`

- **What**: Add an upper-bound cap on the `limit` parameter in `list`.
  **Why**: No maximum is enforced; an authenticated caller can request all rows in a single response. A cap of, say, 100 rows limits accidental or intentional full-table dumps.
  **When**: Nice to have
  **Where**: `controllers/insurer-api-field-validation-rule.js:236`

- **What**: Add `CommonService.errorHandler` logging to the `list` and other catch blocks that only call `console.log`.
  **Why**: `add` correctly calls `CommonService.errorHandler` for structured Winston logging, but `list`, `detail`, `update`, and `updateStatus` catch blocks use only `console.log`, bypassing the structured log format. Errors in those handlers will not appear in the rotating log files or the remote HTTP transport.
  **When**: Nice to have
  **Where**: `controllers/insurer-api-field-validation-rule.js:273–280, 357–364, 452–459, 525–532`

## Open questions

- **What validation rule syntax is expected?** `validation_rule_text` is a free-form string (example: `required|regex:^[A-Z0-9-]+$`). Is there a documented grammar or a specific validation library that will parse this? Without knowing the format, it is impossible to validate the string at write time or implement the consumption engine correctly.
- **What are the valid `validation_context_code` values?** The OpenAPI example shows `QUOTE`, but no enum is enforced in the code or documented elsewhere. Is `PROPOSAL`, `KYC`, etc. also expected?
- **Is the planned validation engine actively in scope?** `work_info.md` describes consuming both `insurer_api_field_master` and this table in a validation step before preparing insurer request payloads, but the feature is not implemented. Until it is, all data written to this table is configuration with no runtime effect.
