# Quote Request Vehicle Detail Model

## What this module does
This module provides the database access layer for the `quote_request_vehicle_detail` table. It stores all vehicle-specific information collected at the start of the motor insurance quoting journey — registration number, RTO code, make/model/variant, fuel type, engine and chassis numbers, manufacturing year, and related identifiers. Each row is tied to exactly one quote request.

## Why this module exists
The motor insurance quoting process needs to store vehicle data separately from owner and policy data so that each concern can be captured, validated, and updated independently. Splitting the quote request into three detail tables (vehicle, owner, policy) avoids a single wide table and makes it easier to extend or re-use each piece later in the proposal and KYC stages.

## When this module runs / is used
- **Written once** when a customer submits `POST /api/customer/motor/quote-request/add`. The `motor-quote-request` controller creates this row inside a database transaction that simultaneously creates `quote_request`, `quote_request_owner_detail`, and `quote_request_policy_detail` rows.
- **Read during quote generation and proposal creation** by `digit.mapper.js#getQuoteDetails()`. Every time the Digit insurance adapter needs to build an API request payload — whether for a quick quote or a full proposal — it calls `findByQuery({ quote_request_id })` to pull this row and map its fields (registration number, RTO code, engine number, chassis number, manufacture date, etc.) into Digit's expected format.

## How it fits in

**Depends on:**
- `shared-library` (GitHub private package) — provides `MysqlQuoteRequestVehicleDetailsModel`, the Sequelize base class that wires up the `quote_request_vehicle_detail` table definition, column types, and database connection.

**Used by:**
- `controllers/motor-quote-request.js` — calls `add()` to persist the vehicle row when a new quote request is created.
- `services/insurers/digit/digit.mapper.js` — calls `findByQuery()` to read vehicle data when building Digit API payloads for quotes and proposals.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/quote-request-vehicle-detail.js` | The only file in this module. Defines `QuoteRequestVehicleDetailsModel`, extends the shared-library base class, adds CRUD methods, and exports a singleton instance. |

## Optimization opportunities

- **What**: Remove the unused import of `QueryTypes` (and `Op`) at line 1.
  **Why**: Both are imported but never referenced in this file — `Op` is unused and `QueryTypes` is especially irrelevant since there are no raw SQL queries. Unused imports add noise and mislead readers.
  **When**: Nice to have.
  **Where**: `models/mysqldb/quote-request-vehicle-detail.js:1`

- **What**: Add a `transaction` parameter to `update()` to match the signature of `add()`.
  **Why**: `add()` accepts an optional `transaction` argument for atomic multi-table writes. `update()` does not, so any future code that calls `update()` inside a transaction will silently operate outside it, risking partial writes. Making the signatures consistent prevents a latent correctness bug.
  **When**: Next quarter (low risk today because `update()` is currently uncalled, but it should be fixed before it is ever used).
  **Where**: `models/mysqldb/quote-request-vehicle-detail.js:17-23`

- **What**: Remove or clearly mark the hardcoded fallback strings in `digit.mapper.js#buildVehicle()`.
  **Why**: `licensePlateNumber` defaults to `"KA01ED4289"`, `engineNumber` to `"ENGINE12345"`, and `vehicleIdentificationNumber` to `"CHASSIS12345"` when the saved vehicle detail is missing those values. These are test/development placeholder values that will silently reach the Digit production API if vehicle details are incomplete, resulting in incorrectly issued policies.
  **When**: Now — this is a data-correctness risk in production.
  **Where**: `services/insurers/digit/digit.mapper.js:398-421`

- **What**: Remove `find()`, `findById()`, and `findAllCount()` if they remain unused.
  **Why**: These three methods are defined in the model class but are not called from anywhere in the current codebase. Dead code increases maintenance surface and creates uncertainty about which interface is actually stable.
  **When**: Nice to have (audit usage first in case shared-library or future features reference them indirectly).
  **Where**: `models/mysqldb/quote-request-vehicle-detail.js:25-49`

- **What**: Add at least one integration test covering the `add()` + `findByQuery()` round-trip.
  **Why**: There are currently no tests for this model. Because it participates in a multi-table transaction that is central to the motor insurance flow, a regression here would silently break quote generation for all insurers.
  **When**: Next quarter.
  **Where**: `tests/api/routes/` (new file, following the project's mocha test layout)

## Open questions

- The `quote_request_vehicle_detail` table schema (column types, nullable constraints, indexes) is defined in the shared-library repo, which is not installed in this working tree. It would be worth confirming whether `quote_request_id` has a unique index — `findByQuery` assumes at most one row per quote request, and a missing unique constraint could allow silent duplicate rows.
- `vehicle_code` in this table appears to be a Digit-specific insurer vehicle maincode rather than a generic vehicle identifier. If other insurers are added, it is worth clarifying whether `vehicle_code` is insurer-specific or should live in the insurer request tables instead.
