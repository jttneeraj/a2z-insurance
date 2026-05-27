# Insurer API Credential Model

## What this module does

This module manages a database table of API credentials for each insurance company that the platform integrates with. An admin can store the base URL, client ID, client secret, username, password, and individual endpoint URLs for a given insurer in either a UAT (testing) or PROD (live) environment. The module exposes a CRUD admin API to create, list, retrieve, update, and toggle the active status of these credential records.

## Why this module exists

Different insurers have different API endpoints, authentication schemes, and environment-specific configurations. Centralising these credentials in the database allows an admin to register a new insurer or rotate credentials through a UI rather than requiring a code change or server restart. It also provides a clean separation between the platform's business logic and the authentication details of each third-party insurer.

## When this module runs / is used

All five endpoints are admin-only and are triggered by explicit HTTP requests from the admin dashboard or a back-office tool:

- **POST `/api/admin/insurer-api-credentials/add`** — called when an admin registers API credentials for a new insurer/environment combination.
- **POST `/api/admin/insurer-api-credentials/list`** — called to browse or search the credentials list, with optional filters by insurer, environment, and active status.
- **GET `/api/admin/insurer-api-credentials/:id`** — called to view the full details of a single credential record.
- **PUT `/api/admin/insurer-api-credentials/update/:id`** — called to update any field of an existing credential record.
- **PATCH `/api/admin/insurer-api-credentials/status/:id`** — called to enable (`is_active=1`) or disable (`is_active=0`) a credential without deleting it.

All routes pass through the `validateHeaders` + `decodeUserData` middleware defined in `middlewares/headers.js`.

## How it fits in

**Depends on:**
- `shared-library` — provides the `MysqlInsurerApiCredentialsModel` base class and the Sequelize model definition for the `insurer_api_credentials` table.
- `models/mysqldb/insurer.js` — the `add` handler looks up the insurer record to validate that the supplied `insurer_id` exists before creating a credential.
- `services/common.js` — `CommonService.errorHandler` is called in the `add` handler to log structured error details to Winston.
- `middlewares/headers.js` — enforces the `userdata` header on every request.

**Depended on by:**
- No other module in this codebase currently reads from the `insurer_api_credentials` table at runtime. The Digit insurer adapter (`services/insurers/digit/digit.config.js`) loads its credentials from environment variables, not from this table. The table is populated through the admin API but is not yet consumed by any insurer adapter.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/insurer-api-credential.js` | Thin model class extending the shared-library base; exposes `add`, `update`, `find`, `findById`, `findByQuery`, `findAllCount` against the `insurer_api_credentials` table. |
| `controllers/insurer-api-credential.js` | Five async controller functions (`add`, `list`, `detail`, `update`, `updateStatus`) that handle validation, database calls, and JSON responses. Contains full OpenAPI JSDoc annotations used by Swagger. |
| `routes/insurer-api-credentials.js` | Express router wiring five HTTP verbs/paths to the controller functions; mounted at `/api/admin/insurer-api-credentials` in `app.js`. |

## Optimization opportunities

- **What**: The database table is never read back at runtime — the Digit adapter reads credentials from environment variables in `digit.config.js`, not from this table.
  **Why**: The whole point of the module is to enable dynamic credential management, but as long as adapters bypass the table, adding or changing records in the UI has no effect on live API calls. Either the adapters need to be updated to look up credentials from this table, or the table should be documented as a future-only feature.
  **When**: Now
  **Where**: `services/insurers/digit/digit.config.js` (full file); `models/mysqldb/insurer-api-credential.js`

- **What**: The `list`, `detail`, `update`, and `updateStatus` handlers only call `console.log(error)` on failure instead of routing through `CommonService.errorHandler`.
  **Why**: Errors in these handlers are silently dropped from Winston structured logs and the monitoring HTTP transport, making production incidents very hard to diagnose. Only the `add` handler uses the shared error logger.
  **When**: Now
  **Where**: `controllers/insurer-api-credential.js` lines ~269–276, ~354–360, ~474–480, ~548–554

- **What**: The controller does not use the shared `ResponseHandler` from `utils/response-handler.js` or i18n message keys for any of its response messages.
  **Why**: Every other controller in the codebase returns responses through `ResponseHandler.success` / `ResponseHandler.failure` and looks up strings via `i18n.__()`. This module bypasses both, making it inconsistent and harder to maintain (e.g., changing a response shape or translating messages would need to be done manually here).
  **When**: Next quarter
  **Where**: `controllers/insurer-api-credential.js` (all five handlers)

- **What**: The `updateStatus` handler calls `update` without first checking whether the record with the given `id` exists.
  **Why**: A `PATCH /status/:id` request for a non-existent ID returns HTTP 200 with a success message even though no row was changed. This is misleading and can hide client bugs.
  **When**: Next quarter
  **Where**: `controllers/insurer-api-credential.js` lines 536–554

- **What**: The `update` handler always writes `environment: payload.environment || "UAT"`. If a caller omits `environment` from the update payload, the existing value is silently overwritten with `"UAT"`.
  **Why**: Partial-update semantics (PATCH-style) are expected on a PUT endpoint that accepts any subset of fields. Overwriting a field the caller did not send is a data-integrity risk (e.g., switching a PROD credential to UAT by accident).
  **When**: Next quarter
  **Where**: `controllers/insurer-api-credential.js` line 454

- **What**: The `update` handler does not re-validate that the new `insurer_id` (if changed) references a real insurer record.
  **Why**: The `add` handler performs this check, but `update` skips it, allowing a credential to be orphaned to a non-existent insurer.
  **When**: Nice to have
  **Where**: `controllers/insurer-api-credential.js` lines 438–481

- **What**: Add at least one integration test covering the `add` → `list` → `update` → `updateStatus` lifecycle.
  **Why**: No tests exist for this module. Because the module manages security-sensitive data (API secrets), regressions here carry higher risk than in most CRUD modules.
  **When**: Nice to have
  **Where**: `tests/api/routes/` (new spec file)

## Open questions

- **Is the database credential store intended to replace the env-var approach?** If yes, when is the Digit adapter (and future adapters) expected to be migrated to read from the table? Until that happens the admin UI manages data that has no effect.
- **Are credentials stored in plaintext?** The `client_secret` and `password` fields appear to be stored as plain strings. Should they be encrypted at rest? The shared-library schema definition (not available in this repo) would need to be checked to confirm the column types.
- **Who has access to these admin endpoints?** The middleware validates that a `userdata` header is present, but there is no role check in the controller. It is unclear whether all authenticated users can read and write insurer credentials or whether a higher privilege level is enforced upstream.
