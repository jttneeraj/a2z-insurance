# Profile Model

## What this module does

This module provides the data-access layer for the `profiles` table, which stores extended profile information for users in the system (agents, managers, outlet owners, etc.). It wraps a shared-library base class with custom query methods for reading and writing profile records, including a rich lookup that joins the user hierarchy (parent supervisor and manager) together with role and member data.

## Why this module exists

User identity in this system is split across multiple tables: `users` holds authentication identity, `members` holds onboarding data (PAN, Aadhaar, outlet name, address), and `profiles` holds extended personal or business profile fields. Keeping profile data in its own model follows the same pattern used by the `member-model` — each concern has one owner. The `profiles` table is defined in the shared library so it can be reused across Excela2Z services.

## When this module runs / is used

Based on reading the code, this model is **not currently imported or called by any controller, service, or route** in the repository. It was added as part of the initial commit and appears to be scaffolded for a future user-profile feature (likely a "My Profile" or "Agent Profile" screen). It would be invoked whenever the application needs to display or update an agent's profile details, or fetch hierarchical user information (who a user reports to, and who manages them).

## How it fits in

- **Depends on**: `shared-library` (`MysqlProfileModel`, `mysqldb`) for the ORM base class and database connection; Sequelize `QueryTypes` for raw SQL execution.
- **Depended on by**: Nothing in the current codebase imports or calls this model. It is dormant scaffolding.

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/profile.js` | The sole file: defines the `Profile` class, all query methods, and exports the singleton instance as `MysqlProfileModel`. |

## Optimization opportunities

- **What**: Fix the broken transaction wiring in all `*TransactionMode` methods (`createWithTransactionMode`, `updateWithTransactionMode`, `updateByIdTransactionMode`, `updateByIdTransactionMode`).\
  **Why**: Each of these passes the Sequelize transaction object `t` as a positional third argument (e.g. `this.model.update(data, { where: conditions }, t)`), but Sequelize's ORM methods only accept two arguments — the transaction must be inside the options object as `{ where: conditions, transaction: t }`. As written, the transaction is silently ignored, meaning these methods are **not actually transactional** and can cause partial-write bugs in multi-step operations.\
  **When**: Now\
  **Where**: `models/mysqldb/profile.js`, lines 53–83

- **What**: Rewrite `findParentAndRelationByUserId` to handle users who are missing a parent, relation, member, or role record.\
  **Why**: The query uses five INNER JOINs (`users → users (parent) → users (relation) → members → roles`). If any one of those relationships is absent (e.g. a top-level user with no `parent_id`, or a user not yet in `members`), the query returns an empty result with no error. The caller has no way to distinguish "user not found" from "user exists but has incomplete data", which can produce silent failures or confusing API responses. Switching to LEFT JOINs and adding a fallback NULL-check, or decomposing into smaller queries, would make failures visible.\
  **When**: Next quarter\
  **Where**: `models/mysqldb/profile.js`, lines 12–17

- **What**: Either wire this model into a profile controller/route or mark it explicitly as unreleased scaffolding.\
  **Why**: Dead code that is never imported accumulates silently and confuses new maintainers who wonder whether to maintain it, update it when the schema changes, or test it. A brief comment block, a TODO in `work_info.md`, or an actual route implementation would eliminate the ambiguity.\
  **When**: Next quarter\
  **Where**: `models/mysqldb/profile.js` (entire file); `work_info.md` (roadmap section)

## Open questions

- What columns does the `profiles` table have? The schema is defined in the shared library (`excela2zsuvidha/a2z-shared-library`), which is not installed locally. The model methods suggest fields like `user_id`, but the full column list (and whether there are any NOT NULL constraints relevant to the `create` method) is unknown without reading the shared-library source.
- Is there a planned "Agent Profile" feature that this model is waiting for, or was it created for a use-case that has since been abandoned?
- The `findParentAndRelationByUserId` query reads `outlet_name` and address fields from the `members` table but the column names (`outlet_name`, `permanent_address`, `shop_address`) are unaliased raw column references — do these match the actual `members` table column names in the current schema?
