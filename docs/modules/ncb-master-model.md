# NCB Master Model

## What this module does

This module wraps the `ncb_master` database table, which stores a generic (non-insurer-specific) list of No Claim Bonus (NCB) percentage tiers — the discount a motor insurance customer earns for each claim-free year. NCB is a standard industry concept; common tiers are 0%, 20%, 25%, 35%, 45%, and 50%. The model exposes a single query method used to validate whether an NCB percentage submitted in a quote request is a recognised value.

## Why this module exists

Before per-insurer NCB tables were introduced, a generic `ncb_master` table served as the canonical list of allowed NCB percentages. The module exists as that legacy anchor — a place to look up whether a given NCB percentage is valid, independent of any particular insurer.

## When this module runs / is used

In the current codebase the model has **no active callers**. The only function that references it — `validateMotorQuoteMasters_` in `services/motor-quote-master-validation.js` (lines 7–66) — is an older version of the validation function that was never removed. It is not exported and also has a missing import for `MysqlNcbMasterModel`, meaning it would throw a `ReferenceError` if ever invoked. The exported validation function `validateMotorQuoteMasters` (lines 68–125) uses `MysqlInsurerNcbMasterModel` from `insurer-ncb-master.js` instead.

The `import-master` controller's `ncb_master` master type (line 244 of `controllers/import-master.js`) also targets the `insurer_ncb_master` table, not the `ncb_master` table.

## How it fits in

**Depends on:**
- `shared-library` — provides the base `MysqlNcbMasterModel` class and the Sequelize DB connection.

**Depended on by:**
- `services/motor-quote-master-validation.js` — references `MysqlNcbMasterModel` only inside the unexported, effectively dead function `validateMotorQuoteMasters_`. No currently-reachable code path uses this model.

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/ncb-master.js` | Extends the shared-library base model; adds only a `findByQuery(conditions)` method that does a single-row lookup. |

## Optimization opportunities

- **What**: Remove the dead `validateMotorQuoteMasters_` function from `services/motor-quote-master-validation.js`.
  **Why**: The function is not exported, has a missing import (`MysqlNcbMasterModel` is never required in that file), and is fully superseded by the exported `validateMotorQuoteMasters`. Leaving it in place creates confusion about which validation path is active.
  **When**: Now.
  **Where**: `services/motor-quote-master-validation.js`, lines 7–66.

- **What**: Determine whether the `ncb_master` table and this model are still needed, and delete this model file if they are not.
  **Why**: No reachable code path reads from `ncb_master`. The `insurer_ncb_master` table (managed by `insurer-ncb-master.js`) is what the active quote-validation and import flows use. Keeping an unused model creates maintenance overhead and misleads future developers into thinking this table is live.
  **When**: Next quarter (needs a DB audit to confirm the table is empty or unused before dropping).
  **Where**: `models/mysqldb/ncb-master.js`; confirm against `node_modules/shared-library/database-tables.sql`.

- **What**: Add a `findAll` or `list` method to the model if the table is confirmed to still be in use.
  **Why**: The model currently exposes only `findByQuery` (single-row lookup). Any admin UI that needs to list available NCB tiers would have no query method to call without going around the model layer.
  **When**: Nice to have (only relevant if the table is confirmed active).
  **Where**: `models/mysqldb/ncb-master.js`.

## Open questions

1. **Is `ncb_master` still populated?** Is the `ncb_master` table populated with data in any environment? If it is empty, the table and model can be safely dropped once the dead validation function is removed.
2. **Future use?** Is there a planned feature that would bring `ncb_master` back as the validation source, or has it been permanently replaced by per-insurer NCB tables?
3. **`import-master` mislabelling**: The `ncb_master` master-type key in `import-master.js` writes to `insurer_ncb_master`, not `ncb_master`. Is this naming intentional (a legacy key kept for backward compatibility) or an oversight?
