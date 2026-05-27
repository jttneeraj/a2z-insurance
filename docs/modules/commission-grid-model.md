# Commission Grid Model

## What this module does

This module is the database access layer for the commission grid feature. It provides all SQL operations for three related tables: the main commission rate table (`insurer_commission_grid`), the upload audit table (`insurer_commission_grid_uploads`), and the RTO-to-cluster mapping table (`insurer_rto_cluster_mapping`). It also exposes the runtime lookup queries used by the commission engine to resolve applicable rates for a given vehicle and RTO.

## Why this module exists

Insurer commission agreements are structured as multi-dimensional rate tables: a given vehicle type in a given geographic cluster under a given policy type earns a different commission percentage. These rates change periodically (new financial year, new agreements) and must be bulk-imported from Excel files. This module isolates all raw SQL for that data — both the import writes and the runtime reads — so that the controller and engine can call clean methods rather than embedding SQL everywhere.

## When this module runs / is used

- **During import**: When an admin uploads an Excel file via `POST /api/admin/commission-grid/import`, the controller calls the write methods (`createUploadRecord`, `insertCommissionGrid`, `insertRtoClusterMapping`, `deleteOldCommissionGridData`, `deleteOldRtoClusterData`, `updateUploadRecord`) all within a single database transaction.
- **During commission resolution**: Every time `services/commission-engine.js` resolves a commission for a quote or proposal, it calls `getRtoCluster` to map the vehicle's RTO code to a cluster, then `lookupCommissionGrid` to find the matching rate rows, then optionally `getAvailableClusters` if no cluster matches (fallback diagnostic).
- **During grid lookup**: When an admin queries `POST /api/admin/commission-grid/lookup`, the controller delegates to `CommissionEngineService.resolveCommission` which in turn calls the model's lookup methods.

## How it fits in

| Direction | Module |
|-----------|--------|
| Depends on | `shared-library` (provides `mysqldb` Sequelize connection) |
| Used by | `controllers/commission-grid.js` — calls all import and delete methods |
| Used by | `services/commission-engine.js` — calls `getRtoCluster`, `lookupCommissionGrid`, `getAvailableClusters` |

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/commission-grid.js` | The only file in this module; defines `CommissionGridModel` and exports the singleton `MysqlCommissionGridModel` |

**Tables managed by this model:**

| Table | Purpose |
|-------|---------|
| `insurer_commission_grid` | One row per rate rule: insurer × cluster × sub-product × policy type × vehicle criteria → commission value |
| `insurer_commission_grid_uploads` | Audit trail for each Excel import batch; stores row counts and final status (`PROCESSING` → `PROCESSED` or `INACTIVE`) |
| `insurer_rto_cluster_mapping` | Maps an RTO code (e.g. `MH-01`) to a cluster name (e.g. `Metro A`) for a given insurer and sub-product |

## Optimization opportunities

- **What**: Remove or fix the `add()` and `update()` methods (lines 11–21).
  **Why**: `this.model` is never assigned in the constructor, so both methods throw `TypeError: Cannot read properties of undefined` if called. They appear to be copy-paste stubs from other model files that were never completed. Either wire them to a Sequelize model definition or delete them to avoid false confidence.
  **When**: Now
  **Where**: `models/mysqldb/commission-grid.js`, lines 11–21

- **What**: Add a composite database index on `insurer_commission_grid` covering `(insurer_id, product_code, sub_product_code, policy_type_code, cluster_name, is_active)`.
  **Why**: `lookupCommissionGrid` (lines 321–421) issues a complex multi-condition `WHERE` with seven optional criteria and a multi-key `CASE` `ORDER BY`. Without a covering index on the high-selectivity prefix columns, this query does a full table scan per commission resolution call, which will degrade as the table grows.
  **When**: Now
  **Where**: `models/mysqldb/commission-grid.js`, lines 321–421 (query); corresponding migration or `database-tables.sql` in shared-library

- **What**: Re-enable or remove the `markOldUploadsInactive` call in the import controller.
  **Why**: `markOldUploadsInactive` is implemented in the model (lines 276–293) but the corresponding call in `controllers/commission-grid.js` is commented out (line 64). As a result, the `insurer_commission_grid_uploads` audit table only ever accumulates `PROCESSED` rows with no way to distinguish the live upload from superseded ones. Either restore the call or drop the method.
  **When**: Next quarter
  **Where**: `controllers/commission-grid.js`, line 64; `models/mysqldb/commission-grid.js`, lines 276–293

- **What**: Add a `LIMIT` guard or pagination to `deleteOldCommissionGridData` and `deleteOldRtoClusterData`.
  **Why**: Both methods (lines 246–274) issue unbounded `DELETE FROM … WHERE insurer_id = ?`. For an insurer with a large grid (tens of thousands of rows), this creates a long-held row-level lock during the import transaction, potentially blocking concurrent reads for several seconds.
  **When**: Nice to have
  **Where**: `models/mysqldb/commission-grid.js`, lines 246–274

- **What**: Follow the shared-library model pattern (`class CommissionGridModel extends MysqlCommissionGridModel`) if the shared library ever provides a `commission_grid` base model.
  **Why**: The current class does not extend anything from shared-library, meaning it misses any cross-cutting utilities (soft-delete, timestamps, audit hooks) that other models inherit automatically. Currently acceptable because the grid is insert-heavy and the shared-library model may not exist, but worth aligning if the library is extended.
  **When**: Nice to have
  **Where**: `models/mysqldb/commission-grid.js`, lines 1–10

## Open questions

- Does `insurer_commission_grid` have a unique key constraint? If not, a re-import with a partially failed transaction could leave duplicate rows because `insertCommissionGrid` uses a plain `INSERT` (no `ON DUPLICATE KEY UPDATE`), unlike `insertRtoClusterMapping` which has upsert semantics.
- What is the expected table size per insurer? The `LIMIT 20` in `lookupCommissionGrid` (line 414) implies multiple matching rows are normal; understanding the expected cardinality would help decide the right index strategy.
- Is `parseCvExcludingHcvSheet` in `controllers/commission-grid.js` dead code? It appears to be an earlier version of `parseWideCvGridSheet` and is never called from `parseCommissionGridSheet`. Confirm before removing.
