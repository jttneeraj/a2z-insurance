# Constants

## What this module does

This module is the single source of truth for all shared, application-wide constant values. It defines HTTP status codes, lookup arrays used for UI dropdowns (plan types, statuses, commission charge types, etc.), a binary company logo embedded as a Base64 string, and a placeholder for a banking credential. All values are assembled under `constants/index.js` for convenient import.

## Why this module exists

Hardcoding magic numbers (e.g., `200`, `400`, `500`) and repeated string literals (e.g., `"ACTIVE"`, `"INACTIVE"`) across controllers and utilities creates maintenance risk — a future change must be found and updated in every location. Centralising these values in one module means a change is made once and propagates everywhere automatically. It also makes intent obvious: `HTTP_STATUS.OK` is clearer than the bare number `200`.

## When this module runs / is used

The constants are loaded once at application start-up through Node.js's `require` cache. They are then available synchronously to any file that imports them. There is no runtime recalculation; the values are fixed for the lifetime of the process.

## How it fits in

| Direction | Module |
|-----------|--------|
| Depends on | Nothing — pure value definitions, no external dependencies |
| Used by | `utils/response-handler.js` (imports `HTTP_STATUS` directly from `constants/common.js`) |
| Used by | `lib/excel.js` (imports `commonConstants.LOGO_64` via `constants/index.js`) |
| Intended for (unused) | Controllers, services, and frontend APIs that need the dropdown arrays (`PLAN_TYPES`, `STATUSES`, etc.) |

## Key files

| File | Purpose |
|------|---------|
| `constants/common.js` | Defines `HTTP_STATUS` (frozen object), `PLAN_TYPES`, `PLAN_YEARS`, `STATUSES`, `COMMISSION_CHARGE_TYPE`, `ALLOWED`, and `LOGO_64` (Base64 company logo PNG) |
| `constants/credential.js` | Placeholder for `YESBANK_ZWITCH_DEBIT_ACCOUNT_ID`; currently set to an empty string and not exported by `index.js` |
| `constants/index.js` | Re-exports `common.js` as `commonConstants`; acts as the public entry point for the module |

## Optimization opportunities

- **What**: Extract `LOGO_64` from `common.js` into a static file (e.g., `public/logo.png` or `static-assets/logo.b64.txt`) and read it at startup via `fs.readFileSync`.
  **Why**: The Base64 string is several kilobytes of data embedded directly in JavaScript source. Every `require` of `constants/common.js` loads this entire string into memory, and the file is difficult to diff or review in version control. Storing it as a static asset keeps source files small and makes the logo easy to replace without touching business logic.
  **When**: Next quarter
  **Where**: `constants/common.js`, line 62 (the `LOGO_64` assignment)

- **What**: Remove or document the five unused dropdown arrays: `PLAN_TYPES`, `PLAN_YEARS`, `STATUSES`, `COMMISSION_CHARGE_TYPE`, and `ALLOWED`.
  **Why**: A search across all non-`node_modules` JavaScript files shows zero imports of these arrays outside the constants files themselves. Dead code inflates cognitive load for new maintainers who assume everything exported is actively used. If these are reserved for a future API (e.g., a `/dropdowns` endpoint), a short comment stating that intent is sufficient; if not, they should be deleted.
  **When**: Next quarter
  **Where**: `constants/common.js`, lines 1–53

- **What**: Complete or remove `constants/credential.js`.
  **Why**: The file contains a single empty string (`YESBANK_ZWITCH_DEBIT_ACCOUNT_ID = ""`), is never exported from `constants/index.js`, and is never imported anywhere. It appears to be an abandoned placeholder for a Yes Bank / Zwitch payment integration. Leaving it as-is creates confusion about whether the integration exists. Either finish the integration (move the value to an env var) or delete the file.
  **When**: Now
  **Where**: `constants/credential.js`, entire file

- **What**: Standardise the import path used by all consumers.
  **Why**: `utils/response-handler.js` imports directly from `constants/common.js` while `lib/excel.js` uses the `constants/index.js` barrel. Both work, but mixing import styles makes refactoring harder — if `common.js` is ever split, both paths must be updated independently. Adopting a single convention (preferably via `constants/index.js`) keeps the internal layout of the module free to change without affecting callers.
  **When**: Nice to have
  **Where**: `utils/response-handler.js`, line 1; `lib/excel.js`, line 2

- **What**: Apply `Object.freeze()` to the exported arrays (`PLAN_TYPES`, `PLAN_YEARS`, `STATUSES`, `COMMISSION_CHARGE_TYPE`, `ALLOWED`) the same way it is already applied to `HTTP_STATUS`.
  **Why**: Plain JavaScript arrays can be mutated by any caller (e.g., `.push()`, `.splice()`). A mistaken mutation would silently corrupt the shared value for all subsequent callers in the same process. Freezing prevents accidental modification at negligible runtime cost.
  **When**: Nice to have
  **Where**: `constants/common.js`, lines 1–53

## Open questions

- Are `PLAN_TYPES`, `PLAN_YEARS`, `STATUSES`, `COMMISSION_CHARGE_TYPE`, and `ALLOWED` intentionally kept for a future `/dropdowns` or similar configuration endpoint, or are they legacy remnants from a removed feature?
- What was the Yes Bank / Zwitch integration in `credential.js` intended to do, and is that payment channel still planned?
