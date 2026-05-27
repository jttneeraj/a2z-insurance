# Insurer NCB Master Model

## What this module does

This module provides database access to the `insurer_ncb_master` table, which stores the No Claim Bonus (NCB) code-to-percentage mappings for each insurer. NCB is the discount applied to a motor insurance premium when the previous policy had no claims — different insurers use different code strings (e.g., "ZERO", "TWENTY", "FIFTY") to represent the same standard percentage values. This model lets the application look up whether a given NCB percentage is valid for a specific insurer.

## Why this module exists

Insurers do not expose NCB as a plain number; they each define their own named codes. The application needs a per-insurer lookup table to validate customer-supplied NCB values and to translate between the insurer's code scheme and the numeric percentage used internally. Keeping this in a dedicated model (rather than hard-coding the values) allows the NCB catalogue to be updated per insurer via the admin import flow without a code change.

## When this module runs / is used

- **During quote validation**: Called by `services/motor-quote-master-validation.js` every time a motor quote request is submitted and the payload includes a `previous_ncb_percent` field. The model checks that the submitted percentage exists in the insurer's NCB table before the request is accepted.
- **During master-data import**: Indirectly used when an admin uploads "NCB Master.xlsx" through the `/api/admin/master-import` endpoint. The import controller references the `insurer_ncb_master` table name and the `ncbMaster` custom reader, which parses the file and upserts rows via the generic import pipeline.

## How it fits in

**Depends on:**
- `shared-library` (`MysqlInsurerNcbMasterModel`) — base class providing the Sequelize model, DB connection (`mysqldb`), and standard query helpers.

**Depended on by:**
- `services/motor-quote-master-validation.js` — calls `findByQuery({ ncb_percent })` to validate submitted NCB values.
- `controllers/import-master.js` — references `insurer_ncb_master` as the target table for the `ncb_master` import type.
- `lib/xlsxImporter.js` — contains `parseNcbMaster()` and `mapNcbPercent()`, which transform the Excel sheet into row objects before they are inserted into this table.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/insurer-ncb-master.js` | Thin model class extending the shared-library base; exposes `findByQuery(conditions)` for single-row lookup by any column combination. |
| `services/motor-quote-master-validation.js` | Primary consumer; queries this model (line 112) to validate `previous_ncb_percent` on incoming quote requests. |
| `controllers/import-master.js` | Declares the `ncb_master` import configuration (lines 244–257), including the target table, unique keys (`insurer_id`, `ncb_code`), and custom reader name. |
| `lib/xlsxImporter.js` | Contains `parseNcbMaster()` (line 276) and `mapNcbPercent()` (line 295), which parse the Excel upload and map code strings (e.g., "TWENTY_FIVE") to numeric percentages (25). |

## Optimization opportunities

- **What**: Remove the dead function `validateMotorQuoteMasters_` from `services/motor-quote-master-validation.js` (lines 7–65).
  **Why**: This older function is never exported or called — it uses `MysqlNcbMasterModel` (the generic NCB model) rather than `MysqlInsurerNcbMasterModel`, and the file only exports `validateMotorQuoteMasters` (the newer version). Dead code creates confusion about which NCB model is authoritative.
  **When**: Now.
  **Where**: `services/motor-quote-master-validation.js`, lines 7–65.

- **What**: Replace the `mapNcbPercent` lookup object in `lib/xlsxImporter.js` with a shared constant, and align it with the inverse mapping in `services/insurers/digit/digit.mapper.js` (`mapNcbToDigit`, line 36).
  **Why**: The two functions encode the same NCB code ↔ percent relationship (one maps code→percent, the other maps percent→code), but they live in separate files with no shared source of truth. A divergence (e.g., adding a new NCB tier) would need to be updated in both places.
  **When**: Next quarter.
  **Where**: `lib/xlsxImporter.js` lines 295–313, `services/insurers/digit/digit.mapper.js` lines 36–43.

- **What**: Add a `findAll` or `findByInsurer(insurerId)` method to the model for any future use case that needs the full NCB catalogue for a given insurer (e.g., populating a dropdown).
  **Why**: The current `findByQuery` only calls `findOne`, so retrieving all valid NCB options for an insurer requires a separate query path or bypassing this model entirely.
  **When**: Nice to have.
  **Where**: `models/mysqldb/insurer-ncb-master.js`.

- **What**: Add at least one unit test covering `validateMotorQuoteMasters` with a valid and an invalid NCB percent.
  **Why**: There are no tests anywhere in the repository for this validation path. A regression here would silently accept bad NCB values at quote time.
  **When**: Next quarter.
  **Where**: New file `tests/api/routes/insurance/motor-quote-master-validation.spec.js` (following the existing test-file naming convention).

## Open questions

- The `insurer_ncb_master` table uses `insurer_id` as a key, implying NCB codes are per-insurer. However, `motor-quote-master-validation.js` calls `findByQuery({ ncb_percent: value })` without filtering by `insurer_id`. Is NCB validation intended to be insurer-agnostic at the quote-request stage (before an insurer is chosen), or is the insurer filter missing by accident?
- What is the difference in scope between `insurer_ncb_master` (this module) and the `ncb_master` table referenced in the now-dead `validateMotorQuoteMasters_` function? Was `ncb_master` a generic/legacy table that `insurer_ncb_master` is meant to replace?
