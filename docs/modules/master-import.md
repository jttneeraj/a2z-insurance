# Master Import

## What this module does

The master-import module provides a single admin endpoint for bulk-loading reference data into the system from Excel (XLSX) or plain-text (TXT) files. An admin user uploads a file and specifies a `masterType` key; the module then reads one or more worksheets from the file, maps the spreadsheet columns to database column names, clears the old data for those tables (scoped to the given insurer where applicable), and inserts the new rows in 500-row chunks inside a single database transaction. Sixteen distinct master types are supported, covering vehicles, RTOs, state codes, NCB rates, previous insurers, KYC document types, API field metadata, and more.

## Why this module exists

Insurers supply reference data (vehicle catalogues, pincode lists, add-on age limits, etc.) as periodic Excel dumps, not as API feeds. The module exists to give operations staff a repeatable, low-code path for refreshing that data without writing SQL. Rather than building a separate importer for each table, a single configuration registry (`MASTER_IMPORT_CONFIG` in `controllers/import-master.js`) maps each `masterType` to the correct sheet names, column renames, and target tables, so adding a new master type requires only a new config entry rather than new code.

## When this module runs / is used

This module is invoked exclusively by admin staff via a direct HTTP call:

- **Trigger**: `POST /api/admin/master/master-file-import` with a `multipart/form-data` body containing the file, the `masterType` string, and (where required) an `insurer_id`.
- **Auth**: The standard `validateHeaders` / `decodeUserData` middleware applies — a valid `userdata` header is required.
- **Frequency**: On demand, whenever new reference data arrives from an insurer. There is no scheduled or automated trigger.
- **Side effects**: For insurer-scoped master types (e.g. `vehicle_master`, `ncb_master`), all existing rows for that insurer are deleted and replaced. For global-reference types (e.g. `state_code_master`, `pin_code_and_rto_master_2023`), the entire table is replaced — all rows for all insurers are deleted.

## How it fits in

| Direction | Module |
|-----------|--------|
| **Depends on** | `lib/xlsxImporter.js` — parses XLSX sheets into row arrays |
| **Depends on** | `models/mysqldb/master-import.js` — performs chunked INSERT … ON DUPLICATE KEY UPDATE and DELETE |
| **Depends on** | `shared-library` (via `mysqldb`) — Sequelize connection used for transactions and raw queries |
| **Called by** | Admin staff directly; no other module imports or calls this one at runtime |
| **Related data consumed by** | `insurer-api-field-master` and `insurer-api-field-validation-rule` modules (both can be bulk-populated via the `api_fields_validation` master type) |
| **Reference snapshot** | `models/mysqldb/master-import copy.js` — legacy single-transaction version without chunking; not imported anywhere, kept as a reference |

## Key files

| File | Purpose |
|------|---------|
| `routes/master-import.js` | Defines `POST /master-file-import`, wires a local Multer instance to accept `.xlsx` and `.txt` files, delegates to `importMasterXlsx` |
| `controllers/import-master.js` | Hosts `MASTER_IMPORT_CONFIG` (the 16-entry registry of master types → tables/column mappings) and the exported `importMasterXlsx` handler (validation, insurer FK check, transaction orchestration) |
| `models/mysqldb/master-import.js` | `bulkInsertMasterData` (chunked INSERT … ON DUPLICATE KEY UPDATE) and `clearMasterTable` (DELETE scoped by insurer or full-table) |
| `lib/xlsxImporter.js` | `readXlsxFile` — reads a workbook sheet and maps columns to DB names; also hosts 10+ specialised matrix parsers for non-trivial sheet layouts |

## Optimization opportunities

### 1. Dead controller function `importMasterXlsx_`
- **What**: Remove the ~80-line `importMasterXlsx_` function that precedes the live `importMasterXlsx` in `controllers/import-master.js`.
- **Why**: It is never exported, never called, and references `clearMasterTables()` (plural) which no longer exists — if anyone tries to reactivate it the function will crash immediately. Its presence makes the real handler harder to find and creates a false impression that two code paths exist.
- **When**: Now
- **Where**: `controllers/import-master.js`, roughly lines 1–110 (the entire `importMasterXlsx_` function)

### 2. `dev_message` leaks SQL error details in 500 responses
- **What**: Replace `dev_message: error.parent?.sqlMessage || error.message` with a generic message in the 500 response, and log the full error server-side via Winston instead.
- **Why**: Any authenticated caller can trigger an import error (e.g. supply a malformed file) and read raw SQL error text, constraint names, and internal table names from the response body — information useful for probing the schema.
- **When**: Now
- **Where**: `controllers/import-master.js`, the `catch` block of `importMasterXlsx` (the `console.error` call and the `res.status(500).json` body)

### 3. `headerRow` parameter silently ignored — `error_mapping` parses wrong rows
- **What**: Add a `headerRow` parameter to `readXlsxFile` in `lib/xlsxImporter.js` and use it to skip leading rows before the actual header when building the column mapping.
- **Why**: `controllers/import-master.js` already passes `tableConfig.headerRow` as the 6th argument to `readXlsxFile`, but the function only accepts 5 parameters — the 6th is ignored. The `error_mapping` master type sets `headerRow: 2`, meaning the intended behavior is to skip one decorative header row and treat row 2 as the real header. Without the fix, row 1 is always used as the header, likely producing null-filled or wrong columns for every `error_mapping` import.
- **When**: Now
- **Where**: `lib/xlsxImporter.js`, `readXlsxFile` signature and the `XLSX.utils.sheet_to_json` call in the standard (non-customReader) path

### 4. `console.log` calls fire on every import
- **What**: Remove or replace with structured Winston logging the `console.log("Sheet names:", ...)`, `console.log("Selected sheet:", ...)`, `console.log("Excel headers:", ...)`, `console.log("KYC rows:", ...)`, and `console.log("Mismatch rows:", ...)` calls.
- **Why**: These debug statements dump large data structures to stdout on every import, bypassing log-level controls and the Winston transport chain. In production they inflate log volume and may expose spreadsheet contents (column names, counts) in aggregated log systems.
- **When**: Now
- **Where**: `lib/xlsxImporter.js` lines ~64, ~148–149; `parseDocTypeKyc` and `parseDocTypeMismatch` functions

### 5. No file size limit on the Multer instance
- **What**: Add `limits: { fileSize: 20 * 1024 * 1024 }` (or a suitable cap) to the Multer configuration in `routes/master-import.js`.
- **Why**: Currently any authenticated user can upload an arbitrarily large file. A multi-hundred-MB spreadsheet will be written to disk and then parsed in memory, potentially exhausting disk space or process memory. The upload middleware review (`docs/modules/upload-middleware.md`) flagged the same gap across all upload routes.
- **When**: Now
- **Where**: `routes/master-import.js`, the `multer({ dest: ... })` call

### 6. Unused imports in the controller
- **What**: Remove the six unused imports at the top of `controllers/import-master.js`: `moment`, `Sequelize`, `Op`, `insuranceAuthLogin`, `ResponseHandler`, and `const { error } = require("console")`.
- **Why**: These are dead require calls that run on every server start. The `const { error } = require("console")` line is particularly confusing because `error` is also used as a catch-block variable name, making static analysis and code review harder. It matches the copy-paste residue pattern seen across every admin controller.
- **When**: Nice to have
- **Where**: `controllers/import-master.js`, lines 1–16

### 7. Global-table imports silently delete all rows
- **What**: Add a clear warning in code comments (and in operator documentation) that master types with no `insurer_id` — `state_rto_city_pincode_master`, `state_code_master`, `pin_code_and_rto_master_2023`, `api_integration_all_master` — issue a full `DELETE FROM table` before import, replacing all rows globally, not per insurer.
- **Why**: The behavior is correct by design, but it is non-obvious to anyone adding a new master type or triggering an import. A mistaken upload of a partial or test file for a global table corrupts data for every insurer simultaneously. A comment at the `clearMasterTable` call site (and a check in the API response) would make the destructive scope visible.
- **When**: Next quarter
- **Where**: `models/mysqldb/master-import.js`, `clearMasterTable`; `controllers/import-master.js` near the `clearMasterTable` call

## Open questions

1. **`insurer_id` detection for `cv_vehicle_type_master`**: This master type uses a `customReader` ("cvVehicleTypeTxt") and the `insurer_id` is injected through `defaultValues`, not through `columnMapping`. The detection helper (`tableNeedsInsurerId`) correctly finds `"insurer_id"` in `uniqueKeys`, but the logic is non-obvious. Is there a case where `insurer_id` is only in `defaultValues` and not in `uniqueKeys`? If so, such a table would bypass the FK validation and the scoped delete.

2. **No tests**: The `tests/` directory does not exist in the repository. Is there a separate test suite for import flows, or is this module tested entirely by hand with real spreadsheet files? Given the number of custom sheet parsers and the destructive clear-before-insert pattern, automated tests would be high-value here.

3. **File persistence after failed parse**: If `readXlsxFile` throws before `req.file.path` is used, the temp file is cleaned up in the catch block. But if `parseCvVehicleTypeTxt` throws (it reads the file directly by path), does the catch block still reach the `fs.unlinkSync` call? The current code structure appears correct, but this path deserves a review given that TXT files are read synchronously while XLSX files are read asynchronously.
