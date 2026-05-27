# Insurer Previous Policy Type Master Model

## What this module does

This module provides a database access layer for the `insurer_previous_policy_type_master` table, which stores an insurer-specific catalog of previous policy type codes and their human-readable labels. Each record maps a code (for example, a Digit-issued identifier like `TP_1YR`) to a display label (for example, "Third-Party 1 Year"). The module exposes a singleton model instance used throughout the app to look up and validate these codes.

## Why this module exists

Motor insurance renewals require knowing what kind of policy the vehicle had previously (comprehensive, third-party only, etc.). Different insurers use their own proprietary code systems for these types rather than a shared standard. This module holds the insurer-keyed version of that catalog so the system can validate that a quote request's `previous_policy_type` field is a code the relevant insurer actually recognises. It lives as its own model rather than being embedded in a controller because the same lookup is needed in multiple places (quote validation and master-data import).

## When this module runs / is used

- **Quote request validation** — Every time a customer submits a motor quote request that includes a `previous_policy_type` field, `services/motor-quote-master-validation.js` calls `findByQuery` to confirm the supplied code exists in this table. If it does not, the request is rejected before reaching any insurer.
- **Master data import** — When an admin posts an Excel file to the master-import endpoint with `masterType=previous_policy_type_master`, the "Description" sheet is parsed and its rows are upserted into this table. The same import also populates a related table (`insurer_product_previous_policy_type_map`) that records which policy types are allowed per insurer/product combination.

## How it fits in

- **Depends on**: `shared-library` — provides the `MysqlInsurerPreviousPolicyTypeMasterModel` base class with Sequelize ORM wiring and the underlying database connection.
- **Used by**: `services/motor-quote-master-validation.js` — calls `findByQuery` to validate the `previous_policy_type` field in quote payloads.
- **Referenced by**: `controllers/import-master.js` — defines the Excel-to-table column mapping for bulk import; the actual write is handled by the `master-import` model.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/insurer-previous-policy-type-master.js` | Defines and exports the `InsurerPreviousPolicyTypeMasterModel` class with a `findByQuery` method and its instantiated singleton. |

## Optimization opportunities

- **What**: Remove the `findByQuery` override — it replicates `this.model.findOne({ where: conditions })`, which is almost certainly already provided by the shared-library base class (every other model in the codebase adds the exact same single-method override).
  **Why**: Dead code elimination; reduces maintenance surface. If the base class already defines `findByQuery`, the override silently shadows it without adding behaviour.
  **When**: Nice to have
  **Where**: `models/mysqldb/insurer-previous-policy-type-master.js:11-15`

- **What**: Add insurer and product scoping to the validation lookup in `motor-quote-master-validation.js`. Currently the lookup only checks whether the code exists in `insurer_previous_policy_type_master` at all, ignoring the `insurer_product_previous_policy_type_map` table that records per-insurer, per-product allowances.
  **Why**: A policy type code valid for one insurer's product could pass validation even when submitted for a different insurer or product. The `insurer_product_previous_policy_type_map` table already models the allowed combinations but is never queried.
  **When**: Next quarter
  **Where**: `services/motor-quote-master-validation.js:91-99`

- **What**: Clarify and reconcile the dual `previous_policy_type` validation — `motor-quote-master-validation.js` validates the same field twice: first against the generic `previous_policy_type` table (line 32) and then against `insurer_previous_policy_type_master` (line 91). If both tables are needed, their relationship and when each check should fire is not documented in the code.
  **Why**: The duplicate check is confusing for maintainers, can produce redundant error messages, and may silently hide cases where the two tables disagree.
  **When**: Next quarter
  **Where**: `services/motor-quote-master-validation.js:32-40` and `services/motor-quote-master-validation.js:91-99`

- **What**: Replace bare `console.log` calls in `lib/xlsxImporter.js` with structured Winston logging.
  **Why**: These fire on every master-data import (including this one) and bypass the application's log-level controls and transport configuration, polluting production output.
  **When**: Nice to have
  **Where**: `lib/xlsxImporter.js:78,138-139`

## Open questions

- What is the intended relationship between the generic `previous_policy_type` table and `insurer_previous_policy_type_master`? They appear to overlap in purpose. Is `insurer_previous_policy_type_master` a strict subset, a superset, or a completely separate namespace?
- Is `insurer_product_previous_policy_type_map` expected to be used for validation in the near future, or is it purely for display/configuration purposes?
- Does the shared-library base class (`MysqlInsurerPreviousPolicyTypeMasterModel`) already define a `findByQuery` method? If so, the override in this file can be deleted.
