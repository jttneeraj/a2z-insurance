# Insurer Vehicle Master Model

## What this module does

This module provides the database access layer for the `insurer_vehicle_master` table, which stores each insurance company's internal vehicle catalog. Each row maps an insurer-specific `vehicle_code` to human-readable attributes like make, model, variant name, engine specs, body type, seating capacity, fuel type, and pricing information. The module exposes a single `findByQuery` method for looking up a vehicle record by arbitrary conditions.

## Why this module exists

Insurance companies do not share a common vehicle code standard — the same physical car model carries a different code at Digit, HDFC ERGO, ICICI, and so on. This table is the per-insurer translation layer: it stores the codes as each insurer defines them, so the system can validate that an incoming `vehicle_code` is recognized and can pass the correct code when calling an insurer's API. Without this table, the system would have no way to verify user-supplied vehicle identifiers or build well-formed API requests.

## When this module runs / is used

- **Quote validation**: Called by `services/motor-quote-master-validation.js` (`validateMotorQuoteMasters`, line 82) whenever a motor quote request payload contains a `vehicle_code`. The lookup confirms the code exists in the master before allowing the quote to proceed.
- **Digit API requests**: `services/insurers/digit/digit.mapper.js` (`buildVehicle`, line 383) reads `vehicle_code` from the saved quote vehicle detail row. That value (sourced originally from this table) becomes the `vehicleMaincode` field sent to Digit's quote and proposal APIs.
- **Master data import**: `controllers/import-master.js` populates this table when an admin uploads a `vehicle_master` Excel file via the master-import endpoint. Rows are bulk-inserted with `ON DUPLICATE KEY UPDATE` keyed on `(insurer_id, vehicle_code)`.

## How it fits in

- **Depends on**: `shared-library` — `MysqlInsurerVehicleMasterModel` base class (Sequelize model definition, table schema, connection) provided by the private GitHub package `excela2zsuvidha/a2z-shared-library`.
- **Used by**:
  - `services/motor-quote-master-validation.js` — validates `vehicle_code` in quote requests
  - `controllers/import-master.js` — bulk-loads data into the table from Excel files
  - `services/insurers/digit/digit.mapper.js` — reads `vehicle_code` (stored upstream from this table) when building Digit API payloads

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/insurer-vehicle-master.js` | The model: extends the shared-library base class, adds `findByQuery(conditions)` for single-record lookups, exports a singleton instance. |
| `controllers/import-master.js` (lines 38–80) | Import configuration: defines the Excel column-to-DB-column mapping (including the alternate `"Maincode"` header), unique key set `(insurer_id, vehicle_code)`, and default `is_active: 1`. |
| `services/motor-quote-master-validation.js` (lines 82–88) | Primary consumer: calls `findByQuery({ vehicle_code })` to validate quote inputs. |
| `services/insurers/digit/digit.mapper.js` (lines 380–396) | Downstream consumer: reads the vehicle code stored from this table to satisfy Digit's `vehicleMaincode` field. |

## Optimization opportunities

- **What**: Add `insurer_id` to the `findByQuery` call in `motor-quote-master-validation.js`.
  **Why**: The current lookup passes only `{ vehicle_code }`, ignoring `insurer_id`. If two insurers share a `vehicle_code` string (unlikely but possible), the validation passes regardless of which insurer is being quoted. Adding the insurer context makes the check genuinely per-insurer and prevents silent cross-insurer mismatches.
  **When**: Next quarter
  **Where**: `services/motor-quote-master-validation.js` line 82–84

- **What**: Remove the unused `mysqldb` re-export from the module's export object.
  **Why**: Every model file in this codebase exports `{ mysqldb, MysqlXxxModel }`, but none of the consumers of this specific model (`motor-quote-master-validation.js`, etc.) import `mysqldb` from it — they get the DB connection directly from the shared library. The dangling export is noise that can mislead readers into thinking there is a separate connection object here.
  **When**: Nice to have
  **Where**: `models/mysqldb/insurer-vehicle-master.js` line 19

- **What**: Add a database index on `vehicle_code` (and ideally the composite `(insurer_id, vehicle_code)`) if not already present in the shared-library schema.
  **Why**: Quote validation runs this lookup on every motor quote request. Without an index on `vehicle_code`, the query performs a full table scan against what can be a very large vehicle catalog (thousands of rows per insurer). The composite index would also align with the import uniqueness constraint.
  **When**: Next quarter
  **Where**: `node_modules/shared-library/database-tables.sql` (schema lives in shared-library; change must be proposed there)

- **What**: Add at least one integration-level test that exercises `findByQuery` with both a valid and an unknown `vehicle_code`.
  **Why**: There are currently no tests for this model or its only query method. A regression in the shared-library base class (e.g. a column rename) would silently break quote validation with no test signal.
  **When**: Next quarter
  **Where**: `tests/api/routes/` (mirror the pattern of other model tests in the suite)

## Open questions

- Does the shared-library schema define indexes on `vehicle_code` or `(insurer_id, vehicle_code)` for `insurer_vehicle_master`? The shared-library package is not installed in this environment, so the full DDL could not be verified.
- The import config references the file name `"Vehicle Master.xlsx"` (line 39 in `import-master.js`), but `information.md` lists it as `"Vehicle Master_New (1).xlsx"`. Which filename does the live system actually accept? The import endpoint uses the config's `fileName` only for documentation/validation — clarify if the name is enforced or informational only.
- Is `vehicle_master` always Digit-specific, or is the same table used for other insurers (e.g. ICICI, HDFC ERGO) when they are integrated? The `insurer_id` column implies it is multi-insurer, but only Digit integration currently reads `vehicle_code`.
