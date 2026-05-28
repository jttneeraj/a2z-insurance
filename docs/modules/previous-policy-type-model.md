# Previous Policy Type Model

## What this module does
This module defines the data-access layer for the `previous_policy_type` table, which stores a catalog of policy-type codes (e.g. "Comprehensive", "Third-Party Only") that a vehicle owner may have held on their prior insurance policy. It exposes a single query helper to look up one record by arbitrary conditions and exports a pre-instantiated singleton for use by other services.

## Why this module exists
When a customer renews or switches motor insurance, the application needs to record and validate what type of policy they had previously. A dedicated lookup table (rather than hardcoded strings) allows valid policy types to be managed centrally in the database. The model follows the project-wide pattern of wrapping a shared-library base class to keep local customizations isolated from the shared infrastructure.

## When this module runs / is used
**Currently, this module is not required (imported) anywhere in the active codebase.** The only reference to `MysqlPreviousPolicyTypeModel` in application code appears in `services/motor-quote-master-validation.js` inside the dead function `validateMotorQuoteMasters_` (trailing underscore indicates it was deprecated). That function is never exported and never called, and it references `MysqlPreviousPolicyTypeModel` without importing it — calling it would throw a `ReferenceError` at runtime. In practice, the active validation path (`validateMotorQuoteMasters`) validates previous policy types via `MysqlInsurerPreviousPolicyTypeMasterModel` from the `insurer-previous-policy-type-master` model instead.

## How it fits in

**Depends on:**
- `shared-library` (via `SHARED_LIBRARY_PATH` env var) — provides `MysqlPreviousPolicyTypeModel` base class and the `mysqldb` connection instance

**Depended on by:**
- Nothing in the active application code (see "When this module runs / is used" above)
- `services/motor-quote-master-validation.js` — referenced but not imported, inside a dead legacy function `validateMotorQuoteMasters_`

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/previous-policy-type.js` | Defines `PreviousPolicyTypeModel`, extends the shared-library base, adds `findByQuery(conditions)`, and exports an instantiated singleton as `MysqlPreviousPolicyTypeModel` |

## Optimization opportunities

- **What**: Remove `models/mysqldb/previous-policy-type.js` entirely, or at minimum remove the dead `validateMotorQuoteMasters_` function in `services/motor-quote-master-validation.js`
  **Why**: The model is never imported anywhere in active code. The only reference is inside a dead, never-exported function that would throw a `ReferenceError` if executed. Retaining dead modules increases maintenance surface, misleads future developers about active data flows, and may cause confusion during schema migrations.
  **When**: Now
  **Where**: `models/mysqldb/previous-policy-type.js` (entire file); `services/motor-quote-master-validation.js` lines 7–66 (`validateMotorQuoteMasters_` function)

- **What**: Confirm whether the underlying `previous_policy_type` database table is still used or can be dropped
  **Why**: If the application has fully migrated to `insurer_previous_policy_type_master` (which `information.md` and the active validation code both suggest), the old table is dead schema. Leaving orphaned tables in the database wastes storage and confuses schema audits.
  **When**: Next quarter
  **Where**: Database schema (check `node_modules/shared-library/database-tables.sql` once dependencies are installed); `information.md` line 5 for context on the migration

- **What**: Add an explicit import guard or lint rule (`no-unused-vars` / import linting) to catch models that are defined but never required
  **Why**: This module slipped through undetected precisely because no tool flagged the missing import or the zero-consumer model. A lightweight ESLint rule or dead-code scan would surface these automatically on future changes.
  **When**: Nice to have
  **Where**: Project root ESLint / lint config (none currently exists at root level)

## Open questions

- Is the `previous_policy_type` database table still populated or referenced by any reporting queries, stored procedures, or external ETL pipelines outside this application? If so, the model should be retained with a clear comment; otherwise both the model and the table should be removed.
- Was `validateMotorQuoteMasters_` intentionally left as a reference/fallback, or is it safe to delete? The underscore naming and the missing import both suggest intent to deprecate, but a maintainer confirmation is needed before deletion.
- Does the shared library's `MysqlPreviousPolicyTypeModel` serve any other application in the monorepo that might still depend on this table?
