# Insurance Types

## What this module does
The insurance-types module manages the top-level catalog of insurance categories — for example, "Motor Insurance" or "Health Insurance". Each type has a unique short code (e.g. `MOTOR`, `HEALTH`), a human-readable name, an optional description, and an active/inactive status flag. Admins create and manage these records; all other parts of the system reference them by ID.

## Why this module exists
Every insurance product, insurer-product mapping, and customer quote request must be linked to an insurance type. Having a dedicated catalog table (rather than a hard-coded enum) lets the business introduce new insurance categories without a code deployment. It sits at the root of the product hierarchy: Insurance Type → Insurance Product → Insurer Product → Quote.

## When this module runs / is used
- **On every admin call to `/api/admin/insurance-types/*`** — create, list, fetch, update, and toggle status. These are manual admin actions performed when setting up or maintaining the product catalog.
- **On every `/api/admin/insurance-products/add` or `/update` call** — `controllers/insurance-products.js` imports `MysqlInsuranceTypesModel` directly to validate that the supplied `insurance_type_id` actually exists before creating or updating a product.
- **Indirectly on every motor quote request** — `controllers/motor-quote-request.js` requires `insurance_type_id` as a mandatory field when a customer starts the insurance journey.

## How it fits in

**Depends on:**
- `shared-library` — `MysqlInsuranceTypesModel` base class provides the Sequelize model instance and DB connection (resolved at runtime via `SHARED_LIBRARY_PATH`).
- `services/common.js` — `CommonService.errorHandler` is called in the `add` and `list` error paths to write structured stack-trace data to Winston.
- `middlewares/headers.js` — All routes go through `validateHeaders` + `decodeUserData` before reaching any handler; no controller code is needed for auth.

**Consumed by:**
- `controllers/insurance-products.js` — imports `MysqlInsuranceTypesModel` to validate `insurance_type_id` on product create/update.
- `controllers/motor-quote-request.js` — references `insurance_type_id` as a required field in quote request creation.
- `app.js` — mounts this router at `/api/admin/insurance-types` (line 146).

## Key files

| File | Purpose |
|---|---|
| `routes/insurance-types.js` | Express router: maps the five HTTP endpoints to controller functions. |
| `controllers/insurance-types.js` | Handler logic: duplicate-code check on add, pagination + search on list, existence guard on update, direct status toggle. Also contains OpenAPI JSDoc for all five endpoints. |
| `models/mysqldb/insurance-type.js` | Sequelize model wrapper: extends the shared-library base class and adds `findByCodeExceptId` for the update duplicate-check; exports a pre-instantiated singleton. |

## Optimization opportunities

- **What**: Remove the unused `moment` and `Sequelize` imports from `controllers/insurance-types.js` (lines 1–2: `require("moment")` and `const { Sequelize, Op }`).\
  **Why**: `moment` is never called. `Sequelize` (the constructor) is never called either — only `Op` is used (for `Op.or`/`Op.like` in `list`). Dead imports inflate module load time and mislead future readers.\
  **When**: Now\
  **Where**: `controllers/insurance-types.js` lines 1–2

- **What**: Stop importing `ResponseHandler` without using it (line 7 of `controllers/insurance-types.js`). Either remove the import or replace all raw `res.status().json()` calls with `ResponseHandler#success`, `#failure`, and `#error`.\
  **Why**: Every other admin controller that imports `ResponseHandler` uses it to produce i18n-keyed, consistently structured JSON envelopes. This controller bypasses it on all five handlers, producing raw ad-hoc JSON objects that differ in shape from the rest of the API. Clients that rely on a uniform response schema will see inconsistency.\
  **When**: Next quarter\
  **Where**: `controllers/insurance-types.js` lines 7, 90–95, 106–111, 120–124, 214–220, 229–233, 298–304, 306–311, 313–319, 405–409, 421–425, 426–433, 493–497, 499–505

- **What**: Add an existence check in `updateStatus` before applying the DB update.\
  **Why**: `updateStatus` (lines 488–506) calls `MysqlInsuranceTypesModel.update()` on any ID without first verifying the record exists. If the ID is wrong, Sequelize returns `[0]` (zero rows affected) but the handler still responds `200 OK` with "status updated successfully" — a silent no-op that is indistinguishable from success. The `update` handler (line 389) does guard against this. Make `updateStatus` consistent.\
  **When**: Now\
  **Where**: `controllers/insurance-types.js` lines 488–506

- **What**: Add server-side validation for the required `name` and `code` fields in `add` (line 81) and `update` (line 383).\
  **Why**: Both handlers are documented as requiring `name` and `code`, but there is no guard before they reach the DB. A missing `code` causes `findByQuery({ code: undefined })` — which may match unexpected rows — and then a DB-level constraint error surfaces as an opaque `500` instead of a clear `400` validation error. This makes debugging harder and gives API clients no useful error message.\
  **When**: Now\
  **Where**: `controllers/insurance-types.js` lines 81–125 (`add`), lines 383–433 (`update`)

- **What**: Replace the two sequential DB calls in `list` (`findAllCount` then `find`) with a single `findAndCountAll` Sequelize call.\
  **Why**: The `list` handler (lines 204–212) fires two separate SQL queries — one for the total count and one for the page of results. Sequelize's built-in `findAndCountAll` merges them into a single round-trip, halving DB latency on every paginated list request.\
  **When**: Nice to have\
  **Where**: `controllers/insurance-types.js` lines 204–212; `models/mysqldb/insurance-type.js` (add a `findAndCountAll` method)

- **What**: Add `CommonService.errorHandler` calls to the catch blocks in `detail`, `update`, and `updateStatus`.\
  **Why**: The `add` and `list` handlers correctly call `CommonService.errorHandler` in their catch blocks, which enriches log entries with file name, line number, and stack trace before passing them to Winston. The three remaining handlers only do `console.log(error)`, so any exceptions they throw are invisible in the production log pipeline.\
  **When**: Next quarter\
  **Where**: `controllers/insurance-types.js` lines 312–318 (`detail`), lines 426–433 (`update`), lines 499–505 (`updateStatus`)

## Open questions

- **Should `code` be normalised to uppercase before storing?** The OpenAPI example shows `MOTOR` (uppercase), but the `add` handler stores whatever the caller provides. `findByQuery` is case-sensitive by default in MySQL with a `utf8_general_ci` collation, so `motor` and `MOTOR` may or may not be treated as duplicates depending on the DB collation. A clarification from the maintainers (or an explicit `toUpperCase()` on input) would make the intent unambiguous.
- **Is the `list` endpoint intentionally a POST?** Using `POST /list` for a read-only query is unusual and prevents HTTP caching. If there is a historical reason (e.g., large search payloads or consistency with other admin list endpoints), it would be worth documenting.
- **Are there currently any insurance types beyond Motor in production?** The entire customer-facing flow only handles motor insurance. Knowing whether `HEALTH` or others are live informs how safely the catalog can be restructured.
