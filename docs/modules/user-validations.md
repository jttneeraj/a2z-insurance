# User Validations

## What this module does

This module provides three `express-validator` middleware chains that validate HTTP request data for user management endpoints: listing users, viewing a single user, and updating a user's profile. Each chain checks that the incoming values are in the correct format and, where needed, queries the database to confirm that the referenced user exists and that fields like email and mobile number are not already taken by another account.

## Why this module exists

Input validation is kept separate from controllers and routes so that the same rules can be reused across multiple route definitions without duplicating logic. Housing the chains in `validations/user.js` also makes it straightforward to audit exactly which fields are checked, what their constraints are, and how they respond when something is wrong.

## When this module runs / is used

The three exported chains are designed to be inserted into Express route definitions as middleware arrays, running before the route handler function. At the time of writing, **no route file currently imports or mounts these chains** — the user management endpoints they are meant to protect have not yet been wired up. The validations therefore exist as ready-to-use building blocks for a forthcoming user management feature.

## How it fits in

- **Depends on**:
  - `models/mysqldb/user` — `MysqlUserModel` for DB existence and uniqueness checks (see Open questions below)
  - `services/common` — imported but not used (dead import)
  - `express-validator` v7 — `check`, `param`, `checkExact` (only `check` and `param` are used)
  - `sequelize` — `Op.not` for the uniqueness query condition
- **Depended on by**:
  - No file currently imports this module. It is intended to be consumed by user management route definitions when those are added.

## Key files

| File | Purpose |
|------|---------|
| `validations/user.js` | The entire module — defines and exports `userListValidation`, `userViewValidation`, and `userInfoUpdateValidation` |

## Optimization opportunities

- **What**: Remove the unused `CommonService` import (line 4) and the unused `checkExact` import from `express-validator` (line 1).
  - **Why**: Dead imports increase startup time slightly and mislead readers into thinking these are used somewhere in the file.
  - **When**: Now
  - **Where**: `validations/user.js`, lines 1 and 4

- **What**: Create the missing `models/mysqldb/user.js` file (or fix the import path to point to wherever `MysqlUserModel` actually lives).
  - **Why**: `validations/user.js` requires `"../models/mysqldb/user"` (line 2), but no such file exists in `models/mysqldb/`. Any route that imports this validation module will crash immediately at startup with a `MODULE_NOT_FOUND` error. This is a critical correctness gap.
  - **When**: Now
  - **Where**: `validations/user.js` line 2; `models/mysqldb/user.js` (missing)

- **What**: Standardise error messages to use `req.t()` i18n keys throughout, not just in the `param('id')` validators.
  - **Why**: `userViewValidation` and `userInfoUpdateValidation` call `req.t('USER_NOT_FOUND')` for the user-existence check, but every other message in the file is a hardcoded English string. Mixing the two styles means some errors will be translated and others will not when the app is run in a non-English locale.
  - **When**: Next quarter
  - **Where**: `validations/user.js`, lines 11–83, 104–165

- **What**: Extract the repeated integer-validation regex `/^[0-9]+$/` into a shared constant and replace the redundant `value < 0` guard that follows it.
  - **Why**: The same regex appears four times (lines 10, 54, 65, 75). The `value < 0` check that follows each one (lines 13, 57, 68, 78) can never be true after the regex already rejects anything that is not a sequence of digits — it is dead code that adds visual noise.
  - **When**: Next quarter
  - **Where**: `validations/user.js`, lines 10–13, 54–57, 65–68, 75–79

- **What**: Add a proper email-format check (`.isEmail()`) to the `email` field in `userInfoUpdateValidation`.
  - **Why**: The current validation only checks that the email is between 3 and 35 characters and that it is not already in use — it does not verify that the value is actually an email address. A string like `"abc"` would pass all current checks and reach the database uniqueness query.
  - **When**: Next quarter
  - **Where**: `validations/user.js`, lines 108–122

- **What**: Apply `checkExact()` to reject unknown request fields in `userInfoUpdateValidation`.
  - **Why**: `checkExact` is already imported (line 1) but never called. Using it would prevent clients from sending unrecognised fields, which reduces the attack surface and makes the API contract more explicit.
  - **When**: Nice to have
  - **Where**: `validations/user.js`, line 1 and the `userInfoUpdateValidation` array

## Open questions

- **Where does `MysqlUserModel` come from?** The file requires `"../models/mysqldb/user"`, but that file does not exist in the repository. Is it meant to come from the shared-library package (like most other models), or is it a local model file that was never committed? This must be resolved before any route can use these validations.
- **Are these validations still the intended design?** The `sort_field` allowlist contains only `['id']` (line 22). Is that intentional, or should it include other fields like `name`, `email`, or `created_at`?
- **What is `total_records` doing as a query parameter?** `userListValidation` validates a `total_records` field. This is usually a server-computed value returned in responses, not something a client sends on a list request — it may be a design artefact worth revisiting.
