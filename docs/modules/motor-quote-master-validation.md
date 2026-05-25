# Motor Quote Master Validation

## What this module does

This module validates that the lookup codes submitted in a motor quote request (RTO code, vehicle code, previous policy type, previous insurer, and NCB percentage) actually exist in the corresponding master-data tables before a quote request is persisted. It returns a structured result with an `is_valid` flag and an array of human-readable error messages.

## Why this module exists

The motor quote request fan-out creates multiple database rows in a single transaction. If a submitted code is invalid (e.g. a stale RTO code or a misspelled vehicle code), the transaction would either silently store bad data or fail deep inside insurer-facing code where the error is harder to diagnose. This pre-flight check catches referential errors at the API boundary, before any writes happen, and returns a clear 400 response to the caller.

## When this module runs / is used

Called once per incoming `POST /api/customer/motor/quote-request` request, immediately after the customer lead is confirmed to exist and before the quote-request database transaction is opened (`controllers/motor-quote-request.js:291`). It is not called anywhere else in the codebase.

## How it fits in

- **Depends on**: `models/mysqldb/geo-rto-master-2023`, `models/mysqldb/insurer-vehicle-master`, `models/mysqldb/insurer-previous-policy-type-master`, `models/mysqldb/insurer-previous-insurer-master`, `models/mysqldb/insurer-ncb-master`
- **Used by**: `controllers/motor-quote-request.js` — the only caller

## Key files

| File | Purpose |
|------|---------|
| `services/motor-quote-master-validation.js` | Single-file module. Exports `validateMotorQuoteMasters`. Contains one active function and one dead legacy function (see Optimization opportunities). |

## Optimization opportunities

- **What**: Remove the dead `validateMotorQuoteMasters_` function (lines 7–66).
  - **Why**: This function is never exported and never called. It references five model variables (`MysqlRtoMasterModel`, `MysqlVehicleMasterModel`, `MysqlPreviousPolicyTypeModel`, `MysqlMotorPreviousInsurerModel`, `MysqlNcbMasterModel`) that are not imported and do not exist in scope — calling it would throw a `ReferenceError` at runtime. The active replacement `validateMotorQuoteMasters` (lines 68–125) uses the correct insurer-specific master models and is already in use. The dead function is pure noise and a trap for the next developer who reads this file.
  - **When**: Now
  - **Where**: `services/motor-quote-master-validation.js:7–66`

- **What**: Run all five master-table lookups in parallel using `Promise.all` instead of sequentially.
  - **Why**: Each of the five `findByQuery` calls is an independent database query; they are currently `await`ed one at a time, so a slow DB round-trip multiplies five-fold. Wrapping them in `Promise.all` reduces wall-clock time to a single round-trip (the slowest of the five). This matters on every quote-request submission.
  - **When**: Next quarter
  - **Where**: `services/motor-quote-master-validation.js:68–125`

- **What**: Replace `findOne` (full row fetch) with an existence-only query (e.g. `SELECT 1 … LIMIT 1` or a `count` query) in each validation check.
  - **Why**: The function only needs to know whether a matching row exists; it discards the returned record immediately. Fetching the full row wastes bandwidth and MySQL deserialization time on every validation. Each model's `findByQuery` wraps `model.findOne(...)` which returns the entire ORM instance. A lean `exists` helper on each model would be more efficient.
  - **When**: Nice to have
  - **Where**: All five `findByQuery` calls in `services/motor-quote-master-validation.js:72–118`

- **What**: Add at least one unit test covering the happy path and one covering each invalid-code branch.
  - **Why**: There are zero tests for this module. The dead-function bug (referencing undeclared model variables) would have been caught immediately by even a smoke-level test. Validation logic is high-value to test: a regression here silently accepts bad quote data or incorrectly rejects valid requests.
  - **When**: Next quarter
  - **Where**: No existing test file; create `tests/services/motor-quote-master-validation.spec.js`

## Open questions

- The dead `validateMotorQuoteMasters_` function uses generic master tables (`rto_master`, `vehicle_master`, `previous_policy_type`, etc.) while the active function uses insurer-specific tables (`geo_rto_master_2023`, `insurer_vehicle_master`, etc.). Was the migration to insurer-specific tables deliberate and complete, or are the generic tables still in use elsewhere and still kept in sync? If the generic tables are no longer authoritative, they may be candidates for deprecation.
- All five validation checks are guarded by `if (payload.<field>)` — meaning fields are only validated when present. Is it intentional that a quote request with no `rto_code`, `vehicle_code`, etc. passes validation silently? Or should some of these fields be required?
