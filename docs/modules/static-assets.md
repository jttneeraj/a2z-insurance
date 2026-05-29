# Static Assets

## What this module does

This module holds the server-side HTML templates, browser-served static files, and static reference data that the Express application exposes or uses internally. It covers the EJS view templates in `views/`, the runtime-only file-storage tree rooted at `public/`, the file-upload staging directories under `uploads/`, and a small JSON reference file in `json-data/`.

## Why this module exists

Express needs a designated location for view templates (used by its `res.render()` mechanism), for static files served directly over HTTP (images, CSS, client-side JS, generated exports), and for temporary disk storage when handling multipart file uploads. Keeping these paths well-defined prevents scattered hard-coded paths across the codebase. The `json-data/` folder was added to hold reference lookup tables that may be needed by controllers without a database round-trip.

## When this module runs / is used

- **`views/`** — Express resolves these templates when any controller calls `res.render()`. In the current codebase no controller does so (all responses are JSON), but the 404/error flow in `app.js` was originally scaffolded to render `error.ejs` and could be re-wired to do so again.
- **`public/`** — Served on every incoming HTTP request via `express.static` (configured in `app.js:64`). Also written to at runtime: Excel exports land in `public/storage/exports/` (`lib/excel.js:3`), and temporary upload files are staged in `public/storage/temp/` (`routes/index.js:10`).
- **`uploads/`** — Written to at runtime when admin staff upload master-data files (`uploads/master-files/` via `routes/master-import.js:9`) or commission-grid spreadsheets (`uploads/commission-grid/` via `routes/commission-grid.js:12`).
- **`json-data/mcc-code.json`** — Not currently imported anywhere; appears to be passive reference data checked into the repo for future use.

## How it fits in

- **Depends on**: none — these are purely data/template files with no runtime imports.
- **Depended on by**:
  - `app.js` — registers `views/` as the view directory and `public/` as a static-file root.
  - `lib/excel.js` — writes generated spreadsheets to `public/storage/exports/`.
  - `routes/index.js` — stages temp uploads in `public/storage/temp/`.
  - `routes/master-import.js` — stages master-data uploads in `uploads/master-files/`.
  - `routes/commission-grid.js` — stages commission-grid uploads in `uploads/commission-grid/`.
  - `middlewares/upload.js` — intends to write to `public/uploads/` (currently broken; see Optimization opportunities).

## Key files

| File | Purpose |
|---|---|
| `views/index.ejs` | Minimal HTML placeholder rendered at the root route; contains no dynamic data. |
| `views/error.ejs` | Error page template that would display `message`, `error.status`, and `error.stack`; currently bypassed because the error handler returns JSON instead of calling `res.render`. |
| `json-data/mcc-code.json` | 29-entry lookup table of Merchant Category Codes (ISO standard codes used to classify merchants in payment processing); not imported by any module at this time. |
| `public/` *(runtime-only, gitignored)* | Root for all browser-served static files, generated Excel exports, and temporary upload staging; the directory does not exist in the repository but is created by the deployment or runtime environment. |
| `uploads/` *(runtime-only, not in repo)* | Staging directory for inbound Excel files processed by the master-import and commission-grid controllers. |

## Optimization opportunities

- **What**: Define a global `__basedir` (e.g. `global.__basedir = __dirname;` near the top of `app.js`) or replace `__basedir` in `middlewares/upload.js:15` with `path.join(__dirname, '..')`.
  **Why**: `middlewares/upload.js` references `__basedir` but that variable is never declared anywhere in the codebase. Any request that triggers this middleware will throw `ReferenceError: __basedir is not defined`, silently breaking file uploads that use this middleware.
  **When**: Now
  **Where**: `middlewares/upload.js:15`

- **What**: Add `public/storage/temp/.keep`, `public/storage/exports/.keep`, `public/uploads/.keep`, `uploads/master-files/.keep`, and `uploads/commission-grid/.keep` as committed empty placeholder files and remove the now-redundant `.gitignore` exception lines for them.
  **Why**: The `.gitignore` already references these paths with `!` exceptions for `.keep` files, but no `.keep` files are committed. At startup the directories are absent, causing runtime errors when `lib/excel.js` or the upload routes first try to write a file. The `entrypoint.sh` pre-creates `logs/` subdirs for this same reason; the same pattern should apply here.
  **When**: Now
  **Where**: `.gitignore`, `public/storage/`, `uploads/`

- **What**: Either wire `views/error.ejs` into the error handler in `app.js` or delete the `views/` directory entirely.
  **Why**: The EJS view engine is configured (`app.js:59–60`) and two templates exist, but no code path ever calls `res.render()`. Keeping dead templates creates confusion for new contributors. If the API is JSON-only, removing the view engine setup removes a dependency (`ejs` package) and eliminates the confusion.
  **When**: Next quarter
  **Where**: `views/`, `app.js:59–60`

- **What**: Either import `json-data/mcc-code.json` in the module that needs it or remove the file.
  **Why**: `mcc-code.json` has no consumers. Orphaned data files bloat the repository and mislead maintainers about what is actively used.
  **When**: Nice to have
  **Where**: `json-data/mcc-code.json`

- **What**: Replace the dual `express.static` mounts in `app.js:64–65` (`public/` and `tests/`) with a single, intentional mount; remove the `tests/` static mount in non-test environments.
  **Why**: Serving the `tests/` directory as static files in production exposes test fixtures and spec files over HTTP. This is almost certainly unintentional and is a mild information-disclosure risk.
  **When**: Next quarter
  **Where**: `app.js:65`

## Open questions

- Is `json-data/mcc-code.json` intended for a future payment-integration feature (e.g. validating merchant codes in a KYC or payment flow), or is it a leftover from an earlier design that was abandoned?
- Are the `public/` subdirectories (`storage/temp`, `storage/exports`, `uploads/`) supposed to be pre-created by `entrypoint.sh` (as is done for `logs/services/*`) or by some other deployment step? The current `entrypoint.sh` does not create them.
- Is `middlewares/upload.js` still used by any route, or has it been superseded by the inline Multer configurations in `routes/master-import.js` and `routes/commission-grid.js`? No route currently imports it directly.
