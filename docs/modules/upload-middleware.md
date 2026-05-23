# Upload Middleware

## What this module does

`middlewares/upload.js` configures a Multer file-upload handler that accepts PDF and Excel files, saves them to a disk folder under `public/uploads/`, and exports the configured uploader so Express route files can attach it as a per-route middleware. Multer is the standard Node.js library for handling `multipart/form-data` requests (i.e. HTML form uploads or API calls that include a file).

## Why this module exists

The application needs to accept file uploads in at least two places: the master-data importer (Excel/TXT spreadsheets containing reference data such as RTO codes and vehicle models) and the commission-grid importer (Excel files containing premium commission tables). Centralising the Multer configuration in one middleware file was the intended pattern so every upload route shares the same file-type rules and storage destination.

## When this module runs / is used

**In practice: never.** No route file currently imports `uploadFile` from `middlewares/upload.js`. The two active file-upload routes define their own inline Multer instances instead:

- `routes/master-import.js` — creates its own `multer({ dest: "uploads/master-files/", fileFilter: ... })` and uses it directly on `POST /api/admin/master/master-file-import`.
- `routes/commission-grid.js` — creates its own `multer({ dest: "uploads/commission-grid/" })` and uses it directly on `POST /api/admin/commission-grid/import`.

Additionally, `app.js` creates a third Multer memory-storage instance (lines 102–105) but has the `app.use(upload.any())` call commented out.

The result is three separate, independent Multer configurations for a feature that could be served by one shared module.

## How it fits in

**Depends on:**
- `multer` npm package (v1.4.5-lts.1 per `package.json`)
- A global variable `__basedir` — which is never set anywhere in the codebase (see Optimization opportunities)

**Depended on by:**
- Nothing currently. Intended consumers were `routes/master-import.js` and `routes/commission-grid.js`, but both bypass this module.

## Key files

| File | Purpose |
|------|---------|
| `middlewares/upload.js` | Defines disk-storage Multer config (destination `public/uploads/`, MIME filter for PDF + Excel) and exports a single `uploadFile` instance — currently unused by any route |
| `routes/master-import.js` | Active upload consumer — defines its own inline Multer (accepts `.xlsx` and `.txt`, saves to `uploads/master-files/`) |
| `routes/commission-grid.js` | Active upload consumer — defines its own inline Multer (no file-type filter, saves to `uploads/commission-grid/`) |

## Optimization opportunities

### 1. Dead code — `middlewares/upload.js` is never imported

- **What**: Either wire `uploadFile` into the two active routes that need it, or delete the file entirely and document the per-route inline Multer pattern as the accepted approach.
- **Why**: Dead code misleads future maintainers into thinking uploads are configured centrally when they are not, and the file contains a crash-on-call bug (see item 2) that would surface the moment someone attempts to re-use it.
- **When**: Now
- **Where**: `middlewares/upload.js` (entire file); `routes/master-import.js` lines 7–40; `routes/commission-grid.js` lines 4–11

---

### 2. `__basedir` is undefined — crash-on-call

- **What**: Replace `__basedir + "/public/uploads/"` (line 14) with `path.join(__dirname, '../public/uploads/')`. `__basedir` is never assigned anywhere in `app.js` or any other entry-point file; calling this middleware would immediately throw `ReferenceError: __basedir is not defined`. The built-in `__dirname` variable (always available in every Node.js module) is the correct alternative.
- **Why**: Prevents a hard crash if the file is ever reactivated or re-imported.
- **When**: Now (if the file is kept rather than deleted)
- **Where**: `middlewares/upload.js` line 14

---

### 3. No file size limit on any upload endpoint

- **What**: Add a `limits: { fileSize: <N> }` option to each Multer instance. A value of 10–20 MB is appropriate for Excel/TXT files used as data imports; the commission-grid importer would rarely exceed 5 MB.
- **Why**: Without a size cap, a client (authenticated or not) can exhaust server disk space or memory by uploading arbitrarily large files. This is the most common Denial-of-Service vector for file-upload endpoints.
- **When**: Now
- **Where**: `routes/master-import.js` line 7 (`multer({ dest: ..., fileFilter: ... })` → add `limits`); `routes/commission-grid.js` line 9 (`multer({ dest: ... })` → add `limits`)

---

### 4. `commission-grid.js` has no file-type filter

- **What**: Add a `fileFilter` to the commission-grid Multer instance that restricts uploads to `.xlsx` files, matching the actual data the controller expects.
- **Why**: Without a filter, any file type — including executables or scripts — is accepted and written to disk at `uploads/commission-grid/`. While the controller will ultimately reject non-Excel content at parse time, the file is already on disk by then.
- **When**: Now
- **Where**: `routes/commission-grid.js` lines 9–11

---

### 5. Uploaded temp files are never deleted

- **What**: After each successful import, delete the temp file from `uploads/master-files/` or `uploads/commission-grid/` (use `fs.unlink(req.file.path, cb)` or `fs.promises.unlink(req.file.path)` in the controller's finally block).
- **Why**: Every import run leaves a file on disk permanently. On a busy instance these directories will grow without bound, eventually filling the disk. This is especially risky for the commission-grid endpoint which has no file-type filter.
- **When**: Next quarter
- **Where**: `controllers/import-master.js` (end of `importMasterXlsx`); `controllers/commission-grid.js` (end of `importCommissionGrid`)

---

### 6. Debug artifact in filename template

- **What**: Remove the `-palo-` literal from the filename template on line 19 of `upload.js`: `\`${Date.now()}-palo-${file.originalname}\`` should be `\`${Date.now()}-${file.originalname}\``.
- **Why**: The string is clearly a developer-era debug tag; it would surface in file paths and logs if this middleware were ever reactivated.
- **When**: Nice to have (only matters if the file is kept and activated)
- **Where**: `middlewares/upload.js` line 19

---

### 7. Three separate Multer configurations with no shared constants

- **What**: If the centralised-middleware approach is kept, extract common options (allowed MIME types, size limit, temp-file root path) into `constants/common.js` or a dedicated `config/upload.js` file so all upload points share one source of truth.
- **Why**: Currently the allowed-type list in `upload.js` (PDF + Excel) diverges from `master-import.js` (xlsx + txt only), and `commission-grid.js` allows everything. Divergence will grow as more upload endpoints are added.
- **When**: Next quarter
- **Where**: `middlewares/upload.js`, `routes/master-import.js`, `routes/commission-grid.js`

## Open questions

1. **Intended destination path**: `upload.js` saves to `public/uploads/` while the `.gitignore` preserves a `.keep` file at `public/storage/uploads/`. Is `public/storage/uploads/` the canonical upload directory, or is `public/uploads/` correct?
2. **`__basedir` convention**: Is there a plan to set `global.__basedir = __dirname` in `app.js` (a pattern used in some Express boilerplates)? If so, `upload.js` line 14 would work once that assignment is added; if not, the reference should be replaced with `__dirname`.
3. **Upload retention policy**: Should uploaded master-data files be retained for audit/replay purposes, or are they meant to be ephemeral temp files? The answer determines whether cleanup (item 5) is safe to add.
