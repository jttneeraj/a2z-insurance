# Vehicle Master Model

## What this module does
This module provides the application's data-access layer for the `vehicle_master` database table, which stores a generic (non-insurer-specific) catalogue of vehicle makes, models, and variants. It wraps a base class supplied by the shared library and adds a single `findByQuery` helper that looks up a vehicle row matching a given set of conditions.

## Why this module exists
Motor insurance quotes require validating that the vehicle the customer describes (make code, model code, variant code) is a recognised vehicle. A dedicated model keeps all database interactions for that table in one place and follows the same pattern used by every other model in the project. The generic `vehicle_master` table was intended to hold canonical vehicle data before insurer-specific variants were introduced.

## When this module runs / is used
In practice the module is currently dormant. The only code that references `MysqlVehicleMasterModel` directly is the private, unexported helper function `validateMotorQuoteMasters_` in `services/motor-quote-master-validation.js`. That function is never called by any active code path. The live, exported validation function (`validateMotorQuoteMasters`) uses the insurer-specific counterpart model (`insurer-vehicle-master`) instead.

## How it fits in

**Depends on:**
- `shared-library` (via `SHARED_LIBRARY_PATH`) — provides the `MysqlVehicleMasterModel` base class and the Sequelize `mysqldb` connection

**Depended on by:**
- `services/motor-quote-master-validation.js` — references `MysqlVehicleMasterModel` in the dead `validateMotorQuoteMasters_` function only; the import statement for this model is missing from that file

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/vehicle-master.js` | Defines `VehicleMasterModel`, adds `findByQuery(conditions)`, and exports a singleton instance as `MysqlVehicleMasterModel` |

## Optimization opportunities

- **What**: Remove the dead `validateMotorQuoteMasters_` function from `services/motor-quote-master-validation.js` (lines 7–66) and with it the implicit reliance on `MysqlVehicleMasterModel`.
  **Why**: The function is never exported, is never called, and contains a `MysqlVehicleMasterModel` reference that lacks a matching `require` statement — calling it would throw a `ReferenceError` at runtime. Deleting it eliminates a latent runtime hazard and removes confusion about which validation function is authoritative.
  **When**: Now
  **Where**: `services/motor-quote-master-validation.js`, lines 7–66

- **What**: Evaluate whether the `vehicle_master` table and this model are still needed, and either add a `require` import in every consumer or delete the model entirely.
  **Why**: `information.md` shows that the `vehicle_master` master-import type writes to `insurer_vehicle_master`, not `vehicle_master`. The active quote-validation path uses `insurer-vehicle-master`. If `vehicle_master` is never populated or queried in production the model is dead weight; if it is needed, the missing import must be added before any caller is live.
  **When**: Next quarter
  **Where**: `models/mysqldb/vehicle-master.js`; `services/motor-quote-master-validation.js`

- **What**: Stop re-exporting `mysqldb` from individual model files.
  **Why**: Every model in `models/mysqldb/` re-exports the same `mysqldb` singleton from the shared library. Callers that need the database connection should import it directly from the shared library rather than picking it up as a side-effect of importing a model. This is a minor cleanliness issue shared across the whole model layer.
  **When**: Nice to have
  **Where**: `models/mysqldb/vehicle-master.js` line 20 (and all sibling model files)

## Open questions

1. Is the `vehicle_master` table distinct from `insurer_vehicle_master` in the production database? `information.md` maps the `vehicle_master` import type to the `insurer_vehicle_master` table, suggesting the generic table may never be populated. A maintainer who owns the database schema can confirm whether `vehicle_master` holds any rows.
2. Was there a migration plan to eventually use the generic `vehicle_master` for make/model/variant lookups independent of any insurer, or has that design been permanently superseded by the insurer-specific table?
