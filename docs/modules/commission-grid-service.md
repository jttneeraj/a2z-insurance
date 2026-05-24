# Commission Grid Service

## What this module does

This module is a library of pure helper functions for reading and normalising
commission grid data from Excel files. It converts raw Excel cell values into
clean, typed JavaScript values that the commission-grid controller can insert
into the database. Functions cover sheet-type detection, header normalisation,
cell-value extraction, percentage parsing, decline detection, and vehicle-
attribute extraction (fuel type, engine CC, vehicle age, make) for every
sub-product the system supports: private car, two-wheeler, taxi, and
commercial vehicle.

## Why this module exists

Parsing insurer commission Excel files is messy: cells may contain formulas,
merged regions, rich-text runs, or shorthand strings like "D" (decline) or
"MISP". Isolating all that normalisation logic in one place prevents it from
being reimplemented (and reimplemented inconsistently) in each sheet-specific
parser. New sheet layouts can reuse these primitives rather than copy-pasting
string-handling code.

## When this module runs / is used

Every call to `POST /api/admin/commission-grid/import` triggers the importer
controller, which calls these helpers once per worksheet in the uploaded Excel
file and once per data cell in each worksheet. The module is also invoked
indirectly during `POST /api/admin/commission-grid/lookup` through the
commission engine (though that path does not parse Excel — it only queries the
DB).

## How it fits in

| Direction | Module |
|-----------|--------|
| Depends on | Nothing — pure functions with no imports |
| Used by | `controllers/commission-grid.js` (all sheet parsers and the importer entry point) |
| Indirectly related | `services/commission-engine.js` consumes data that this module's helpers write to the DB |

## Key files

| File | Purpose |
|------|---------|
| `services/commission-grid.js` | All exported utility functions: sheet-type detection, cell reading, percentage/decline/attribute extraction |
| `controllers/commission-grid.js` | Imports and applies the helpers; also defines private sheet parsers (`parsePvtCarCompSaodSheet`, `parseTwoWheelerOnePlusOneSatpSheet`, etc.) and `normalizeCommissionPercent` |
| `routes/commission-grid.js` | Mounts `POST /import` (with Multer file upload) and `POST /lookup` under the admin router |

## Optimization opportunities

### 1. `normalizeCommissionPercent` called but not defined in the service file
- **What**: `normalizeCommissionFlexible` in `services/commission-grid.js` (line 501) calls `normalizeCommissionPercent(Number(text))`, but that function is only defined in `controllers/commission-grid.js` (line 615) and is not imported or re-exported anywhere in the service file.
- **Why**: Latent `ReferenceError: normalizeCommissionPercent is not defined` — the bug is dormant only because `normalizeCommissionFlexible` is imported by the controller but never actually called (the original call sites were commented out in favour of `normalizeCvValue`). If any caller ever invokes `normalizeCommissionFlexible` with a plain numeric string, the process crashes.
- **When**: Now — move `normalizeCommissionPercent` into `services/commission-grid.js` and export it, or inline the conversion logic inside `normalizeCommissionFlexible`.
- **Where**: `services/commission-grid.js:471–522`, `controllers/commission-grid.js:615–629`

### 2. `ExcelJS` referenced but not imported in the service file
- **What**: `getCellValue` at `services/commission-grid.js:27` checks `cell.type === ExcelJS.ValueType.Merge`, but `ExcelJS` is never required in that file.
- **Why**: Latent `ReferenceError: ExcelJS is not defined` when a worksheet contains merged cells. `getCellValue` is currently only called by `findHeaderRow`, which is exported but unused in the codebase; the bug is dormant but would surface immediately if `getCellValue` or `findHeaderRow` were actually used.
- **When**: Now — add `const ExcelJS = require('exceljs')` at the top of `services/commission-grid.js`, or replace the merged-cell check with a raw type-number comparison (ExcelJS merge type is `6`).
- **Where**: `services/commission-grid.js:1–2`, `services/commission-grid.js:27`

### 3. Debug `console.log` statements in production code
- **What**: Remove or gate five `console.log` calls that dump raw Excel row data to stdout on every grid import.
- **Why**: In production these flood the log files with potentially thousands of lines per upload (the CV sheet loops columns 5–169 per row), burying real error signals. The `worksheetToJson` debug log (`services/commission-grid.js:143–150`) alone fires once per worksheet.
- **When**: Now — these are clearly development artifacts.
- **Where**: `services/commission-grid.js:143–150`; `controllers/commission-grid.js:93–99`, `557`, `1743–1749`

### 4. Duplicate `if` block in `parseCommissionGridSheet`
- **What**: The condition `if (sheetName.trim() === "PVT Car Comp+SAOD")` appears twice consecutively (lines 331 and 343); the second branch is dead code.
- **Why**: Maintenance hazard — the doubled block suggests an incomplete merge or copy-paste error; it is never reached and wastes a reader's attention.
- **When**: Now — delete the second block.
- **Where**: `controllers/commission-grid.js:343–353`

### 5. Dead private sheet parsers
- **What**: `parseCvExcludingHcvSheet` (line 1683) is defined but never called — it has been superseded by `parseWideCvGridSheet`. Similarly, `parseRtoMappingSheet` (line 212) and `parseTaxiMappingSheet` (line 267) were superseded by the unified `parseMappingSheet` (line 546) but were not deleted.
- **Why**: Three long functions (≈ 400 lines total) that look operational but are never executed create confusion when debugging import failures.
- **When**: Next quarter — verify no rollback use case exists, then delete.
- **Where**: `controllers/commission-grid.js:212–265`, `267–320`, `1683–1906`

### 6. Fragile cluster detection in `parseMappingSheet`
- **What**: The regex used to identify a "cluster name" cell (`/cluster|zone|mapping|metro|a|b|c|d|e|f|g/i`) (line 572) matches any single-character cell containing a letter a–g, so a row number, a grade, or any abbreviation can be mistaken for a cluster.
- **Why**: Silent data corruption — wrong cluster names get stored, causing the commission engine to fail to match legitimate RTOs later.
- **When**: Next quarter — replace with column-position-based parsing (RTO code is always column 1, cluster name is always column 5 as the legacy `parseRtoMappingSheet` did correctly).
- **Where**: `controllers/commission-grid.js:571–578`

### 7. One DB insert per commission row — no batching
- **What**: Every sheet parser calls `MysqlCommissionGridModel.insertCommissionGrid(...)` inside a row-by-row loop, issuing one SQL INSERT per row inside the transaction.
- **Why**: A typical CV grid with 50+ clusters × 20 segments = 2,000+ individual inserts within a single transaction. Batching into chunks of 100–500 rows would substantially reduce round-trips and transaction lock time.
- **When**: Next quarter — extend the model's `insertCommissionGrid` to accept an array and use a multi-row `INSERT ... VALUES (...),(...)`.
- **Where**: `controllers/commission-grid.js` — every `for (const row of dataRows)` loop

### 8. `extractMax` and `findHeaderRow` exported but unused
- **What**: `extractMax` (line 179) is defined and exported, but the export list at line 552 omits it; `findHeaderRow` is exported but never called outside the file.
- **Why**: Minor dead-export clutter that misleads readers into thinking there is an external consumer.
- **When**: Nice to have — remove from module.exports, or add a usage.
- **Where**: `services/commission-grid.js:552–586`

### 9. No automated tests
- **What**: No test file exists for any function in `services/commission-grid.js`.
- **Why**: The parsing logic is complex (merged cells, rich text, percentage strings, age ranges, CC ranges, decline markers) and entirely untested; regressions from a new insurer's grid format are invisible until data is already in production.
- **When**: Next quarter — unit tests for `extractPercentage`, `detectDecline`, `normalizeCommissionFlexible`, `normalizeCvValue`, and the CC/age extractors are high-value and low-effort since the functions are pure.
- **Where**: New file `tests/services/commission-grid.spec.js`

## Open questions

- Is `normalizeCommissionFlexible` still needed? All current call sites are commented out in favour of `normalizeCvValue`. If not, it can be deleted along with the latent `normalizeCommissionPercent` bug.
- The CV grid column loop runs to column 169 (`col <= 169`). Is 169 a real upper bound derived from the largest insurer file seen, or an arbitrary large number? Clarifying this would let the loop terminate early instead of iterating over empty columns.
- `extractTaxiSeatingMin` always returns `null` regardless of input (lines 423–431). Is seating minimum not required by any insurer grid, or is this function incomplete?
- Should `detectGridMeta` derive sheet metadata from insurer-specific configuration rather than sheet-name substrings? Hardcoded keyword matching ("private", "pc", "tw", "hcv") will break silently when an insurer uses different naming conventions.
