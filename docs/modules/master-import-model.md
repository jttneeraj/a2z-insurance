# Master Import Model

## What this module does

This module provides the low-level database operations that power the admin master-data import feature. It supplies three utility functions: a chunked bulk-insert (with optional upsert logic for de-duplication), a table-clearing function scoped to a specific insurer or the whole table, and a text-file parser for commercial vehicle type codes. All database operations accept an external Sequelize transaction so multi-table imports stay atomic.

## Why this module exists

Importing reference data (vehicle codes, RTO lists, NCB slabs, previous-insurer lists, and more) is a recurring admin task. Each import can touch thousands of rows across several tables. Rather than duplicating raw-SQL insert loops in every controller, this module centralises the chunked-insert pattern and the `ON DUPLICATE KEY UPDATE` upsert logic in one place, so the controller only has to supply the table name, the rows, and the unique-key columns.

## When this module runs / is used

Invoked exclusively when an admin POSTs to `/api/admin/master/master-file-import` with an Excel (`.xlsx`) or plain-text (`.txt`) file and a `masterType` identifier. The controller (`controllers/import-master.js`) calls these functions inside a Sequelize transaction: it clears the relevant tables, then bulk-inserts the parsed rows. There is no scheduled or background execution; every call is triggered by a direct admin HTTP request.

## How it fits in

- **Depends on**: `shared-library` (provides the `mysqldb` Sequelize connection), Node.js built-in `fs` module (for reading the `.txt` vehicle type file).
- **Depended on by**: `controllers/import-master.js` — the only consumer; it imports `bulkInsertMasterData`, `clearMasterTable`, and `parseCvVehicleTypeTxt` from this file.
- **Closely coupled to**: `lib/xlsxImporter.js` (handles all Excel parsing before handing rows to this module) and `routes/master-import.js` (Multer upload middleware, mounted at `/api/admin/master` in `app.js`).

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/master-import.js` | Three exported utility functions: `bulkInsertMasterData`, `clearMasterTable`, `parseCvVehicleTypeTxt` |
| `controllers/import-master.js` | HTTP handler, `MASTER_IMPORT_CONFIG` lookup table, transaction orchestration, uploaded-file cleanup |
| `routes/master-import.js` | Express router with Multer middleware; accepts `.xlsx` and `.txt`; mounted at `/api/admin/master` |
| `lib/xlsxImporter.js` | All Excel/TXT parsing: column normalisation, custom matrix readers for complex sheet layouts |
| `models/mysqldb/master-import copy.js` | Legacy reference snapshot — older version without caller-supplied transactions; **do not import** |

## Optimization opportunities

- **What**: Add a whitelist check on `tableName` in `bulkInsertMasterData` and `clearMasterTable` before interpolating it into raw SQL.
  **Why**: Both functions build SQL strings using the caller-supplied `tableName` directly (e.g., `` DELETE FROM `${tableName}` ``). The table name currently originates from `MASTER_IMPORT_CONFIG` hardcoded in the controller, so it is not user-controlled today — but there is no enforcement of that at the model layer. A future refactor that passes `tableName` from a less-trusted source would silently introduce SQL injection. Validating against a known-good list takes three lines.
  **When**: Next quarter
  **Where**: `models/mysqldb/master-import.js`, lines 37–54 (`bulkInsertMasterData`) and lines 73–88 (`clearMasterTable`)

- **What**: Add the missing `headerRow` parameter to `readXlsxFile` in `lib/xlsxImporter.js`.
  **Why**: The controller calls `readXlsxFile` with a sixth argument (`tableConfig.headerRow`) for the `error_mapping` master type, which specifies that the real header row is row 2 rather than row 1. The function signature only accepts five parameters, so `headerRow` is silently dropped. As a result, the `error_mapping` import reads the wrong row as the column header and likely maps no data correctly.
  **When**: Now
  **Where**: `lib/xlsxImporter.js` line 70 (function signature); `controllers/import-master.js` line 793 (call site)

- **What**: Remove or extract the dead `importMasterXlsx_` function from `controllers/import-master.js`.
  **Why**: This older non-transactional variant (lines 583–694) is not exported and never called. It predates the current `importMasterXlsx` and was kept as a reference while the transactional version was developed. Leaving it in place makes the file 110 lines longer and creates confusion about which version is active. Move any useful context to a comment on the live function or delete it.
  **When**: Next quarter
  **Where**: `controllers/import-master.js`, lines 583–694

- **What**: Replace `console.log` / `console.error` calls with the Winston logger.
  **Why**: `lib/xlsxImporter.js` has four `console.log` calls (lines 78, 138–139, 345, 376) that emit sheet names and row counts to stdout. `controllers/import-master.js` uses `console.error` in the catch block (line 842). These bypass the structured Winston transports, so import activity does not appear in the rotating log files or the HTTP transport in production.
  **When**: Next quarter
  **Where**: `lib/xlsxImporter.js` lines 78, 138, 139, 345, 376; `controllers/import-master.js` line 842

- **What**: Move `MASTER_IMPORT_CONFIG` to a dedicated config file (e.g., `config/master-import-config.js`).
  **Why**: The config object is 430 lines long and dominates `controllers/import-master.js`. Keeping routing config and HTTP handler logic in the same file makes both harder to read and test. Extracting it would reduce the controller to its actual behaviour (validation → transaction → response) and make adding new master types a one-file change.
  **When**: Nice to have
  **Where**: `controllers/import-master.js`, lines 21–448

## Open questions

- The `insurer_id` detection logic in `importMasterXlsx` (the active function) only checks `uniqueKeys` and `columnMapping` values for the string `"insurer_id"` — it does not check `defaultValues`. The old `importMasterXlsx_` function additionally checked `config.defaultValues?.hasOwnProperty("insurer_id")`. Is there any master type whose tables need `insurer_id` but list it only in `defaultValues` rather than in `uniqueKeys` or `columnMapping`? If so, the validation would silently pass even when `insurer_id` is missing.
- The `geo_pincode_locality_master` table target (in `state_rto_city_pincode_master`) has `uniqueKeys: []`, meaning every import appends new rows rather than upserting. Is this intentional, or should it have a composite unique key to prevent duplicates on repeated imports?
- The Multer destination is `uploads/master-files/`. The controller deletes the uploaded file after a successful or failed import. Is there a periodic cleanup job for files that remain if the process crashes between upload and deletion?
