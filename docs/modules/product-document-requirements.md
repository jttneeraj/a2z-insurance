# Product Document Requirements

## What this module does

This module manages a catalog of documents that each insurance product (combined with a specific insurer product) requires customers to submit. Each record says: for this product + insurer combination, a document with this code and name must (or may optionally) be collected. Administrators create and maintain these records through a private REST API.

## Why this module exists

Different insurers require different supporting documents when processing a motor insurance proposal. For example, one insurer's comprehensive car product might require a registration certificate and a previous-year policy, while another's third-party product requires only an Aadhaar scan. This module provides a central table to declare those requirements per product–insurer pair rather than hard-coding them in the motor flow. It sits at the sixth level of the admin configuration hierarchy: Insurance Type → Insurance Product → Insurer Product → Product Config → Product Add-on → **Product Document Requirement**.

## When this module runs / is used

All five endpoints are guarded by the standard `userdata` header middleware and are accessible only at `/api/admin/product-document-requirements/*`. They are invoked:

- `POST /add` — when an admin creates a new document requirement for a product–insurer pair
- `POST /list` — when an admin panel page loads or searches the document requirements table (supports filtering by `product_id`, `insurer_product_id`, `is_active`, and a free-text search across `document_code`/`document_name`)
- `GET /:id` — when an admin opens a specific record for inspection
- `PUT /update/:id` — when an admin edits an existing record
- `PATCH /status/:id` — when an admin activates or deactivates a record

## How it fits in

**Depends on:**
- `models/mysqldb/product-document-requirement.js` — Sequelize model wrapping the `product_document_requirement` table in the shared-library database layer
- `services/common.js` — `CommonService.errorHandler` for structured Winston error logging (used in `add` only; other handlers use `console.log`)
- `shared-library` (GitHub private package) — provides the base `MysqlProductDocumentRequirementsModel` class

**Depended on by:**
- `app.js` — mounts this router at `/api/admin/product-document-requirements`
- No motor-flow controllers currently read from this table (see Open questions)

## Key files

| File | Purpose |
|------|---------|
| `routes/product-document-requirements.js` | Registers the five REST endpoints and binds them to the controller |
| `controllers/product-document-requirement.js` | Implements `add`, `list`, `detail`, `update`, `updateStatus` — all request handling, validation, and response shaping |
| `models/mysqldb/product-document-requirement.js` | Sequelize model: `create`, `update`, `find`, `findAll`, `findById`, `findByQuery` against the `product_document_requirement` table |

## Optimization opportunities

- **`updateStatus` silently returns 200 for non-existent IDs**
  - **What**: Add an existence check (`findById`) before calling `update` in the `updateStatus` handler and return a 404 if the record does not exist.
  - **Why**: Sequelize's `model.update(data, { where: { id } })` returns `[0]` (zero rows affected) when the ID is missing but does not throw; the handler interprets this as success and sends `200 OK` — masking admin typos and bad integrations. Every other admin module in the codebase has this same defect.
  - **When**: Now
  - **Where**: `controllers/product-document-requirement.js`, lines 342–361

- **`update` silently resets `is_required` to `1` when the field is omitted**
  - **What**: Replace `payload.is_required !== undefined ? payload.is_required : 1` with a fallback to the existing record's value (`existing.is_required`), which is already fetched on line 275.
  - **Why**: A caller that sends a partial update (e.g. only changing `document_name`) will silently flip `is_required` from `0` to `1`, corrupting the record without any intent or error. The existing record is already in scope and can supply the safe default.
  - **When**: Now
  - **Where**: `controllers/product-document-requirement.js`, line 290

- **JSDoc path mismatch for `updateStatus`**
  - **What**: Change the `@openapi` annotation path from `/admin/product-document-requirements/update-status/{id}` to `/admin/product-document-requirements/status/{id}` to match the actual registered route (`PATCH /status/:id`).
  - **Why**: The mismatch causes the Swagger "Try it out" button to generate a request to the wrong URL, returning a 404. This is the same documentation bug seen in `product-configs` and `addons`.
  - **When**: Now
  - **Where**: `controllers/product-document-requirement.js`, line 313

- **`update` does not re-validate FK references or block duplicate triplets**
  - **What**: Before applying an update, validate that the supplied `product_id` and `insurer_product_id` still exist, and verify that the new `(product_id, insurer_product_id, document_code)` triplet does not already belong to a different record.
  - **Why**: `add` performs both FK checks and the duplicate-triplet guard, but `update` skips them. An update that moves a record to an already-occupied triplet will hit a DB constraint and return an opaque 500 instead of a meaningful 400.
  - **When**: Next quarter
  - **Where**: `controllers/product-document-requirement.js`, `update` handler, lines 271–308

- **`add` does not validate required fields at the HTTP boundary**
  - **What**: Add an explicit check that `product_id`, `insurer_product_id`, `document_code`, and `document_name` are present in `req.body` before touching the database, and return a 400 with a clear message if any are missing.
  - **Why**: Missing required values currently propagate to the DB and produce an unhelpful 500 (NOT NULL constraint violation) rather than a 400 with actionable feedback. No FK existence validation is done either.
  - **When**: Next quarter
  - **Where**: `controllers/product-document-requirement.js`, `add` handler, line 48 onwards

- **No upper-bound cap on the `list` endpoint's `limit` parameter**
  - **What**: Clamp `payload.limit` to a maximum (e.g. 100) before passing it to the query.
  - **Why**: An authenticated caller can pass `limit: 999999` and force a full table dump in a single response, putting unnecessary load on the database.
  - **When**: Nice to have
  - **Where**: `controllers/product-document-requirement.js`, line 140

- **Inconsistent error logging — `console.log` instead of Winston across four handlers**
  - **What**: Replace bare `console.log(error)` in the `list`, `detail`, `update`, and `updateStatus` catch blocks with the `CommonService.errorHandler` call pattern already used in `add`.
  - **Why**: Errors from four of the five handlers bypass the structured Winston logging pipeline, making them invisible to log-aggregation tooling. The `add` handler already sets the correct pattern.
  - **When**: Nice to have
  - **Where**: `controllers/product-document-requirement.js`, lines 174, 222, 301, 354

- **Dead `QueryTypes` import in the model**
  - **What**: Remove `const { QueryTypes } = require("sequelize")` from the model file — it is imported but never referenced.
  - **Why**: Reduces noise and eliminates a misleading signal that raw SQL queries are used in this model.
  - **When**: Nice to have
  - **Where**: `models/mysqldb/product-document-requirement.js`, line 1

## Open questions

1. **Are document requirements consumed anywhere in the motor flow?** No controller in `controllers/` or `services/` currently reads from the `product_document_requirement` table. The KYC flow (`controllers/motor-kyc.js`) does not query this table when deciding which documents to request from customers. It is unclear whether this configuration table is intentionally inert (reserved for a future KYC gating step) or whether the consumer code was never written.
2. **Should `update` be a PATCH (partial update) instead of a PUT (full replace)?** The current handler accepts any subset of fields but silently overwrites `is_required` with `1` when the field is omitted, suggesting the intent was a partial update. Clarifying the contract would fix the data-corruption risk cleanly.
3. **What is the relationship between `product_document_requirement.document_code` and the `insurer_kyc_document_type_master` table** (imported via the `doc_type_master` master-import type per `information.md`)? It is unclear whether `document_code` values must come from that master table, or whether they are free-form strings.
