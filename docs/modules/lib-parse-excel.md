# lib-parse-excel

## What this module does

`lib/parseExcel.js` exports a single helper function, `parseExcelFile(buffer)`, that reads a raw binary buffer containing an Excel file and returns the contents of the **first sheet** as an array of plain JavaScript objects (one object per data row, with column headers as keys). It is a thin wrapper around the `xlsx` npm package.

## Why this module exists

The function was created to provide a simple, reusable way to convert an in-memory Excel buffer into structured data — for example, a file that has just been uploaded by a user or downloaded from S3. Keeping this one-liner in its own file makes it easy to swap or extend the underlying `xlsx` library call in one place rather than repeating it throughout the codebase.

## When this module runs / is used

**As of the current codebase, `parseExcelFile` is not imported or called by any other file.** The function is defined and exported but has zero active consumers. No route, controller, service, or test requires this module. A functionally identical internal function named `parseExcel` exists inside `lib/aws.js` (lines 57–62), which uses it privately inside `downloadAndParseFile` but never delegates to `lib/parseExcel.js`.

## How it fits in

**Depends on:**
- `xlsx` npm package — reads the binary buffer and converts the spreadsheet to JSON.

**Depended on by:**
- Nothing at present. The module is currently dead code.

**Related modules:**
- `lib-aws` (`lib/aws.js`) — contains a duplicated copy of the same Excel-parsing logic used when downloading files from S3.
- `lib-xlsx-importer` (`lib/xlsxImporter.js`) — the active, full-featured Excel parser used by `master-import` and similar controllers. It supports column-to-database-field mapping, header normalization, optional sheet selection, and over ten custom row-format parsers.
- `lib-excel` (`lib/excel.js`) — handles the *opposite* direction: generating and writing Excel files (not parsing them).

## Key files

| File | Purpose |
|---|---|
| `lib/parseExcel.js` | Exports `parseExcelFile(buffer)`: reads an Excel binary buffer and returns the first sheet as a JSON array. 11 lines total. |

## Optimization opportunities

- **What**: Remove `lib/parseExcel.js` entirely, or integrate it properly by having `lib/aws.js` import and use it instead of its private duplicate.
  - **Why**: The file is dead code — zero imports anywhere. The identical logic already exists in `lib/aws.js` at lines 57–62. Two copies of the same 5-line function invite drift. If `lib/aws.js` imported `parseExcelFile`, the duplication would disappear and the module would have at least one real caller.
  - **When**: Now
  - **Where**: `lib/parseExcel.js` (entire file), `lib/aws.js` lines 57–62

- **What**: If the module is kept, replace it with a re-export of `lib/xlsxImporter.js`'s `readXlsxFile` or add buffer-mode support to `xlsxImporter.js`.
  - **Why**: `lib/xlsxImporter.js` is the actively maintained, feature-rich Excel parsing path (column mapping, custom readers, multi-sheet support). Having two separate Excel-parsing helpers increases the chance that one becomes stale. Consolidating under `xlsxImporter.js` or exposing a buffer variant of its `readXlsxFile` function would give callers one canonical entry point.
  - **When**: Next quarter
  - **Where**: `lib/parseExcel.js`, `lib/xlsxImporter.js`

- **What**: Add a sheet-selection parameter (or at minimum a warning) so that callers are not silently limited to the first sheet only.
  - **Why**: `xlsx` workbooks routinely contain multiple sheets. Silently discarding all but the first is a hidden constraint that can cause data loss bugs if a caller ever passes a multi-sheet workbook expecting full coverage. `lib/xlsxImporter.js` already handles this correctly via its `sheetName` parameter.
  - **When**: Nice to have (only relevant if the module is kept and given active callers)
  - **Where**: `lib/parseExcel.js` line 5

## Open questions

- Was `lib/parseExcel.js` intentionally replaced by `lib/xlsxImporter.js`, or was it simply forgotten when the import path in `lib/aws.js` was never updated? A maintainer should confirm whether this file should be deleted or promoted to an active utility.
- `lib/aws.js` currently uses the `aws-sdk` v2 package, which AWS has put into maintenance mode. The `downloadAndParseFile` function that calls the internal `parseExcel` duplicate should be migrated to AWS SDK v3 (`@aws-sdk/client-s3`) — this is separate from the duplication issue but worth flagging alongside it.
