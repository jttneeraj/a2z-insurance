# RTO Master Model

## What this module does

This module defines the application-side model class for the `rto_master` database table, which holds Regional Transport Office (RTO) reference data — codes and names of RTOs across India. The model wraps the base class from the shared library and adds a single `findByQuery` helper for looking up an RTO record by arbitrary column conditions.

## Why this module exists

RTO codes are a mandatory field in motor insurance quote requests, so the platform needs a way to validate that a submitted RTO code actually exists. This model provides that lookup. It lives as a standalone model file — following the project's one-file-per-table convention — so controllers and services can import it independently without coupling to unrelated models.

> **Note:** The newer `geo_rto_master_2023` table (served by `models/mysqldb/geo-rto-master-2023.js`) is now used for all active RTO validation in the live quote flow. The `rto_master` table appears to be a first-generation table superseded by the 2023 geo-enriched master. See "Open questions" below.

## When this module runs / is used

This module is **not currently imported anywhere in the active codebase**. The sole reference to `MysqlRtoMasterModel` in `services/motor-quote-master-validation.js` is inside a dead function (`validateMotorQuoteMasters_`, private by naming convention) that is neither exported nor called; critically, the file does not even import this model. In practice, no running code exercises this module.

## How it fits in

**Depends on:**
- `shared-library` (via `process.env.SHARED_LIBRARY_PATH`) — provides the base `MysqlRtoMasterModel` class and Sequelize ORM setup.

**Depended on by:**
- Nothing in the current codebase. The module is orphaned (no `require('./rto-master')` exists anywhere).

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/rto-master.js` | Defines `RtoMasterModel` extending the shared-library base; exports an instantiated singleton under `MysqlRtoMasterModel`. |

## Optimization opportunities

- **What:** Remove or clearly mark this model as deprecated — no active code imports it, and `geo-rto-master-2023.js` is the live replacement.
  - **Why:** Dead code adds maintenance overhead and confuses new developers who may not know which RTO model to use.
  - **When:** Now
  - **Where:** `models/mysqldb/rto-master.js` (entire file), `services/motor-quote-master-validation.js` lines 8–18 (dead `validateMotorQuoteMasters_` function)

- **What:** If the `rto_master` table is still populated and useful, expose it via a named admin endpoint (e.g. GET `/api/admin/rto-master`) to allow browsing/searching RTOs, mirroring how other master tables are served.
  - **Why:** Without a route, the data cannot be surfaced to the frontend or validated via API — the geo-2023 model already fills this role, but having clarity on the canonical source prevents future duplication.
  - **When:** Next quarter
  - **Where:** New route and controller files, mirroring e.g. `routes/insurers.js` / `controllers/insurers.js`

- **What:** Align `findByQuery` signature across `rto-master.js` and `geo-rto-master-2023.js` — both are identical one-liners that wrap `findOne({where: conditions})`; extract this into the shared-library base class so local overrides are unnecessary.
  - **Why:** Reduces copy-paste across every master model file; a single base-class method would be inherited automatically.
  - **When:** Nice to have
  - **Where:** Shared library `services/models` base class (external repo); then all `models/mysqldb/*.js` files that repeat the same pattern can be simplified.

## Open questions

- **Is `rto_master` still populated?** If the table is empty, the model can be deleted outright. If it still holds useful data (e.g. a shorter legacy code set used by older insurer integrations), it should be explicitly documented and either wired in or migrated into `geo_rto_master_2023`.
- **What triggers the `integration_rto_master` table?** `controllers/import-master.js` line 408 writes to `integration_rto_master` (a separate table in the `api_integration_all_master` import). It is unclear whether `rto_master` and `integration_rto_master` share any data or purpose.
- **Can `validateMotorQuoteMasters_` be deleted?** It references `MysqlRtoMasterModel`, `MysqlVehicleMasterModel`, and `MysqlPreviousPolicyTypeModel`, none of which are imported in the file. It is a dead function — confirmation from the team that it was intentionally superseded would allow safe deletion.
