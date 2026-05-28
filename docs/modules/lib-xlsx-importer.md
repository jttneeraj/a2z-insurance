# lib-xlsx-importer

## What this module does

This module reads an uploaded Excel (`.xlsx`) file from disk and converts one of its worksheets into an array of plain JavaScript objects, mapping Excel column headers to database column names. It also contains a set of specialised parsers for non-standard sheet layouts — matrices, code lists, and validation-rule tables — that cannot be handled by a simple header-to-column mapping.

## Why this module exists

The generic master-import flow (`controllers/import-master.js`) needs to support many different Excel formats: some sheets have a standard "one header row, one data row" layout, but others use a two-row product-code/name header, a matrix of codes, or a marker row that signals where data begins. Centralising all of this parsing logic in one file keeps the controller clean and makes it easy to add support for new sheet formats without touching the import pipeline.

## When this module runs / is used

It runs synchronously inside an HTTP request handler, immediately after an admin user uploads an Excel file via the master-import API endpoint (`POST /api/admin/master-import` or the newer `importMasterXlsx` variant). The controller calls `readXlsxFile` once per configured target table, then bulk-inserts the returned rows into MySQL.

## How it fits in

- **Depends on**: `xlsx` npm package (low-level Excel read/parse), the `MASTER_IMPORT_CONFIG` object defined in `controllers/import-master.js` (which drives which sheet name, column mapping, and custom reader to use).
- **Used by**: `controllers/import-master.js` — the only consumer; no other file imports from `lib/xlsxImporter.js`.

## Key files

| File | Purpose |
|---|---|
| `lib/xlsxImporter.js` | The entire module. Exports `readXlsxFile`, which dispatches to either the generic column-mapping path or one of the 10 specialised parsers based on the `customReader` argument. |

## Optimization opportunities

- **What**: Remove `console.log` calls (lines 78, 138–139, 345, 375) and replace them with the Winston logger already used everywhere else in the codebase.
  - **Why**: These lines write to stdout in production, polluting structured logs and leaking file-system paths and sheet contents to application logs.
  - **When**: Now
  - **Where**: `lib/xlsxImporter.js` lines 78, 138, 139, 345, 375

- **What**: Add the missing `headerRow` parameter to `readXlsxFile`'s function signature and wire it through to the `XLSX.utils.sheet_to_json` call via the `{ header: 1 }` + row-slice approach.
  - **Why**: `controllers/import-master.js` already passes `tableConfig.headerRow` as a sixth argument (line 793), and the `error_mapping` master type sets `headerRow: 2` (line 325). Because the function signature only has five parameters, this value is silently dropped. The import then reads headers from row 0 instead of row 1, producing wrong column names and likely empty results for that master type. This is a functional bug.
  - **When**: Now
  - **Where**: `lib/xlsxImporter.js` line 70; `controllers/import-master.js` line 793

- **What**: Delete the commented-out code block at lines 153–155 (`/* if (dbColumn) { finalRow[dbColumn] = normalizeCellValue(...); } */`).
  - **Why**: Dead code adds noise and confuses future readers about which branch is active. The replacement immediately below it is already correct.
  - **When**: Nice to have
  - **Where**: `lib/xlsxImporter.js` lines 153–155

- **What**: Change `readXlsxFile` from `async function` to a plain `function` (or keep it async but document why).
  - **Why**: The function performs no `await` operations and does no I/O other than the synchronous `XLSX.readFile` call. Declaring it `async` wraps the return value in a Promise unnecessarily, and forces all callers to `await` it even though no actual asynchrony occurs. If a future custom reader were to make a network call this should be revisited.
  - **When**: Nice to have
  - **Where**: `lib/xlsxImporter.js` line 70

- **What**: Merge the nearly-identical `parseMotorProductCoverMatrix` and `parseCvProductCoverMatrix` into one function that accepts the product-code row index as a parameter.
  - **Why**: The two functions are identical except for which raw row index contains product codes (index 0 vs index 1). Any bug fix or formatting change must be applied twice, and the duplication is easy to miss.
  - **When**: Next quarter
  - **Where**: `lib/xlsxImporter.js` lines 199–251

- **What**: Similarly, merge `parseDocTypeKyc` and `parseDocTypeMismatch` (lines 318–393) into one function parameterised by the marker string (`"Document Code"` vs `"Mismatch Code"`) and output field names.
  - **Why**: Same structure, same scanning logic, same blank-row guard — only the sentinel string and two output field names differ.
  - **When**: Next quarter
  - **Where**: `lib/xlsxImporter.js` lines 318–393

- **What**: Replace the `if (customReader === "…") return …` chain (lines 92–131) with a dispatch map (`const readers = { previousPolicyCodeMatrix: parsePreviousPolicyMatrix, … }`).
  - **Why**: The current chain already handles 10 named readers. Each new reader requires another `if` block. A map makes additions O(1) and makes the full list of supported readers visible at a glance.
  - **When**: Nice to have
  - **Where**: `lib/xlsxImporter.js` lines 92–131

- **What**: Add inline comments to `parseApiFieldMaster` (lines 397–422) explaining why columns 5, 6, and 7 (rather than 1, 2, 3) are used for `field_description`, `character_length`, and `field_type`.
  - **Why**: The skipped columns (1–4) are presumably intermediate/unused columns in the spreadsheet template, but there is no comment explaining this. A future maintainer who receives a revised template will not know whether those indices are intentional.
  - **When**: Nice to have
  - **Where**: `lib/xlsxImporter.js` lines 408–419

## Open questions

- What is the purpose of columns 1–4 in the API field master sheet that are skipped by `parseApiFieldMaster`? Are they always blank, or do they contain data that is intentionally excluded?
- Should `readXlsxFile` support reading from a Buffer (in-memory) rather than a file path? The older `lib/parseExcel.js` already accepts a Buffer via `XLSX.read`. Aligning the two might allow future callers to skip writing the upload to disk.
- Are there plans to add more custom-reader types? If so, a dispatch map (see optimization above) would be worth doing before the next addition.
