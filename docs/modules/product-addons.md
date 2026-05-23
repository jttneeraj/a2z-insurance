# Product Add-ons

## What this module does

This module manages the mapping table that records which optional coverage enhancements ("add-ons" — e.g. zero depreciation cover, roadside assistance, engine protection) are available for each insurance product and insurer-product combination. It also stores whether a given add-on is mandatory or optional, and what internal code the insurer uses to reference it in their API calls.

## Why this module exists

Different insurers support different add-ons for different products, and the combinations change over time. Rather than hard-coding availability in application logic, this module provides an admin-managed catalog that can be updated without a code deployment. It sits at the fifth level of the product hierarchy: Insurance Type → Insurance Product → Insurer Product → Product Config → **Product Add-on Mapping**.

## When this module runs / is used

All five endpoints are internal admin endpoints, called by the operations or configuration team through the admin UI or directly:

- **Add a mapping** (`POST /api/admin/product-addons/add`) — when onboarding a new add-on for a product/insurer combination.
- **List mappings** (`POST /api/admin/product-addons/list`) — to browse available add-ons with optional filters by product, insurer product, add-on, and active status.
- **Get single mapping** (`GET /api/admin/product-addons/:id`) — to view a specific mapping.
- **Update a mapping** (`PUT /api/admin/product-addons/update/:id`) — to change the insurer's add-on code or mandatory flag.
- **Toggle active status** (`PATCH /api/admin/product-addons/status/:id`) — to enable or disable an add-on for a product without deleting it.

## How it fits in

**Depends on:**
- `models/mysqldb/insurance-product.js` — validates that the given `product_id` exists before allowing a mapping to be created.
- `models/mysqldb/insurer-product.js` — validates that the given `insurer_product_id` exists.
- `models/mysqldb/addon.js` — validates that the given `addon_id` exists (the `addons` module manages the add-on catalog).
- `models/mysqldb/product-addon.js` — the Sequelize model that persists and queries the `product_addon` table.
- `services/common.js` — `CommonService.errorHandler` is called in the `add` catch block for structured Winston error logging.

**Depended on by:**
- No other module currently reads from this module's model or table. The motor-quote and proposal flow in `controllers/motor-quotes.js` and `services/insurers/digit/digit.mapper.js` resolve add-ons directly from the customer's proposal payload fields, not from the `product_addon` table.

## Key files

| File | Purpose |
|------|---------|
| `routes/product-addons.js` | Express router — maps the five HTTP endpoints to controller functions. |
| `controllers/product-addon.js` | All handler logic: `add`, `list`, `detail`, `update`, `updateStatus`. Contains the FK validation and duplicate-mapping guard. |
| `models/mysqldb/product-addon.js` | Thin Sequelize wrapper around the `product_addon` table; extends the shared-library base class. Provides `add`, `update`, `find`, `findById`, `findAllCount`, and `findByQuery`. |

## Optimization opportunities

### 1. `updateStatus` silently succeeds for non-existent IDs
- **What**: Add an existence check in `updateStatus` before calling `update`, and return `404` if `findById` returns null.
- **Why**: The handler currently calls `model.update()` with a WHERE clause that matches zero rows; Sequelize returns `[0]` (rows affected), but the handler always responds `200 OK`. Callers have no way to know the ID was wrong — the same silent-200 bug present in `insurers`, `insurance-types`, `insurance-products`, `insurer-products`, and `product-configs`.
- **When**: Now
- **Where**: `controllers/product-addon.js`, lines 374–394

### 2. `update` skips FK re-validation and duplicate-triple guard
- **What**: When changing `product_id`, `insurer_product_id`, or `addon_id` on an existing record, the `update` handler should (a) validate that the new FK values exist and (b) check that the updated triple `(product_id, insurer_product_id, addon_id)` does not already exist in another row.
- **Why**: The `add` handler enforces both guards, but `update` omits them. A caller can set an orphaned FK (producing a silent DB constraint violation 500) or create a logical duplicate without an error. The same gap exists in `product-configs` and `insurer-products`.
- **When**: Now
- **Where**: `controllers/product-addon.js`, lines 302–340

### 3. `update` silently resets `is_mandatory` to `0` when omitted
- **What**: Change the `is_mandatory` line in `update`'s `DBPayload` to read the existing value from the DB record when the field is not present in the request body, rather than defaulting to `0`.
- **Why**: `is_mandatory: payload.is_mandatory !== undefined ? payload.is_mandatory : 0` means a partial update that only changes `insurer_addon_code` will reset `is_mandatory` from `1` to `0` without the caller intending it. The correct pattern is `payload.is_mandatory !== undefined ? payload.is_mandatory : existing.is_mandatory`.
- **When**: Now
- **Where**: `controllers/product-addon.js`, line 321

### 4. OpenAPI path mismatch in `updateStatus`
- **What**: Correct the JSDoc `@openapi` path tag from `/admin/product-addons/update-status/{id}` to `/api/admin/product-addons/status/{id}` to match the registered route.
- **Why**: The Swagger "Try it out" button for `updateStatus` sends requests to the wrong URL, making it non-functional in the admin UI. The registered route is `PATCH /status/:id` (mounted under `/api/admin/product-addons`), not `/update-status/{id}`.
- **When**: Now
- **Where**: `controllers/product-addon.js`, line 346

### 5. Four of five catch blocks use only `console.log`
- **What**: Replace standalone `console.log(error)` calls in the `list`, `detail`, `update`, and `updateStatus` catch blocks with `CommonService.errorHandler()` (as `add` already does).
- **Why**: These four handlers lose structured metadata (URL, operation, relative detail) in error logs, making it harder to trace production incidents in Kibana or similar tooling. `add` at lines 112–117 shows the correct pattern.
- **When**: Next quarter
- **Where**: `controllers/product-addon.js`, lines 203–209, 253–260, 332–339, 386–393

### 6. `list` has no upper-bound cap on `limit`
- **What**: Add a maximum allowed value for the `limit` parameter (e.g. `Math.min(payload.limit || 10, 500)`).
- **Why**: An authenticated admin can pass `limit: 999999` and dump the entire `product_addon` table in a single response, wasting DB resources. The same uncapped pattern appears in several other admin list endpoints.
- **When**: Next quarter
- **Where**: `controllers/product-addon.js`, line 170

## Open questions

1. **Is the `product_addon` table used by the motor flow at all?** No controller in `controllers/motor-*.js` or service in `services/insurers/` reads from `product_addon`. The Digit mapper resolves add-on selections from proposal payload fields directly. It is unclear whether the table is intended to gate available add-ons in the front-end quote UI, to drive future server-side validation, or is currently inert (as `product-configs` appears to be). A maintainer should confirm the intended consumer.

2. **Does `insurer_addon_code` map to the Digit API field names?** The Digit mapper uses hard-coded field names (`partsDepreciation`, `engineProtection`, etc.). If `insurer_addon_code` is meant to be the canonical bridge between internal add-on IDs and insurer API field names, there is no code path that currently reads it.
