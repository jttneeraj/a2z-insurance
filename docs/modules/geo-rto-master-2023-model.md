# Geo RTO Master 2023 Model

## What this module does
This module provides the data layer for the `geo_rto_master_2023` database table, which stores Regional Transport Office (RTO) codes and their associated city names as of the 2023 dataset. It exposes a single lookup method that checks whether a given RTO code exists in the master list. RTO codes are alphanumeric identifiers assigned to local vehicle registration authorities across India.

## Why this module exists
When a customer submits a motor insurance quote request, the system must confirm that the RTO code they provide (which determines the vehicle's registration zone) is a recognised, active code. This module is the authoritative source for that validation. It was introduced as a 2023 refresh of the older `rto-master` table — the earlier table (`rto_master`) is superseded but still has its own model file (`models/mysqldb/rto-master.js`) for backward compatibility.

## When this module runs / is used
- **On every motor quote validation call**: `services/motor-quote-master-validation.js` calls `findByQuery({ rto_code })` to check that the RTO code in a quote request payload is valid before the quote is generated.
- **During master data imports**: The admin `pin_code_and_rto_master_2023` import job (triggered via `POST /api/admin/master-import`) reads the "RTO MASTER" sheet from the Excel file "Pin Code and RTO Master_2023.xlsx" and bulk-upserts rows into `geo_rto_master_2023`.

## How it fits in
- **Depends on**: `shared-library` (`MysqlGeoRtoMaster2023Model` base class, Sequelize ORM binding, and DB connection pool).
- **Used by**: `services/motor-quote-master-validation.js` (RTO code validation in `validateMotorQuoteMasters`).
- **Populated by**: `controllers/import-master.js` via the `pin_code_and_rto_master_2023` master-type import config.

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/geo-rto-master-2023.js` | Defines `GeoRtoMaster2023Model`, extends the shared-library base, adds `findByQuery`, and exports a singleton instance. |
| `services/motor-quote-master-validation.js` | Primary consumer; calls `findByQuery({ rto_code })` to validate quote inputs. |
| `controllers/import-master.js` (lines ~171–198) | Declares the `pin_code_and_rto_master_2023` import config that maps Excel columns to `geo_rto_master_2023` table columns. |

## Optimization opportunities

- **What**: Cache `findByQuery` results in Redis (using `rto_code` as the key) with a long TTL (e.g. 24 hours).
  **Why**: RTO master data changes only when the admin re-imports from Excel, yet the lookup is called on every quote request, which is the hottest path in the system. A cache hit avoids a database round-trip for a purely read-only reference table.
  **When**: Next quarter.
  **Where**: `models/mysqldb/geo-rto-master-2023.js` line 11–14 (`findByQuery` method), using `lib/redis.js`.

- **What**: Remove the dead private function `validateMotorQuoteMasters_` from `services/motor-quote-master-validation.js` (lines 7–65).
  **Why**: This old function references `MysqlRtoMasterModel`, `MysqlVehicleMasterModel`, `MysqlPreviousPolicyTypeModel`, `MysqlMotorPreviousInsurerModel`, and `MysqlNcbMasterModel` — none of which are imported in that file. It is not exported and is never called. Leaving it in causes reader confusion and would throw `ReferenceError` if accidentally invoked.
  **When**: Now.
  **Where**: `services/motor-quote-master-validation.js` lines 7–65.

- **What**: Add a `findAll` (or `findByCity`) query method to support RTO lookup-by-city in the quote UI (e.g. a dropdown filtered by city).
  **Why**: Currently there is no way to list or filter RTOs from the application layer; any such feature would require raw SQL. Adding a standard method to the model keeps query logic in one place.
  **When**: Nice to have.
  **Where**: `models/mysqldb/geo-rto-master-2023.js`.

## Open questions
- Is `rto-master.js` / the `rto_master` table still used anywhere other than the now-dead `validateMotorQuoteMasters_` function? If not, both the old model file and the old table are candidates for removal.
- The import config for `pin_code_and_rto_master_2023` also populates `geo_pincode_master_2023` in the same Excel job, but there is no corresponding `geo-pincode-master-2023.js` model file in `models/mysqldb/`. Is that table accessed only via raw SQL, or is the model missing from the repository?
