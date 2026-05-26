# Quote Request Model

## What this module does

This module provides the database access layer for the `quote_request` table, which is the top-level record created when a customer initiates a motor insurance quote. It stores the minimal header information — a generated quote reference number, the linked customer lead, the insurance type and product chosen, the current status of the request, and the channel through which it arrived (web, app, etc.). All other quote data (vehicle details, owner details, policy details) is stored in related child tables managed by sibling models.

## Why this module exists

A quote request acts as the parent anchor for the entire motor insurance flow. Every downstream step — generating insurer quotes, selecting a plan, creating a proposal, completing KYC, making payment, and retrieving the policy — looks up a `quote_request` row by its primary key to validate that the flow is in the right state and to thread audit data together. Having a dedicated model keeps the database access for this central table isolated and easy to modify without touching the larger controllers.

## When this module runs / is used

- **On quote creation**: Called by the `motor-quote-request` controller when a customer submits a new quote request. The model's `findAllCount()` is called first to generate the next sequential `quote_request_no` (format: `QT-YYYYMMDD-000001`), then `add()` is called inside a database transaction that also writes the three child detail rows.
- **On every subsequent motor flow step**: Called by `motor-quotes`, `motor-proposal`, `motor-kyc`, `motor-payment`, and `motor-policy` controllers via `findById()` to fetch the parent record and verify its existence before continuing.
- **On status updates**: Called via `update()` by `motor-quotes` and `motor-proposal` controllers to advance the `quote_status` field as the customer progresses through the journey.

## How it fits in

**Depends on:**
- `shared-library` (`MysqlQuoteRequestsModel` base class) — provides the Sequelize model definition, table mapping, and database connection.
- `sequelize` (`Op`, `QueryTypes`) — imported for query operators (used in `findAllCount`'s `LIKE` clause for the date prefix).

**Depended on by:**
- `motor-quote-request` controller — creates records and counts existing ones for number generation.
- `motor-quotes` controller — reads the request to validate quote generation; writes status updates.
- `motor-proposal` controller — reads the request across plan selection, proposal creation, and proposal update flows; writes status updates.
- `motor-kyc` controller — reads the request to validate KYC submission.
- `motor-payment` controller — imports `mysqldb` for transaction management (does not call model methods directly).
- `motor-policy` controller — imports `mysqldb` for transaction management (does not call model methods directly).

## Key files

| File | Description |
|------|-------------|
| `models/mysqldb/quote-request.js` | The only file in this module. Extends the shared-library base class and exports a singleton instance with five methods: `add`, `update`, `findAllCount`, `findById`, and `find`. |

## Optimization opportunities

- **What**: Add `transaction` support to the `update()` method (give it a second `transaction = null` parameter and pass it to `this.model.update()`), matching the pattern already used in `add()`.
  - **Why**: Currently, `update()` is called in `motor-quotes` and `motor-proposal` to advance `quote_status` inside multi-step operations, but those calls cannot participate in a database transaction. If a later step fails and the caller rolls back, the status update is already committed — leaving the record in an incorrect state.
  - **When**: Now
  - **Where**: `models/mysqldb/quote-request.js`, line 19–26

- **What**: Fix the race condition in sequential `quote_request_no` generation by switching from `findAllCount + count + 1` to a database-level auto-increment sequence or a `SELECT ... FOR UPDATE` lock.
  - **Why**: Two concurrent requests that both hit `findAllCount()` before either calls `add()` will receive the same count and generate duplicate `quote_request_no` values. The `QT-YYYYMMDD-000001` format implies guaranteed uniqueness, but the current implementation only enforces it by accident at low traffic volumes. A DB-level unique constraint alone will cause an unhandled insert error rather than silently skipping; a sequence or `SELECT MAX() + 1 FOR UPDATE` resolves both correctness and the error path.
  - **When**: Now
  - **Where**: `controllers/motor-quote-request.js`, lines ~305–312 (in `MysqlQuoteRequestsModel.findAllCount` call and the `quoteRequestNo` derivation); `models/mysqldb/quote-request.js` may need a new `findMaxSequenceForDate()` helper.

- **What**: Replace the positional-parameter signature of `find(attributes, conditions, order_by, start, limit)` with a single options object.
  - **Why**: Callers must remember argument order and pass `null` placeholders for unused slots, which makes calls brittle and hard to read. A named-options pattern (`{ attributes, where, order, offset, limit }`) is self-documenting and consistent with the Sequelize API it wraps.
  - **When**: Next quarter
  - **Where**: `models/mysqldb/quote-request.js`, line 38–46 (and any call sites in controllers)

- **What**: Add a no-test warning comment or, better, write at least a unit-test stub for `findAllCount` + the number-generation logic.
  - **Why**: There are no test files anywhere in the repository that exercise this model. The `quote_request_no` generation logic is business-critical (customer-facing reference number, used in downstream insurer calls) and has a concurrency bug described above — it is the highest-risk untested path in the motor flow.
  - **When**: Next quarter
  - **Where**: `tests/api/routes/insurance/` (per the `npm test` glob pattern in `CLAUDE.md`)

## Open questions

- What database-level constraints (unique indexes, foreign keys) exist on the `quote_request` table? These are defined in the shared-library's `database-tables.sql`, which was not available in this environment. Knowing whether `quote_request_no` has a `UNIQUE` constraint would clarify how the duplicate-number race condition currently manifests in production (silent duplicate vs. insert error).
- Is there a planned migration to bring `quote_status` transitions under a formal state-machine guard? The current code sets status strings directly without validating legal transitions, which could allow a record to skip from `DRAFT` straight to `PAYMENT` if a controller bug or direct API call bypasses the flow order.
- Which controllers, if any, call the `find()` method (the paginated list query)? The grep result showed only `findById` and `update` in downstream controllers; `find()` may be unused outside admin tooling or dead code.
