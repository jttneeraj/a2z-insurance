# API Model

## What this module does

The `api-model` module is a thin Sequelize database model wrapper for an `api` table defined in the shared library. It exposes four data-access methods — look up a record by primary key, query by arbitrary conditions, create a new record, and update an existing record by ID. The module follows the same pattern as every other model in this project: a local class extends a shared-library base, is instantiated as a singleton, and is exported for controllers to consume.

## Why this module exists

The shared library defines a database table called `api` (via `MysqlApiModel`). This local wrapper was created to give the application its own access point to that table, consistent with the project convention that each table has a matching `models/mysqldb/<name>.js` file. Based on the naming and the four generic CRUD methods it provides, the table likely stores records about API integrations, API keys, or registered API endpoints — though this cannot be confirmed from the code alone (see Open questions).

## When this module runs / is used

**This module is currently unused.** No controller, service, or route in the application imports it. The file exists in the repository but is never required anywhere outside of its own definition. It would run only if another module called `require('../models/mysqldb/api')` and invoked one of its four methods, which nothing currently does.

## How it fits in

**Depends on:**
- Shared library (`MysqlApiModel`, `mysqldb`) — provides the Sequelize model instance bound to the `api` table and the database connection.

**Depended on by:**
- Nothing in the current codebase. No controller, service, route, or test file imports this module.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/api.js` | The only file in this module. Defines the `Api` class, adds `findById`, `findByCondition`, `add`, and `updateById` methods on top of the shared-library base, and exports an instantiated singleton as `MysqlApiModel`. |

## Optimization opportunities

- **What**: Determine whether the `api` table and this model are still needed; if not, delete `models/mysqldb/api.js`.
  **Why**: Dead code is a maintenance liability — it raises questions during onboarding ("what calls this?"), clutters search results, and may create a false impression that an `api` table is actively used.
  **When**: Now
  **Where**: `models/mysqldb/api.js` (entire file)

- **What**: If the `api` table is needed for a future feature, add a `delete` / `deleteById` method alongside the existing four, and add a `findAllCount` method to support paginated list endpoints — both are missing compared to peer models (e.g. `product-config.js`, `insurer.js`).
  **Why**: Partial CRUD surfaces make it easy to call a missing method and get a runtime error rather than a compile-time one.
  **When**: Nice to have (only relevant if the module is activated)
  **Where**: `models/mysqldb/api.js:9–33`

- **What**: Add consistent spacing and a missing newline at the top of the file (line 1 is blank, braces in constructor and method bodies omit surrounding blank lines in some places but not others).
  **Why**: Minor formatting inconsistency compared to peer model files; purely cosmetic.
  **When**: Nice to have
  **Where**: `models/mysqldb/api.js`

## Open questions

- What does the `api` database table store? The shared-library base (`MysqlApiModel`) and its SQL schema are not available in this repository (the shared library is a private GitHub dependency installed at build time via `GITHUB_TOKEN`), so the column names and business purpose of this table are unknown from the code alone.
- Was this model used in an earlier version of the application and then orphaned, or was it scaffolded as preparation for a planned feature that was never built?
- If the `api` table stores API integration credentials or configuration, is there overlap with the `insurer-api-credential` module, which serves a similar purpose for insurer-specific API credentials?
- Should this file be deleted, or is it intentionally kept as scaffolding for an upcoming feature? A maintainer should confirm before any cleanup.
