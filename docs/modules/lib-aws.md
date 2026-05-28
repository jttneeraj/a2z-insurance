# lib-aws

## What this module does

`lib/aws.js` is the application's single abstraction layer over Amazon S3. It provides helper functions for uploading, moving, deleting, downloading, and generating short-lived share links for files stored in an S3 bucket. It also contains two utility functions for parsing CSV and Excel file contents once they have been downloaded from S3.

## Why this module exists

The motor insurance flow requires storing user documents (KYC signatures, policy PDFs, vehicle images) in cloud object storage. Centralising all S3 calls here means the rest of the codebase never has to import `aws-sdk` directly or repeat bucket/path configuration. It also provides the two-stage file-staging pattern — files land first in a temporary S3 prefix, then are moved to the permanent document prefix only after downstream validation succeeds.

## When this module runs / is used

Based on a full search of the codebase, **no other file currently imports `lib/aws.js`**. The module is present and functional but is not wired into any route, controller, or service at this time. Its exported functions would normally be called:

- **`uploadFileFromTempToUploadFolder`** — after KYC document validation succeeds, to promote uploaded files from the temp prefix to the permanent document prefix.
- **`getDownloadUrl`** / **`getDataObject`** — when serving policy PDFs or KYC documents back to the client.
- **`deleteFileFromAws`** / **`deleteMultipleObjects`** — when a proposal or lead is cancelled or documents need to be replaced.
- **`downloadAndParseFile`** — when an Excel or CSV master-data file is read directly from S3 rather than from local disk.

## How it fits in

| Direction | Module |
|-----------|--------|
| Depends on | `aws-sdk` (npm package, v2) |
| Depends on | `csv-parser` (npm package) |
| Depends on | `xlsx` (npm package) |
| Currently imported by | _nothing_ (module is unreferenced — see Open questions) |

Related lib files that overlap in responsibility:
- `lib/parseExcel.js` — implements identical buffer-to-JSON Excel parsing; see Optimization opportunities.
- `lib/xlsxImporter.js` — separate Excel import utility used by master-data routes.

## Key files

| File | Purpose |
|------|---------|
| `lib/aws.js` | Entire module; exports all S3 and file-parsing helpers |

### Exported functions

| Function | What it does |
|----------|-------------|
| `deleteFileFromAws(sourceFile)` | Deletes one object from the bucket; prepends `DOCUMENT_FOLDER_PATH` to the key |
| `getObjectFromS3(bucketName, key)` | Low-level S3 `getObject` returning the raw body buffer |
| `parseCsv(buffer)` | Parses a CSV buffer into an array of row objects |
| `parseExcel(buffer)` | Parses an Excel buffer into an array of row objects (first sheet only) |
| `downloadAndParseFile(bucketName, key)` | Downloads a `.csv`, `.xlsx`, or `.xls` from S3 and returns parsed rows |
| `deleteMultipleObjects(folderPath)` | Lists and bulk-deletes all objects under `upload/<folderPath>` in the bucket |
| `moveFile(sourceFile, newFileName)` | Copies an S3 object to a new key then deletes the original |
| `getDownloadUrl(file)` | Returns a pre-signed `getObject` URL valid for `DOWNLOAD_URL_EXPIRY` seconds |
| `getDataObject(file, name)` | Fetches an S3 object using the path `DOCUMENT_FOLDER_PATH/name/file` |
| `uploadFileFromTempToUploadFolder(signature, path)` | Moves one or more files from `TEMP_FOLDER_PATH` to `DOCUMENT_FOLDER_PATH`, accepting either a string or an array |

### Environment variables

| Variable | Purpose |
|----------|---------|
| `AWS_ACCESS_KEY` | IAM access key |
| `AWS_SECRET_KEY` | IAM secret key |
| `AWS_REGION` | S3 bucket region |
| `AWS_BUCKET_NAME` | Name of the S3 bucket |
| `DOCUMENT_FOLDER_PATH` | S3 prefix for permanent documents |
| `TEMP_FOLDER_PATH` | S3 prefix for staged/temporary uploads |
| `DOWNLOAD_URL_EXPIRY` | Pre-signed URL lifetime in seconds |

## Optimization opportunities

- **What**: Migrate from `aws-sdk` v2 to `@aws-sdk/client-s3` (AWS SDK v3).
  **Why**: AWS SDK v2 is in long-term support / maintenance mode. v3 is modular — only the S3 client needs to be imported — which reduces bundle size and enables tree-shaking. v3 also uses native `Promise` throughout with no `.promise()` shim needed.
  **When**: Next quarter.
  **Where**: `lib/aws.js` lines 1, 6–10, and every `s3.*().promise()` call.

- **What**: Fix `deleteFileFromAws` to be properly async and propagate errors instead of swallowing them.
  **Why**: The current implementation wraps the S3 call in a `try/catch` but the inner `.promise().then().catch()` chain is not awaited, so errors are silently lost and the caller always receives `undefined`. Any caller that depends on knowing whether deletion succeeded will get a false positive.
  **When**: Now (correctness bug).
  **Where**: `lib/aws.js` lines 13–32.

- **What**: Guard `deleteMultipleObjects` against an empty object list before calling `s3.deleteObjects`.
  **Why**: AWS S3 returns a `MalformedXML` error when `deleteObjects` is called with an empty `Objects` array. The current code does not check `object.Contents.length > 0` before building `objectKeys`, so deleting a non-existent or already-empty folder path throws.
  **When**: Now (runtime error on edge case).
  **Where**: `lib/aws.js` lines 82–101, specifically after the `objectKeys` assignment.

- **What**: Remove the duplicate `parseExcel` implementation and re-use `lib/parseExcel.js`.
  **Why**: `lib/aws.js` lines 57–62 and `lib/parseExcel.js` lines 3–9 are identical: both use `xlsx.read` on a buffer and call `sheet_to_json` on the first sheet. Having two copies means any future change (e.g. multi-sheet support, date formatting) must be applied in two places.
  **When**: Nice to have.
  **Where**: `lib/aws.js` lines 1–4 (imports) and 57–62 (`parseExcel` function body).

- **What**: Remove the unused `secretKey` parameter from `moveFile`.
  **Why**: `secretKey` is accepted by the function signature but never referenced in the body. It signals a half-finished feature to future readers and adds noise to call sites.
  **When**: Nice to have.
  **Where**: `lib/aws.js` line 147.

- **What**: Delete the large commented-out block (old `moveFile` implementation).
  **Why**: Lines 103–145 are a commented-out prior version of `moveFile`. Git history preserves it; the comment serves no documentation purpose and obscures the live code.
  **When**: Nice to have.
  **Where**: `lib/aws.js` lines 103–145.

## Open questions

1. **Why is this module unreferenced?** No file in the project currently imports `lib/aws.js`. It is unclear whether it was recently decoupled from callers (e.g. calls moved inline or delegated to the shared-library), or whether it has simply never been wired in and represents future-planned functionality. A maintainer should confirm whether it is safe to keep, integrate, or delete.

2. **Where should KYC documents actually land?** The `uploadFileFromTempToUploadFolder` function has logic for an optional `path` subdirectory under `DOCUMENT_FOLDER_PATH`, but without callers it is impossible to determine the intended folder layout for each document type. The expected path conventions should be documented.

3. **Pre-signed URL expiry value**: `DOWNLOAD_URL_EXPIRY` is read with `Number(process.env.DOWNLOAD_URL_EXPIRY)`. If the env var is absent this evaluates to `NaN`, which the AWS SDK may silently convert to a default or reject. Should there be a fallback?
