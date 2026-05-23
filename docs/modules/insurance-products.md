# Insurance Products

## What this module does

The Insurance Products module manages the catalog of insurance product records available on the platform — for example, "Comprehensive Car Insurance" or "Third Party Only". Each product belongs to a parent insurance type (e.g., "Motor Insurance") and is uniquely identified by a short `code` string. Admins can create, list, view, update, and enable/disable products through a five-endpoint REST API.

## Why this module exists

Insurance products are the second level of the product hierarchy: Insurance Type → **Insurance Product** → Insurer Product → Quote. Downstream modules — insurer-products, product-configs, product-addons, and motor-quote-request — all look up a product by ID to validate that a given plan or quote is attached to a real, active product entry. Keeping this catalog in its own module isolates the CRUD surface for product management and lets other modules treat the product table as a stable foreign-key target.

## When this module runs / is used

All five endpoints are admin-only and require a valid `userdata` header (enforced by `middlewares/headers.js`). They are invoked:

- When an admin creates a new product (`POST /api/admin/insurance-products/add`)
- When the admin portal fetches a paginated, filterable product list (`POST /api/admin/insurance-products/list`)
- When the admin portal loads a single product's detail view (`GET /api/admin/insurance-products/:id`)
- When an admin edits product metadata (`PUT /api/admin/insurance-products/update/:id`)
- When an admin activates or deactivates a product (`PATCH /api/admin/insurance-products/status/:id`)

`controllers/insurer-products.js`, `controllers/product-configs.js`, and `controllers/product-addon.js` also call `MysqlInsuranceProductsModel.findById()` directly at write time to validate that a referenced product exists before creating a child record.

## How it fits in

| Direction | Module |
|-----------|--------|
| **Depends on** | `models/mysqldb/insurance-type.js` — validates that a given `insurance_type_id` exists before creating a product |
| **Depends on** | `shared-library` — `MysqlInsuranceProductsModel` base class, DB connection (`mysqldb`) |
| **Depends on** | `middlewares/headers.js` — authentication gate for all endpoints |
| **Depended on by** | `controllers/insurer-products.js` — validates product ID when mapping an insurer to a product |
| **Depended on by** | `controllers/product-configs.js` — validates product ID when creating a plan config |
| **Depended on by** | `controllers/product-addon.js` — validates product ID when attaching an add-on to a product |
| **Depended on by** | `routes/insurance copy.js` — legacy snapshot that wired these endpoints under `/insurance-products/*`; not currently mounted |

## Key files

| File | Purpose |
|------|---------|
| `routes/insurance-products.js` | Declares the five Express routes and connects them to controller handlers |
| `controllers/insurance-products.js` | Implements `add`, `list`, `detail`, `update`, `updateStatus`; contains OpenAPI JSDoc annotations for Swagger UI |
| `models/mysqldb/insurance-product.js` | Extends the shared-library base model to add `add`, `update`, `find`, `findAllCount`, `findById`, and `findByQuery` methods |

## Optimization opportunities

### 1. `updateStatus` silently succeeds for non-existent IDs
- **What**: Add an existence check (call `findById`) before applying the status update, and return `404` if no record is found.
- **Why**: Sequelize's `model.update()` returns `[0, []]` when no rows match. The handler ignores that result and returns `200 OK`, so the caller has no way to detect a typo in the ID.
- **When**: Now
- **Where**: `controllers/insurance-products.js` lines 505–524

### 2. `ResponseHandler` imported but never used
- **What**: Replace all five raw `res.status().json()` calls with the appropriate `ResponseHandler` methods (`success`, `failure`, `error`), or remove the import if the team decides to leave the raw pattern here.
- **Why**: Every other controller in the codebase uses `ResponseHandler` to produce i18n-keyed, consistently-shaped responses. The raw pattern means messages from this module are never translated and the response envelope diverges from what the front-end expects.
- **When**: Now
- **Where**: `controllers/insurance-products.js` line 8 (import), lines 102–107, 114–119, 132–137, 140–144, 244–249, 253–257, 323–328, 330–335, 337–341, 421–426, 438–442, 444–449, 511–515, 518–523

### 3. `moment` and `Sequelize` imported but unused
- **What**: Remove `const moment = require("moment")` (line 1) and `const { Sequelize, ... }` — only `Op` from that destructure is actually used.
- **Why**: Dead imports waste memory on every cold-start, mislead future readers into thinking these libraries are needed, and inflate the module's dependency surface.
- **When**: Now
- **Where**: `controllers/insurance-products.js` lines 1–2

### 4. No validation of required fields in `add`
- **What**: Validate that `insurance_type_id`, `name`, and `code` are present in `req.body` before proceeding. Return a `400` with a clear message if any are missing.
- **Why**: Without validation, a caller that omits `code` passes the duplicate-check (`findByQuery({code: undefined})` may return nothing) and then hits the DB with a null value for a NOT NULL column, producing an opaque 500 response instead of a descriptive 400.
- **When**: Now
- **Where**: `controllers/insurance-products.js` line 93 (`add` handler entry)

### 5. `update` does not guard against duplicate `code` on other records
- **What**: Before applying the update, check whether any *other* record already has the same `code` (i.e., `findByQuery({code: payload.code})` where `id != req.params.id`). Return a `400` if a collision is found.
- **Why**: The `add` handler correctly blocks duplicate codes, but `update` skips this check. Updating product A to use product B's code triggers a DB unique-constraint error, producing an unhelpful 500.
- **When**: Now
- **Where**: `controllers/insurance-products.js` lines 412–451 (`update` handler)

### 6. `list` has no upper bound on `limit`
- **What**: Cap the `limit` value to a reasonable maximum (e.g., 100 or 200) in the `list` handler.
- **Why**: A caller can pass `limit: 1000000`, which causes Sequelize to issue a `SELECT ... LIMIT 1000000` against the DB, potentially returning the entire table in a single response and exhausting memory on both the DB and the app server.
- **When**: Next quarter
- **Where**: `controllers/insurance-products.js` line 214 (`list` handler, `limit` assignment)

### 7. All error handlers use `console.log` instead of structured Winston logging
- **What**: Replace `console.log(error)` in all five catch blocks with the structured Winston `logger.error(...)` call that includes metadata fields (`url`, `function`, `operation`, `relativeDetail`, `err`, `errorObj`).
- **Why**: Errors from this module bypass the log-aggregation pipeline (daily-rotated files, HTTP transport). They appear on stdout only, making post-mortem investigation difficult.
- **When**: Next quarter
- **Where**: `controllers/insurance-products.js` lines 139, 252, 338, 444, 519

### 8. `Op` operator used in controller layer instead of model layer
- **What**: Move the `Op.like` / `Op.or` condition building into a dedicated `search` method on `InsuranceProductsModel` in `models/mysqldb/insurance-product.js`.
- **Why**: The controller imports `Op` from Sequelize directly, coupling a business-logic layer to a DB-library detail. This makes future ORM swaps harder and means the model's `find` method silently accepts arbitrary Sequelize operators from any caller.
- **When**: Nice to have
- **Where**: `controllers/insurance-products.js` line 2 (import), lines 226–231; `models/mysqldb/insurance-product.js` (new method)

### 9. No automated tests
- **What**: Add a Mocha spec under `tests/api/routes/insurance-products/` covering the five endpoints with mocked model calls.
- **Why**: The module has zero test coverage. Regressions in existence-check logic (findings 1 and 5 above) or validation logic (finding 4) would not be caught before deployment.
- **When**: Next quarter

## Open questions

- **Shared-library schema**: The `insurance_product` table definition lives in the shared-library repo (`excela2zsuvidha/a2z-shared-library`). What columns does the table expose beyond `id`, `insurance_type_id`, `name`, `code`, `category`, `description`, and `is_active`? Knowing the full schema would reveal whether any fields are missing from the `add`/`update` payload mappings.
- **`category` field semantics**: The `category` field is documented in the OpenAPI spec as a free-form string (example: `"Motor"`), but `insurance_type_id` already encodes the type. What does `category` add that `insurance_type_id` does not? Is it intended to be a sub-type discriminator or a display label?
- **Product lifecycle / deletion**: None of the five endpoints support hard deletion. Is soft-delete via `is_active = 0` the only intended way to retire a product? What happens to active quotes or policies that reference a product that gets deactivated?
