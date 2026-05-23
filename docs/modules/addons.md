# Addons

## What this module does

The `addons` module manages the catalog of named optional policy enhancements — things like Zero Depreciation, Engine Protection, and Roadside Assistance — that can be attached to insurance products. Each add-on has a unique code, a human-readable name, an optional description, and an active/inactive flag. This table is the source-of-truth list of add-on *types*; a separate module (`product-addons`) maps these generic types to the specific insurer codes used when communicating with insurance providers.

## Why this module exists

Keeping a vendor-neutral add-on catalog in its own table lets the system define each add-on once and reuse it across multiple insurers and products. Rather than hard-coding add-on names in every insurer integration, the `product-addons` mapping table references `addon_id` from this catalog and pairs it with an insurer-specific code (`insurer_addon_code`). The catalog also provides a stable FK anchor so that the product hierarchy (Insurance Type → Insurance Product → Insurer Product → Product Config → **Product Add-on Mapping**) remains internally consistent.

## When this module runs / is used

All entry points are admin-only, reachable via `POST /userdata`-authenticated requests to `/api/admin/addons/*`:

- **`POST /api/admin/addons/add`** — called when an admin creates a new add-on type (e.g. "Zero Depreciation / ZERO_DEP").
- **`POST /api/admin/addons/list`** — called when the admin UI fetches the paginated add-on catalog, with optional `search`, `is_active`, `start`, and `limit` filters.
- **`GET /api/admin/addons/:id`** — called when an admin views a single add-on's detail page.
- **`PUT /api/admin/addons/update/:id`** — called when an admin edits an add-on's name, code, or description.
- **`PATCH /api/admin/addons/status/:id`** — called when an admin toggles an add-on active or inactive.

No motor-flow (customer-facing) code reads from the `addons` table at runtime; the table is consumed only by `product-addons` during admin configuration and as an FK validation target when linking add-ons to insurer products.

## How it fits in

| Direction | Module | Relationship |
|-----------|--------|--------------|
| Depends on | `shared-library` (`MysqlAddonsModel`) | Provides the Sequelize model base class and DB connection |
| Depends on | `services/common` (`CommonService`) | Used in the `add` handler's catch block for structured error logging |
| Depended on by | `product-addons` | `controllers/product-addon.js` fetches `addon_id` by FK to validate that the referenced add-on exists before creating a mapping row |

## Key files

| File | Purpose |
|------|---------|
| `routes/addons.js` | Declares the five Express routes (`add`, `list`, `detail`, `update`, `updateStatus`) and maps them to controller functions |
| `controllers/addon.js` | Implements all five request handlers; contains OpenAPI JSDoc annotations used to generate Swagger UI |
| `models/mysqldb/addon.js` | Extends the shared-library `MysqlAddonsModel` with `add`, `update`, `find`, `findAllCount`, `findById`, and `findByQuery` methods; exports a pre-instantiated singleton |

## Optimization opportunities

### 1. `updateStatus` silently succeeds for non-existent IDs
- **What**: Add an existence check (fetch by ID) before calling `MysqlAddonsModel.update()` in `updateStatus`, and return 404 if the record is not found.
- **Why**: Sequelize's `update()` with a WHERE clause on a non-existent ID returns `[0]` (zero rows changed) without throwing; the current code interprets that as success and returns `200 OK`. A caller deactivating add-on ID 9999 gets no indication the operation was a no-op.
- **When**: Now
- **Where**: `controllers/addon.js:460-478`

### 2. `update` does not guard against duplicate `code` collisions
- **What**: Before applying the DB update in `update`, check whether another add-on already holds the new `code` value and return 400 if it does.
- **Why**: `add` correctly checks for duplicate codes (lines 81-91), but `update` skips that guard entirely. Renaming an add-on to a code that already exists produces an opaque 500 from the DB unique constraint instead of a descriptive 400.
- **When**: Now
- **Where**: `controllers/addon.js:371-406`

### 3. `update` silently wipes `description` when the field is omitted
- **What**: Change line 389 from `description: payload.description || null` to `description: payload.description !== undefined ? payload.description : existing.description`.
- **Why**: A caller passing only `name` and `code` to update an add-on's label will inadvertently erase the existing description. The existing record is already fetched (lines 375-382), so `existing.description` is available at no extra cost.
- **When**: Now
- **Where**: `controllers/addon.js:389`

### 4. No input validation for required fields `name` and `code`
- **What**: Add explicit checks that `payload.name` and `payload.code` are non-empty strings before hitting the DB in both `add` and `update`.
- **Why**: Missing values pass through to the DB constraint, producing a 500 instead of an informative 400. The OpenAPI spec marks both fields as required, but that is not enforced in code.
- **When**: Now
- **Where**: `controllers/addon.js:78-122` (`add`), `371-406` (`update`)

### 5. Inconsistent error handling across handlers
- **What**: Replace bare `console.log(error)` catch blocks in `list`, `detail`, `update`, and `updateStatus` with `CommonService.errorHandler(...)` calls, matching the pattern already used in `add`.
- **Why**: Four of the five handlers silently swallow structured error context (URL, operation, relative detail) that Winston and downstream monitoring need. The `add` handler already does it correctly; the others were not updated consistently.
- **When**: Next quarter
- **Where**: `controllers/addon.js:216-223`, `301-308`, `398-405`, `471-477`

### 6. JSDoc path mismatch breaks Swagger "Try it out" for `updateStatus`
- **What**: Update the OpenAPI annotation for `updateStatus` to match the actual registered route, either by changing the JSDoc path from `/admin/addons/update-status/{id}` to `/admin/addons/status/{id}`, or by renaming the route in `routes/addons.js` to `/update-status/:id`.
- **Why**: The JSDoc documents `/admin/addons/update-status/{id}` (line 411) but the route is `PATCH /status/:id` (routes/addons.js line 13), making the Swagger UI "Try it out" button send requests to a non-existent path.
- **When**: Next quarter
- **Where**: `routes/addons.js:13`, `controllers/addon.js:411`

### 7. Raw response objects bypass the shared `ResponseHandler` envelope
- **What**: Import and use `ResponseHandler` from `utils/response-handler.js` for all five handlers instead of the inline `res.status().json({ error, status, message })` pattern.
- **Why**: Customer-facing controllers use `ResponseHandler` with i18n-keyed messages. The admin controllers using raw JSON objects create an inconsistent API response shape and bypass the i18n layer.
- **When**: Nice to have
- **Where**: `controllers/addon.js` (all five handlers)

### 8. No upper bound on `limit` parameter in `list`
- **What**: Cap `limit` at a reasonable maximum (e.g. 100) in the `list` handler.
- **Why**: An authenticated admin can pass `limit: 999999` to dump the entire table in one response. The add-on catalog is currently small, so this is low risk, but adding a cap is a cheap defensive measure consistent with best practice.
- **When**: Nice to have
- **Where**: `controllers/addon.js:186`

### 9. Dead `QueryTypes` import in model file
- **What**: Remove the unused `QueryTypes` import from line 1 of `models/mysqldb/addon.js`.
- **Why**: `QueryTypes` is required from Sequelize but never referenced in the file — copy-paste residue that adds noise.
- **When**: Nice to have
- **Where**: `models/mysqldb/addon.js:1`

## Open questions

- **Is the add-on catalog ever surfaced to customers?** No motor-flow controller reads from the `addons` table at runtime. Is there a planned feature to show add-on names and descriptions to end users during quote or proposal selection, or does this catalog permanently serve only admin configuration?
- **`insurer_addon_age_limit_master` uses `addon_name` (a string) rather than `addon_id` (a FK).** The master-import controller (`controllers/import-master.js:238`) identifies the uniqueness key as `insurer_id + addon_name`. Is that intentional — insurer-specific add-on naming independent of the catalog — or should it eventually reference the canonical `addons` table by ID?
