# Company Model

## What this module does

This module defines the data access layer for the `companies` table. It wraps a base class from the shared library and provides methods to create, look up, list, filter, and update company records. Company records represent the brokerage or agency organizations that use this platform — each company is linked to a user account (via `user_id`) and holds fields such as name, email, mobile, address, logo, and seal image.

## Why this module exists

The platform supports multiple companies (broker firms, agents, or channel partners) as tenants or users of the insurance portal. This model encapsulates all direct database interactions with the `companies` table so that any controller or service that needs company data has a single, consistent access point rather than writing ad-hoc queries.

## When this module runs / is used

Currently **no controller or route in this repository imports this model**, meaning it is not actively called at runtime. The model is fully defined and ready for use, but no live request path triggers it. It would be invoked whenever a company management feature is built — for example, listing registered companies in an admin dashboard, fetching company details for a logged-in agent, or creating a new company account.

## How it fits in

- **Depends on**: `MysqlCompanyModel` and `mysqldb` from the `shared-library` package (the base Sequelize model and database connection)
- **Used by**: Nothing in the current codebase — no controller, route, or service imports this module's export

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/company.js` | The only file in this module. Defines the `Company` class, adds query methods on top of the shared-library base, and exports a singleton instance as `MysqlCompanyModel`. |

## Optimization opportunities

- **What**: Remove the two legacy backup methods `countRecordBkp` and `findByRawQueryBkp`.
  **Why**: These are clearly marked as old copies (the `Bkp` suffix) and have been superseded by `countRecord` and `findByRawQuery`. They add noise, increase maintenance surface, and could confuse contributors about which method to call. No code path calls them.
  **When**: Now
  **Where**: `models/mysqldb/company.js`, lines 12–33 (`countRecordBkp`) and lines 59–90 (`findByRawQueryBkp`)

- **What**: Extract the repeated SELECT column list shared by `findByRawQuery`, `findByRawQueryForDownload`, and `findByRawQueryBkp` into a single constant.
  **Why**: All three methods open with the identical string `"select u.id as user_id, u.name as user_name, c.id as id, company_name, company_email, company_address, company_mobile, c.status, company_logo, seal_image, c.created_at "`. If a column is added or renamed, it must be updated in three places; a missed update silently omits the column in some code paths.
  **When**: Next quarter
  **Where**: `models/mysqldb/company.js`, lines 61, 93, 111

- **What**: Sanitize or validate the `order_by` parameter before string-concatenating it into raw SQL in `findByRawQuery` and `findByRawQueryForDownload`.
  **Why**: Concatenating an unsanitized `order_by` value directly into an SQL string (e.g. `mainQuery += " ORDER BY " + order_by`) is a SQL injection risk. Because no controller currently calls these methods, this is not an active vulnerability today — but it will become one as soon as a caller is wired up. Acceptable fixes are: an allowlist of valid column names, Sequelize's `order` option, or a parameterized approach.
  **When**: Now (fix before wiring a caller)
  **Where**: `models/mysqldb/company.js`, lines 95–96 and lines 112–113

- **What**: Wire this model to at least a stub admin controller and route, or remove it if company management is handled elsewhere.
  **Why**: A model with no callers creates maintenance debt — it is tested against assumptions that may drift from the actual schema, and future developers cannot tell whether it is intentionally dormant or simply forgotten. Making the intent explicit (either "this is live" or "this is planned") prevents confusion.
  **When**: Next quarter
  **Where**: `models/mysqldb/company.js` (model), `controllers/` and `routes/` (missing files)

## Open questions

- Is company management handled by a separate service or a different repository, making this model intentionally unused here?
- What is the difference between a "company" in this `companies` table and an "insurer" in the `insurers` table? Are companies broker firms while insurers are the underwriters, or do they overlap?
- The `companies` table joins to a `users` table (`join users as u on c.user_id = u.id`), but there is no `member` or `profile` equivalent join. Does a company always have exactly one owner user, or can multiple users belong to one company?
- Are `company_logo` and `seal_image` stored as file paths, S3 URLs, or base64 blobs? The field names appear in the SELECT list but the upload/storage mechanism is not visible here.
