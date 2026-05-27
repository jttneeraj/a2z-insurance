# Insurer Previous Insurer Master Model

## What this module does

This module provides database access to the `insurer_previous_insurer_master` table, which holds a per-insurer reference list of previous insurance companies. Each row maps a numeric code (`previous_insurer_code`) and a display name (`previous_insurer_name`) to a specific insurer, allowing the system to validate and label the company a customer was insured with before purchasing or renewing through this platform.

## Why this module exists

When a motor policy customer submits a quote or renewal request they must declare their previous insurer. This table is the authoritative lookup that lets the validation layer confirm the submitted insurer code is real and recognised by the target insurer, rather than accepting arbitrary freeform text. Each insurer can have its own accepted list (keyed by `insurer_id`), so the same insurance company might carry different codes depending on which destination insurer is processing the quote.

## When this module runs / is used

The model is called in a single place:

- **During motor quote input validation** — `services/motor-quote-master-validation.js` calls `MysqlInsurerPreviousInsurerMasterModel.findByQuery({ previous_insurer_code })` whenever the quote payload contains a `previous_insurer_code` field. If no matching row is found the validation returns an "Invalid previous insurer" error and the quote request is rejected before any insurer API is called.

The table is populated separately via the master-data import flow:

- **`POST /api/admin/master-file-import`** with `masterType: motor_previous_insurer_list` — `controllers/import-master.js` reads an Excel file (`Motor Previous Insurer List.xlsx`) and bulk-inserts rows into `insurer_previous_insurer_master` using `ON DUPLICATE KEY UPDATE`, with `insurer_id` and `previous_insurer_code` as the composite unique key.

## How it fits in

**Depends on:**
- `MysqlInsurerPreviousInsurerMasterModel` base class from the shared-library package (`excela2zsuvidha/a2z-shared-library`) — provides the Sequelize model instance (`this.model`) and underlying DB connection (`mysqldb`)

**Used by:**
- `services/motor-quote-master-validation.js` — validates `previous_insurer_code` on every motor quote request that includes the field
- `controllers/import-master.js` — bulk-loads the table from the `motor_previous_insurer_list` Excel import (writes directly to the table, does not go through this model class)

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/insurer-previous-insurer-master.js` | Extends the shared-library base class; adds `findByQuery(conditions)` for single-row lookups; exports an instantiated singleton |
| `services/motor-quote-master-validation.js` | Only consumer — calls `findByQuery` to validate a quote's `previous_insurer_code` |
| `controllers/import-master.js` (lines 276–291) | Defines the `motor_previous_insurer_list` import config (column mapping, unique keys, default `is_active: 1`) that loads data into the table |

## Optimization opportunities

- **What**: Fix the typo `"Motor Prevoius insurer List.xlsx"` → `"Motor Previous Insurer List.xlsx"` in `controllers/import-master.js:279`.
  **Why**: The `fileName` value in the import config is used in log and error messages. A misspelling misleads operators looking for the expected file and diverges from the correct name documented in `information.md` line 10.
  **When**: Now
  **Where**: `controllers/import-master.js:279`

- **What**: Add a `findAllByInsurer(insurerId)` (or equivalent) method that returns the full list of previous insurers for a given insurer.
  **Why**: A frontend dropdown for "previous insurer" will need to enumerate all valid options for the selected insurer. Currently the only public method is a single-row lookup; fetching the full list requires the caller to resort to a raw query or iterate through codes blindly.
  **When**: Next quarter (add when the frontend dropdown feature is built)
  **Where**: `models/mysqldb/insurer-previous-insurer-master.js`

- **What**: Confirm that a database index exists on `(insurer_id, previous_insurer_code)` in the `insurer_previous_insurer_master` table.
  **Why**: `findByQuery` performs a `WHERE previous_insurer_code = ?` lookup on every quote validation call. Without an index on this column (or the composite unique key acting as one), the query scans the whole table — expensive when the insurer list is large and every quote triggers this check.
  **When**: Next quarter
  **Where**: DB schema / shared-library `database-tables.sql`

- **What**: The import path in `controllers/import-master.js` does not route through the model class — it writes directly to the table name string `"insurer_previous_insurer_master"`. Consider whether the table name should be referenced from a constant to prevent drift if the shared-library renames the table.
  **Why**: The table name is a hardcoded string in both the import config and the shared-library base model; if they ever diverge the import silently writes to a different table.
  **When**: Nice to have
  **Where**: `controllers/import-master.js:284`

## Open questions

- Is `insurer_id` always populated during import, or can rows exist without a specific insurer binding (i.e., a global/shared list)? The column mapping in the import config does not include an `insurer_id` source column, so its value likely comes from `defaultValues` or is injected by the base-class bulk-insert logic in shared-library. Clarification from the shared-library maintainer is needed.
- Are all insurers expected to share the same `insurer_previous_insurer_master` list, or will each insurer eventually have its own distinct list (making the `insurer_id` column meaningful for filtering)? The current validation in `motor-quote-master-validation.js` does not filter by `insurer_id`, so the distinction is currently invisible at query time.
