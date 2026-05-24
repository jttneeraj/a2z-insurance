# Commission Grid

## What this module does

The commission-grid module imports insurer commission rate tables (Excel files) and stores them in a normalised database form that the rest of the application can query. Each insurer sends a multi-sheet workbook where different sheets cover different vehicle types (private car, two-wheeler, taxi, commercial vehicle) and policy types (Comprehensive, Third-Party, SAOD, etc.). The module parses every sheet into `insurer_rto_cluster_mapping` rows (which group RTO codes into geographic rate zones called "clusters") and `insurer_commission_grid` rows (the actual commission percentages per cluster, vehicle segment, and policy type). A second endpoint looks up the applicable commission for a given insurer + vehicle + policy combination.

## Why this module exists

Insurer commission tables are large, spreadsheet-driven, and insurer-specific — each insurer provides its own Excel format with its own column layout. Rather than asking every downstream service to parse Excel files on demand, this module performs a one-time import that normalises and indexes the data into database tables with a consistent schema. That consistent schema is what the commission engine (`services/commission-engine.js`) queries at lookup time. The module is admin-only because imports replace all existing data for the selected insurer in a single destructive transaction.

## When this module runs / is used

- **On every Excel upload**: An admin or operations user calls `POST /api/admin/commission-grid/import` with a form-data request containing `insurer_id` and an Excel file. The controller opens a database transaction, deletes all existing grid and RTO-cluster rows for that insurer, iterates over every worksheet in the file, calls the appropriate sheet-specific parser, and commits the transaction. The uploaded file is deleted from disk after a successful import.
- **On every commission lookup**: Calling `POST /api/admin/commission-grid/lookup` delegates to `CommissionEngineService.resolveCommission()`, which first resolves the RTO code to a cluster name, then queries `insurer_commission_grid` with priority-ordered matching rules and returns the best matching commission record.
- **Not yet wired into the motor quote flow**: `CommissionEngineService.resolveCommission()` is only reachable through the admin lookup endpoint; no motor-flow controller (`motor-quotes.js`, `motor-proposal.js`, etc.) calls it.

## How it fits in

| Direction | Module | Relationship |
|---|---|---|
| Depends on | `services/commission-engine.js` | Commission resolution logic called by the lookup endpoint |
| Depends on | `models/mysqldb/commission-grid.js` | All DB reads and writes |
| Depends on | `services/commission-grid.js` | Sheet detection and value normalisation helpers |
| Depends on | ExcelJS (npm) | Reading `.xlsx` files |
| Depends on | Multer (npm) | Handling the multipart file upload |
| Consumed by | Nothing (at runtime) | The commission data is stored but not yet read by any motor-flow controller |

## Key files

| File | Purpose |
|---|---|
| `routes/commission-grid.js` | Registers `POST /import` (Multer file upload) and `POST /lookup`; mounted at `/api/admin/commission-grid` in `app.js` |
| `controllers/commission-grid.js` | `importCommissionGrid` orchestrates the full import; eight sheet-specific parsers handle distinct Excel layouts; `lookupCommissionGrid` delegates to the commission engine |
| `services/commission-grid.js` | Stateless helpers: `detectSheetType`, `worksheetToJson`, `extractFuelType`, `extractCcMin/Max`, `extractAgeMin/Max`, `normalizeCvValue`, and others used by the parsers |
| `models/mysqldb/commission-grid.js` | All SQL: creates upload records, inserts and deletes RTO cluster mappings, inserts commission grid rows, looks up grid rows with multi-criteria ordering, and queries available clusters |
| `services/commission-engine.js` | Resolves a commission: RTO code → cluster name → best-matching grid row, with fallback to `available_clusters` on a miss |

## Optimization opportunities

- **What**: Remove four debug `console.log` calls that fire on every import.
  **Why**: `console.log("SHEET DEBUG:", ...)` (controller line 93), `console.log("RAW ROWS DEBUG:", ...)` (`services/commission-grid.js` line 143), `console.log("CV DEBUG:", ...)` (controller lines 1743–1749), and `console.log(\`${sheetName} FIRST 5 ROWS:\`, ...)` (controller line 557) dump multi-kilobyte spreadsheet data to stdout on every import, flooding production logs with sensitive commission data and degrading I/O.
  **When**: Now
  **Where**: `controllers/commission-grid.js:93,557,1743–1749`, `services/commission-grid.js:143`

- **What**: Remove `dev_message: error.message` from the `importCommissionGrid` 500 response.
  **Why**: Internal SQL error messages, file paths, and stack traces are returned verbatim to API callers. Any holder of a valid `userdata` header can trigger an import error and read internal DB details.
  **When**: Now
  **Where**: `controllers/commission-grid.js:207`

- **What**: Delete the dead `parseRtoMappingSheet` function (lines 212–265) and `parseTaxiMappingSheet` function (lines 267–320).
  **Why**: Both were superseded by the unified `parseMappingSheet` (line 546) and are never called. They add 109 lines of unreachable code to an already large file (2174 lines).
  **When**: Next quarter
  **Where**: `controllers/commission-grid.js:212–320`

- **What**: Delete the dead `parseCvExcludingHcvSheet` function (lines 1683–1906).
  **Why**: Never called. `parseWideCvGridSheet` handles both the "CV (excl. HCV)" and "HCV" sheet types via the `headerStartIndex` parameter and is the only parser wired to those sheet names. The dead function is 224 lines.
  **When**: Next quarter
  **Where**: `controllers/commission-grid.js:1683–1906`

- **What**: Remove the duplicate `if (sheetName.trim() === "PVT Car Comp+SAOD")` block at lines 343–353.
  **Why**: Identical to the block at lines 331–342, which already returns; the second block can never execute. Silent dead code that misleads readers into thinking there is a distinct second condition.
  **When**: Next quarter
  **Where**: `controllers/commission-grid.js:343–353`

- **What**: Replace row-by-row `await insertCommissionGrid(...)` calls with batched multi-value INSERTs.
  **Why**: The wide CV-grid parsers (`parseWideCvGridSheet`, `parseCvExcludingHcvSheet`) loop over up to 169 column groups × N segments inside the same database transaction, producing thousands of sequential round-trips. Accumulating rows into arrays of 100–500 and using a single parameterised `INSERT … VALUES (…),(…)` would cut import time from minutes to seconds for large files.
  **When**: Next quarter
  **Where**: `controllers/commission-grid.js` (all inner loops), `models/mysqldb/commission-grid.js` (new `batchInsertCommissionGrid` method)

- **What**: Add a composite DB index on `(insurer_id, product_code, sub_product_code, policy_type_code, cluster_name, is_active)` on `insurer_commission_grid`.
  **Why**: Every call to `lookupCommissionGrid` (both the admin endpoint and any future motor-flow integration) filters on all five columns then applies complex `CASE` ordering with `LIMIT 20`. Without an index, each lookup scans the entire table. The table is replaced wholesale on each import, so index maintenance cost is low.
  **When**: Next quarter
  **Where**: DB schema (`node_modules/shared-library/database-tables.sql` or a separate migration)

- **What**: Add a `fileFilter` to the Multer config that rejects non-Excel MIME types before writing to disk.
  **Why**: Any file type is currently accepted, written to `uploads/commission-grid/`, and only rejected at parse time when ExcelJS throws. The uploaded file sits on disk until the catch block's cleanup runs, and a maliciously crafted non-XLSX file still triggers ExcelJS parsing effort.
  **When**: Nice to have
  **Where**: `routes/commission-grid.js:11–13`

- **What**: Uncomment `markOldUploadsInactive` (controller line 64) or decide to remove the dead code.
  **Why**: Every import leaves all previous upload records with `is_active = 1` indefinitely. The `insurer_commission_grid_uploads` table will grow unbounded, and any query filtering by `is_active = 1` returns every historical upload rather than only the current one.
  **When**: Nice to have
  **Where**: `controllers/commission-grid.js:64`

## Open questions

- **Commission grid not wired into the motor quote flow**: No motor-flow controller or insurer service reads from `insurer_commission_grid` or calls `CommissionEngineService.resolveCommission()`. Is this intentional (the commission engine is a future feature), or is it a gap that should be addressed before the live flow goes to production?
- **Excel format coupling**: Sheet-specific parsers hard-code column positions (e.g., `row.column_4` through `row.column_28` in `parsePvtCarCompSaodSheet`). Does the team have a commitment from Digit to keep those column positions stable, or will re-imports break silently when the insurer updates their template?
- **`parseMappingSheet` cluster heuristic reliability**: The RTO-code detector uses regex `/^[A-Z]{2}[-\s]?\d{1,2}/i` and the cluster-name detector uses `/cluster|zone|mapping|metro|a|b|c|d|e|f|g/i`. The second pattern matches any cell containing "a" through "g", which could be almost any value. What is the actual column-position convention in Digit's RTO mapping sheets, and should `parseMappingSheet` use fixed column indices instead?
- **Only Digit grids are tested**: All named sheet parsers (`parsePvtCarCompSaodSheet`, `parseTwoWheelerOnePlusOneSatpSheet`, etc.) are clearly built around a specific Digit Excel format. When a second insurer is onboarded, will the module need per-insurer parser branches, or is the expectation that all insurers will share Digit's format?
