# Product Configs

## What this module does

The product-configs module stores and manages per-plan operational parameters for every insurance product/insurer combination. A config record controls things like whether vehicle inspection, KYC, or payment are required before a policy can be issued, the vehicle age range the plan accepts, and how long the policy runs. Administrators create and update these records through an internal REST API.

## Why this module exists

Each insurer may offer the same insurance product (e.g. Comprehensive Car Insurance) under different rules — one insurer might waive inspection for vehicles under three years old while another always requires it. Rather than hard-coding such rules in the motor flow, the product-configs table gives operations teams a place to configure these parameters once and have the system enforce them consistently. It sits at the fourth level of the product hierarchy: Insurance Type → Insurance Product → Insurer Product → **Product Config** → Quote → Proposal → Policy.

## When this module runs / is used

- Called by admin users through the internal REST API at `/api/admin/product-configs/*`.
- `POST /add` — when an admin creates a config for a new (product, insurer-product) combination.
- `POST /list` — when an admin queries the config list, optionally filtered by product, insurer product, or active status.
- `GET /:id` — when an admin retrieves the full detail of a single config record.
- `PUT /update/:id` — when an admin updates the configuration values for an existing record.
- `PATCH /status/:id` — when an admin activates or deactivates a config record.

The config flags (`inspection_required`, `kyc_required`, `payment_required`, `min_vehicle_age`, `max_vehicle_age`, `policy_duration`) are **not yet read by the motor customer flow** — they are stored but currently dormant. See Open questions.

## How it fits in

**Depends on:**
- `models/mysqldb/insurance-product.js` — FK validation: checks that the submitted `product_id` exists before creating a config.
- `models/mysqldb/insurer-product.js` — FK validation: checks that the submitted `insurer_product_id` exists before creating a config.
- `models/mysqldb/product-config.js` (this module) — Sequelize model that wraps the shared-library base class.
- `services/common.js` — `CommonService.errorHandler()` called (only in the `add` handler's catch block).
- Shared library (`MysqlProductConfigsModel`) — provides the base Sequelize model and DB connection.

**Depended on by:**
- `app.js` — mounts this module's router at `/api/admin/product-configs`.
- No motor-flow controller currently imports or queries the `product_config` table.

## Key files

| File | Purpose |
|------|---------|
| `routes/product-configs.js` | Express router; wires the 5 HTTP endpoints to controller functions. |
| `controllers/product-configs.js` | All business logic — FK validation, duplicate guard, DB reads and writes, HTTP responses. |
| `models/mysqldb/product-config.js` | Thin Sequelize wrapper over the shared-library `MysqlProductConfigsModel`; exposes `add`, `update`, `find`, `findById`, `findByQuery`, `findAllCount`. |

## Optimization opportunities

### 1. `updateStatus` silently succeeds for non-existent IDs
- **What**: Add an existence check (`findById`) at the top of `updateStatus` and return 404 if the record does not exist, before running the update.
- **Why**: The handler currently calls `MysqlProductConfigsModel.update()` unconditionally; if the ID does not match any row, the DB update affects 0 rows and the caller receives `200 OK` — masking a likely client-side bug.
- **When**: Now
- **Where**: `controllers/product-configs.js` lines 375–393

### 2. `update` does not re-validate FK references or guard against duplicate pairs
- **What**: Before applying the update, verify that the new `product_id` and `insurer_product_id` exist (like `add` does), and check that no other config already uses the same `(product_id, insurer_product_id)` pair.
- **Why**: `add` enforces both constraints, but `update` skips them entirely. Changing `product_id` to a non-existent ID produces an opaque DB foreign-key 500 instead of a 400; creating a duplicate pair hits the unique constraint and also returns a 500.
- **When**: Now
- **Where**: `controllers/product-configs.js` lines 301–341 (between existence check and `DBPayload` construction)

### 3. `updateStatus` does not validate the `is_active` payload field
- **What**: Add a check that `req.body.is_active` is present and is `0` or `1` before running the DB update.
- **Why**: An absent `is_active` passes `undefined` directly to `model.update()`, which may silently set the column to NULL depending on the DB schema.
- **When**: Now
- **Where**: `controllers/product-configs.js` lines 375–393

### 4. OpenAPI path for `updateStatus` does not match the actual route
- **What**: Update the `@openapi` JSDoc above `updateStatus` to document the path as `/admin/product-configs/status/{id}` (matching the registered Express route `PATCH /status/:id`) instead of `/admin/product-configs/update-status/{id}`.
- **Why**: The Swagger UI shows a path that returns 404 when tried, breaking the self-service API documentation.
- **When**: Now
- **Where**: `controllers/product-configs.js` lines 346–349

### 5. `||` defaults for `min_vehicle_age` and `max_vehicle_age` should use `??`
- **What**: Replace `payload.min_vehicle_age || 0` and `payload.max_vehicle_age || 0` with `payload.min_vehicle_age ?? 0` and `payload.max_vehicle_age ?? 0` in both `add` and `update`.
- **Why**: Using `||` means an explicitly-passed `0` is treated as absent and replaced with `0` — which happens to produce the same result here, but `max_vehicle_age || 0` will also silently default a legitimately-absent `max_vehicle_age` to `0`, creating a de facto "vehicles aged 0–0 years only" constraint when the admin intended to leave it unconstrained.
- **When**: Next quarter
- **Where**: `controllers/product-configs.js` lines 98–99 (`add`) and lines 319–320 (`update`)

### 6. `list` endpoint has no upper bound on `limit`
- **What**: Cap `limit` at a reasonable maximum (e.g. 100) and return a 400 if the caller requests more.
- **Why**: Without a cap, a caller can pass `limit: 9999999` and trigger a full-table scan with no server-side protection.
- **When**: Next quarter
- **Where**: `controllers/product-configs.js` line 170

### 7. Unused imports in controller and model
- **What**: Remove `Op` and `Sequelize` from the destructured import on controller line 1; remove `QueryTypes` from the model import on model line 1.
- **Why**: These symbols are never referenced. They add noise and suggest copy-paste origin from other admin controllers.
- **When**: Nice to have
- **Where**: `controllers/product-configs.js` line 1; `models/mysqldb/product-config.js` line 1

### 8. Inconsistent error handling across handlers
- **What**: Extend the `CommonService.errorHandler()` call (currently used only in `add`) to the catch blocks of `list`, `detail`, `update`, and `updateStatus`, and remove the redundant `console.log(error)` lines that precede it.
- **Why**: Only `add` routes errors through structured Winston logging; the other four handlers use bare `console.log`, losing the structured metadata fields (`url`, `function`, `operation`, `relativeDetail`) that log aggregators rely on.
- **When**: Nice to have
- **Where**: `controllers/product-configs.js` lines 195–202, 245–252, 333–340, 386–393

### 9. Config flags are never consumed by the motor flow
- **What**: Wire the product-config record lookup into the quote and proposal controllers so that `inspection_required`, `kyc_required`, `payment_required`, `min_vehicle_age`, `max_vehicle_age`, and `policy_duration` gate the corresponding motor-flow steps.
- **Why**: The fields are captured and stored but have no runtime effect — KYC, payment, and inspection always run regardless of the config flags, making the admin-facing configuration UI misleading.
- **When**: Next quarter (requires coordination with motor flow controllers)
- **Where**: `controllers/motor-quote-request.js`, `controllers/motor-kyc.js`, `controllers/motor-payment.js` — lookup point TBD by motor flow team

## Open questions

1. **Are the config flags (`inspection_required`, `kyc_required`, `payment_required`) intended to gate motor flow steps in a future sprint, or is this table a placeholder whose enforcement layer has not been built yet?** The `information.md` roadmap lists "Product Configs" as a completed setup step but does not mention enforcement.
2. **What is the expected behaviour when `max_vehicle_age` is 0?** Is `0` a sentinel meaning "no upper limit" or literally "zero years"? The default fallback for a missing field is `0` in both `add` and `update`, so clarifying this would determine whether the `??` fix in optimization 5 is safe.
3. **Should `product_id` and `insurer_product_id` be required fields in the `update` body, or should a partial update (changing only numeric thresholds) be supported without re-specifying the FK pair?** Currently the `update` handler unconditionally writes both into the DB payload, which would set them to `undefined` if omitted.
