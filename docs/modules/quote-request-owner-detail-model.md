# Quote Request Owner Detail Model

## What this module does
This module provides the database access layer for the `quote_request_owner_detail` table, which stores the vehicle owner's personal information collected during a motor insurance quote request. It holds identity details (name, gender, date of birth, PAN), contact details (mobile number, email), and address details (city, state, pincode) that are tied to a specific quote request.

## Why this module exists
Insurance providers need owner/policyholder personal details to generate quotes and draft proposals. Separating this data into its own table (rather than embedding it in the main `quote_request` row) keeps the schema normalised and allows the owner record to be updated or extended independently of other quote data. It follows the same fan-out pattern used by the vehicle-detail and policy-detail companion tables.

## When this module runs / is used
- **Quote creation**: called once per new motor quote request in `controllers/motor-quote-request.js` when the customer submits a quote request form. The `add()` method inserts a single row inside the same database transaction that creates the parent `quote_request`, vehicle-detail, and policy-detail rows.
- **Quote-to-API mapping**: called during every outbound Digit insurer API call in `services/insurers/digit/digit.mapper.js`. The `findByQuery()` method fetches the owner row by `quote_request_id` so the mapper can populate policyholder fields (name, address, contact, KYC fields like PAN and DOB) in Digit's request payload.

## How it fits in

**Depends on:**
- `shared-library` (GitHub private package) — supplies `MysqlQuoteRequestOwnerDetailsModel`, the Sequelize base class that defines the underlying `quote_request_owner_detail` table schema and ORM connection.
- `sequelize` — ORM used internally for all query methods.

**Used by:**
- `controllers/motor-quote-request.js` — writes the owner record at quote creation time.
- `services/insurers/digit/digit.mapper.js` — reads the owner record when building Digit API request payloads for quotes and proposals.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/quote-request-owner-detail.js` | The entire module — extends the shared-library base class with `add`, `update`, `find`, `findAllCount`, `findById`, and `findByQuery` methods, and exports an instantiated singleton. |

## Optimization opportunities

- **What**: Remove or mark as internal the four unused methods — `update`, `findAllCount`, `find`, and `findById`.
  **Why**: Only `add` and `findByQuery` are called anywhere in the codebase. The remaining four methods are dead code that increases the module's apparent surface area, makes audits harder, and can mislead future developers into thinking the owner record is updated through this model when it is not.
  **When**: Next quarter
  **Where**: `models/mysqldb/quote-request-owner-detail.js`, lines 17–48

- **What**: Add transaction support to the `update` method (pass `transaction` as an optional second argument, mirroring `add`).
  **Why**: If an `update` is ever added to the quote-creation flow it must participate in the same transaction as the parent `quote_request` insert. Without this the update could commit even when the parent transaction rolls back, leaving orphaned or inconsistent data.
  **When**: Nice to have (implement before the method is actually used)
  **Where**: `models/mysqldb/quote-request-owner-detail.js`, lines 17–23

- **What**: Add a database-level unique index on `quote_request_id` in the shared-library schema.
  **Why**: The business logic assumes one owner-detail row per quote request, and `findByQuery` always returns the first match. Without a unique constraint, a bug or retry could silently insert duplicate rows and `findByQuery` would then return stale data.
  **When**: Next quarter
  **Where**: shared-library `database-tables.sql` (`quote_request_owner_detail` table definition)

- **What**: Add at least a smoke test covering `add` and `findByQuery` with a test database.
  **Why**: There are currently zero tests for this model. The owner row feeds directly into insurer API payloads; a schema change or misconfigured column mapping would not be caught until a live API call fails.
  **When**: Next quarter
  **Where**: `tests/api/routes/` (new file: `quote-request-owner-detail.spec.js`)

## Open questions

- The shared-library is not available locally (not committed to this repository), so the exact column types, nullable constraints, and indexes on `quote_request_owner_detail` could not be confirmed. A maintainer should verify whether a unique index on `quote_request_id` already exists in the shared-library schema.
- The `update` method is defined but never called. It is unclear whether there is a planned feature (e.g., allowing customers to amend owner details after initial submission) that requires it, or whether it is simply scaffolding that can be removed.
- The class name uses the plural form `QuoteRequestOwnerDetailsModel` while the exported key is `MysqlQuoteRequestOwnerDetailsModel` (also plural). The companion models (`QuoteRequestVehicleDetailsModel`, `QuoteRequestPolicyDetailsModel`) follow the same plural naming, so this is consistent within the project — but it diverges from the singular table name `quote_request_owner_detail`. No action needed unless the team decides to standardise naming.
