# Member Model

## What this module does

The member model provides a database access layer for the `members` table, which stores identity verification details (PAN number and Aadhaar number) for users of the platform — agents, brokers, and other internal staff. It extends the base `MysqlMemberModel` class from the shared library and adds uniqueness-check queries to enforce that no two users in the same role share a PAN or Aadhaar number.

## Why this module exists

KYC (Know Your Customer) regulations in India require that agents and distributors be identifiable by unique government IDs. Storing PAN and Aadhaar separately in a `members` table, linked to `users` via `user_id`, keeps identity data separate from login credentials and follows the shared-library's pattern of one model file per database table.

## When this module runs / is used

The model is instantiated as a singleton at import time (the module file calls `new Member()` on export). However, as of the current codebase state, no controller or service file imports or calls this model directly. It is defined and exported but not yet wired into any API route. The `profile.js` model's raw SQL query does reference the `members` table in a JOIN — confirming the table exists in the database — but it does so independently via `mysqldb.query`, not through this model's methods.

## How it fits in

- **Depends on**: `shared-library` (provides `MysqlMemberModel` base class and `mysqldb` Sequelize connection)
- **Used by**: Nothing in this repository currently imports the `MysqlMemberModel` singleton — it is dormant pending the implementation of agent/user onboarding or profile management routes
- **Related model**: `models/mysqldb/profile.js` — queries the same `members` table via raw SQL in a JOIN with `users` and `roles`

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/member.js` | The entire module — defines the `Member` class, adds KYC uniqueness-check queries, exports the singleton `MysqlMemberModel` |

## Optimization opportunities

- **What**: Fix the transaction parameter in `updateWithTransactionMode` and `updateByIdTransactionMode` — both pass `t` as the third argument to `this.model.update()`, but Sequelize's `update(values, options)` only accepts two arguments; the transaction must be inside the options object as `{ where: ..., transaction: t }`
  - **Why**: As written, the transaction is silently dropped — updates inside these methods will never participate in a parent transaction, risking data inconsistency if the caller expects atomic rollback on failure
  - **When**: Now (correctness bug — but currently masked because no code calls these methods yet)
  - **Where**: `models/mysqldb/member.js` lines 63–71 (`updateWithTransactionMode`) and lines 80–87 (`updateByIdTransactionMode`)

- **What**: Add `isPanExistWithRole` and `isAadhaarExistWithRole` symmetry — the model has `isPanExistWithRole` (checks PAN without excluding a specific user) but the Aadhaar equivalent is only available in the "ExceptThisUser" variant (`isAadhaarExistWithRoleExceptThisUser`), leaving no way to run a plain Aadhaar existence check on new-user creation
  - **Why**: The asymmetry will force any create-path caller to work around the missing method or duplicate its query logic inline, increasing inconsistency risk
  - **When**: Next quarter (needed when onboarding APIs are implemented)
  - **Where**: `models/mysqldb/member.js` — add a new method alongside `isPanExistWithRole`

- **What**: Replace raw SQL in `isPanExistWithRole`, `isPanExistWithRoleExceptThisUser`, and `isAadhaarExistWithRoleExceptThisUser` with Sequelize `findOne` calls using `include` (associations) rather than hand-written JOIN strings
  - **Why**: Raw SQL bypasses Sequelize's query-building safety net (column name typos, dialect differences) and makes it harder to unit-test; parameterized Sequelize queries are equally safe against SQL injection and easier to maintain
  - **When**: Nice to have
  - **Where**: `models/mysqldb/member.js` lines 16–51

- **What**: Wire the module into the codebase — identify the agent/user onboarding controller (not yet present) and import this model there
  - **Why**: An exported singleton that is never imported provides no runtime value; if the `members` table is in production, writes to it must be going through some other path (possibly the shared-library layer directly), which bypasses any custom uniqueness checks defined here
  - **When**: Now (architectural gap — clarification needed first; see Open questions)
  - **Where**: Whichever controller eventually handles agent registration/update flows

## Open questions

1. **Is anything else writing to the `members` table?** The `profile.js` model joins against `members` in a read query, implying the table has data, but no write path in this repo calls `MysqlMemberModel.create()`. Is the shared-library itself (or a separate service) responsible for populating `members` rows, or is the agent onboarding flow simply not yet implemented?

2. **Transaction parameter convention**: Other models in the codebase use the same `createWithTransactionMode(data, t)` / `updateWithTransactionMode(data, conditions, t)` pattern. If callers pass the raw Sequelize `Transaction` object (not a wrapped options object), all of these methods are broken in the same way. Is `t` expected to be a plain transaction or `{ transaction: t }`? Clarification would determine whether this is a codebase-wide bug or an intentional pattern that the base class handles.

3. **`findOneByQuery` vs. base class**: The base `MysqlMemberModel` in the shared library likely already provides a `findOne` method. Does the local `findOneByQuery` override or supplement it? If it duplicates a base method, it can be removed.
