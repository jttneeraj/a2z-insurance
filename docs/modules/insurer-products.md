# Insurer Products

## What this module does

This module manages the mapping between insurers (companies like ICICI Lombard or HDFC ERGO) and insurance products (categories like "Comprehensive Car Insurance"). Each record in this table says: "Insurer X offers Product Y, and here is the code that insurer uses to identify it." It also tracks whether that product is currently enabled for quoting and for policy issuance by that insurer.

## Why this module exists

Different insurers sell different products under their own internal names and codes. The `insurer_product` table is the join table that connects the generic product catalog (`insurance_products`) to the insurer registry (`insurers`). Without it the system would have no way to know which insurers to call when generating quotes for a specific product, or what product code to send in the API request to each insurer. It sits at the third level of the product hierarchy: Insurance Type → Insurance Product → **Insurer Product** → Product Config / Add-ons → Quote.

## When this module runs / is used

- **Admin configuration**: Called by admin users via the `/api/admin/insurer-products` endpoints to set up and maintain insurer–product mappings (add, list, view, update, activate/deactivate).
- **Quote and config validation**: When an admin creates a product configuration (`/api/admin/product-configs/add`) or product add-on mapping (`/api/admin/product-addons/add`), both those controllers call `MysqlInsurerProductsModel.findById(insurer_product_id)` to confirm the referenced insurer-product mapping actually exists before proceeding.

## How it fits in

**Depends on:**
- `insurers` module — `add` validates that the provided `insurer_id` resolves to a real insurer record.
- `insurance-products` module — `add` validates that the provided `product_id` resolves to a real insurance product record.
- `shared-library` (`MysqlInsurerProductsModel`) — provides the base Sequelize model bound to the `insurer_products` table.

**Depended on by:**
- `product-configs` module — validates `insurer_product_id` before creating a product configuration row.
- `product-addons` module — validates `insurer_product_id` before creating an add-on mapping row.

## Key files

| File | Purpose |
|---|---|
| `routes/insurer-products.js` | Declares the five HTTP routes and wires them to the controller. |
| `controllers/insurer-products.js` | Implements `add`, `list`, `detail`, `update`, and `updateStatus`; includes OpenAPI JSDoc annotations. |
| `models/mysqldb/insurer-product.js` | Thin subclass of the shared-library base model; adds `add`, `update`, `find`, `findById`, `findByQuery`, and `findAllCount` methods using Sequelize ORM. |

## Optimization opportunities

### 1. `updateStatus` has no existence check — silent 200 on a missing ID
- **What**: Add a `findById` guard in `updateStatus` before calling `update`, and return 404 if the record does not exist.
- **Why**: The current code returns `200 OK` for any `id`, including one that does not exist, giving callers no signal that the operation had no effect. The `update` handler already performs this check correctly; `updateStatus` should match it.
- **When**: Now
- **Where**: `controllers/insurer-products.js`, lines 540–558

### 2. `update` does not re-validate the new `insurer_id` and `product_id`
- **What**: After the existence check in `update`, validate that the incoming `insurer_id` and `product_id` both reference real records (the same way `add` does at lines 107–127).
- **Why**: A typo in either FK field will silently write an orphaned reference to the database, breaking downstream quote and policy flows that rely on the join being valid.
- **When**: Now
- **Where**: `controllers/insurer-products.js`, lines 440–486

### 3. `update` does not check for duplicate `(insurer_id, product_id)` combination
- **What**: Before applying the update, check whether another row already has the same `(insurer_id, product_id)` pair (excluding the current record's ID), and return a 400 if so.
- **Why**: `add` guards against duplicate mappings (lines 129–140), but `update` does not. Changing an existing mapping to match another existing one causes an opaque DB constraint error (500) rather than a clear 400.
- **When**: Now
- **Where**: `controllers/insurer-products.js`, lines 440–486

### 4. `add` does not validate that `insurer_product_code` is present
- **What**: Add an explicit check that `payload.insurer_product_code` is non-empty before hitting the database.
- **Why**: The field is marked `required` in the OpenAPI schema and has a NOT NULL constraint in the database. Without the check, a missing value produces an opaque 500 from the DB rather than a proper 400 with a helpful message.
- **When**: Now
- **Where**: `controllers/insurer-products.js`, lines 103–174

### 5. Unused imports in controller and model
- **What**: Remove `moment`, `Sequelize`, and `Op` from the top of the controller; remove `QueryTypes` from the model. None are referenced anywhere in the files.
- **Why**: These are dead code imported on every request, adding noise and slowing module load. They appear in every admin controller as copy-paste residue.
- **When**: Nice to have
- **Where**: `controllers/insurer-products.js` lines 1–2; `models/mysqldb/insurer-product.js` line 1

### 6. `ResponseHandler` imported but bypassed
- **What**: Replace all five raw `res.status().json({...})` calls with `ResponseHandler.success`, `ResponseHandler.failure`, etc., using i18n message keys.
- **Why**: The rest of the application (motor flow, admin controllers that use `CommonService`) routes responses through `ResponseHandler` to ensure consistent JSON shape and i18n message resolution. This module breaks that contract, making its responses inconsistent with the API's documented envelope.
- **When**: Next quarter
- **Where**: `controllers/insurer-products.js` line 12 (import exists), all five handlers

### 7. All catch blocks use `console.log` instead of structured logging
- **What**: Replace `console.log(error)` in every catch block with a structured Winston log call (matching the `{ url, function, operation, relativeDetail, err, errorObj }` pattern used elsewhere in the app).
- **Why**: `console.log` output is invisible to the production log-monitoring pipeline (Winston's HTTP transport). Errors in this controller currently leave no trace in aggregated logs.
- **When**: Next quarter
- **Where**: `controllers/insurer-products.js` lines 167, 276, 361, 479, 552

### 8. No upper-bound cap on `list` page size
- **What**: Add a `Math.min(limit, 100)` (or similar) guard when reading the `limit` parameter.
- **Why**: A caller can pass `limit: 999999` and force a full-table dump in a single response, which is both slow and a data-exposure risk. The default of 10 is sensible; the absence of a ceiling is not.
- **When**: Next quarter
- **Where**: `controllers/insurer-products.js` line 242

## Open questions

- **`insurer_product_code` vs `api_product_code`**: The table stores two code fields. The distinction is not documented anywhere in the codebase or comments — is `insurer_product_code` a human-readable label while `api_product_code` is the literal string sent in API requests to the insurer? Clarifying this in the model's column comments would help.
- **`is_quote_enabled` vs `is_active`**: `is_active` toggles the mapping on/off globally, but `is_quote_enabled` and `is_policy_enabled` provide finer-grained control. The insurer factory and quote service do not appear to read these flags at runtime — is enforcement actually happening, or are these fields informational only?
