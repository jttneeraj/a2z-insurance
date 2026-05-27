# Motor Previous Insurer Model

## What this module does

This module defines a thin data-access wrapper around the `motor_previous_insurer` database table, which is intended to store records of the insurance company that previously held a motor policy. It inherits from `MysqlMotorPreviousInsurerModel` in the shared library and exposes a single lookup method, `findByQuery`, for fetching a record by arbitrary field conditions.

## Why this module exists

Motor insurance renewals require knowing who the customer's previous insurer was, so the system can prefill or validate that value during a quote request. This model was originally the application-layer entry point for querying that data. It exists as its own file to follow the project's pattern of wrapping each shared-library model class locally, allowing the app to add custom query methods on top of the base Sequelize model.

## When this module runs / is used

**This module is not imported anywhere in the active codebase.** The model file exists and exports a singleton (`MysqlMotorPreviousInsurerModel`), but no `require` statement anywhere in the application loads it.

The only reference to `MysqlMotorPreviousInsurerModel` by name appears at line 43 of `services/motor-quote-master-validation.js`, inside a function called `validateMotorQuoteMasters_` (note the trailing underscore). That function is never exported and never called, and it does not import this model file — so calling it at runtime would immediately throw a `ReferenceError`.

The active validation path (`validateMotorQuoteMasters`, the exported function in the same file) uses `insurer-previous-insurer-master` instead.

## How it fits in

- **Depends on**: `MysqlMotorPreviousInsurerModel` from the shared library (`excela2zsuvidha/a2z-shared-library`)
- **Depended on by**: Nothing in the active codebase. The only reference is inside dead code in `services/motor-quote-master-validation.js:43`

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/motor-previous-insurer.js` | Defines `MotorPreviousInsurerModel` extending the shared-library base; exports an instantiated singleton as `MysqlMotorPreviousInsurerModel` |

## Optimization opportunities

- **What**: Remove `motor-previous-insurer.js` from the codebase entirely.
  **Why**: The model is not imported by any active code. Keeping it creates the false impression that `motor_previous_insurer` is a live query target, when the application actually queries `insurer_previous_insurer_master` via the `insurer-previous-insurer-master` model. Dead model files add noise to the codebase and mislead new contributors.
  **When**: Now
  **Where**: `models/mysqldb/motor-previous-insurer.js` (entire file)

- **What**: Delete the dead function `validateMotorQuoteMasters_` from `services/motor-quote-master-validation.js`.
  **Why**: The function (lines 7–66) is never exported and never called. If it were somehow invoked, it would throw a `ReferenceError` because five of the models it references (`MysqlRtoMasterModel`, `MysqlVehicleMasterModel`, `MysqlPreviousPolicyTypeModel`, `MysqlMotorPreviousInsurerModel`, `MysqlNcbMasterModel`) are not imported in that file. The exported `validateMotorQuoteMasters` function on lines 68–125 is the correct, actively-used replacement.
  **When**: Now
  **Where**: `services/motor-quote-master-validation.js`, lines 7–66

- **What**: Clarify in `information.md` (or inline comments) whether the `motor_previous_insurer` database table is still in use or can be dropped.
  **Why**: The master-import mapping for `motor_previous_insurer_list` targets `insurer_previous_insurer_master`, not `motor_previous_insurer`. If `motor_previous_insurer` is truly abandoned, the table itself can be removed from the database schema to avoid confusion. If it still stores customer-facing transaction data (separate from the master lookup), that purpose is not visible anywhere in the application code.
  **When**: Next quarter
  **Where**: `information.md`, `work_info.md`, and the shared-library `database-tables.sql`

## Open questions

- Does the `motor_previous_insurer` database table still exist in production? If so, does it hold any live data, or is it a historical artifact that can be dropped?
- Was `validateMotorQuoteMasters_` intentionally left in place as a migration reference (to show the old validation logic), or was it simply forgotten when the function was refactored to use insurer-specific master tables?
- The `motor_previous_insurer_list` master-import type writes to `insurer_previous_insurer_master`, not `motor_previous_insurer`. Is the `motor_previous_insurer` table ever populated at all in the current flow?
