# Quote Request Policy Detail Model

## What this module does
This module provides the database access layer for the `quote_request_policy_detail` table. That table stores the policy-specific inputs a customer provides when starting a motor insurance quote: the type of policy scenario (new vehicle, renewal, rollover), dates the new policy should cover, and details about any previous policy — insurer, expiry date, no-claim bonus percentage, and past claims. One row exists per quote request.

## Why this module exists
The quote-request fan-out splits a single customer submission into three detail tables (vehicle, owner, policy) so that each concern is stored and queried independently without one table becoming unwieldy. The policy detail table specifically isolates the underwriting inputs that differ between a brand-new registration and a renewal or rollover — data the insurer integration layer needs to price the policy correctly.

## When this module runs / is used
- **Written once** — when a customer submits a new motor quote request (`POST /api/customer/motor/quote-request`). The `motor-quote-request` controller creates this row atomically inside a database transaction that also creates the parent `quote_request` row and its vehicle and owner detail rows.
- **Read on every outbound insurer call** — `digit.mapper.js` fetches this row (via `findByQuery`) each time it builds a request payload for the Digit insurer API, using the stored dates, NCB, and previous-insurer fields to fill in the Digit-specific format.

## How it fits in

**Depends on:**
- `shared-library` — the base class `MysqlQuoteRequestPolicyDetailsModel` (from `SHARED_LIBRARY_PATH/services/models`) owns the Sequelize model definition and the underlying table schema.
- `mysqldb` — the Sequelize connection pool, also imported from shared-library and re-exported by this module.

**Depended on by:**
- `controllers/motor-quote-request.js` — writes the row during quote-request creation.
- `services/insurers/digit/digit.mapper.js` — reads the row to assemble Digit API request payloads for quote, proposal, and related flows.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/quote-request-policy-detail.js` | The only file in this module. Defines `QuoteRequestPolicyDetailsModel`, registers its methods, instantiates a singleton, and re-exports it as `MysqlQuoteRequestPolicyDetailsModel`. |

## Optimization opportunities

- **What**: Add transaction support to the `update()` method (accept an optional `transaction` parameter and pass it to `this.model.update()`).
  **Why**: The `add()` method already supports transactions for atomicity; `update()` does not, leaving callers unable to roll back an in-progress update alongside related table changes. The gap is not exploited today but becomes a risk if a future flow needs to amend policy details transactionally.
  **When**: Next quarter
  **Where**: `models/mysqldb/quote-request-policy-detail.js`, line 17–23

- **What**: Remove or comment out the unused `find()` and `findAllCount()` methods.
  **Why**: Neither method is called anywhere in the codebase (confirmed by grep). Dead code increases maintenance surface and can mislead future developers into thinking there are list-query use cases that don't actually exist yet.
  **When**: Nice to have
  **Where**: `models/mysqldb/quote-request-policy-detail.js`, lines 25–39

- **What**: Have `update()` return or check the affected-row count and throw (or resolve to a meaningful value) when no rows are updated.
  **Why**: `this.model.update()` returns `[affectedRows]`; the current wrapper discards this entirely. If the target `id` does not exist, the update silently does nothing — callers have no way to detect a missing row without a second query.
  **When**: Nice to have
  **Where**: `models/mysqldb/quote-request-policy-detail.js`, lines 17–23

- **What**: Add at least one unit test covering `add()` with and without a transaction, and `findByQuery()` with a known `quote_request_id`.
  **Why**: No test file exists for this model. The model is in the critical path for every new quote request; a regression in the shared-library base class or the Sequelize upgrade path would go undetected.
  **When**: Next quarter
  **Where**: `tests/api/routes/` (or a new `tests/models/` directory following existing test patterns)

## Open questions

- The shared-library repo holds the actual Sequelize model definition and column list for `quote_request_policy_detail`. The `selected_idv` field assignment in `digit.mapper.js` line 437 is commented out (`// policyDetail?.selected_idv`), suggesting the IDV selection flow is incomplete or deferred — a maintainer should confirm whether `selected_idv` is populated and used downstream.
- The `current_third_party_policy` and `original_previous_policy_type` fields are written during creation but never read back in any current code path. Confirm whether these are reserved for a future insurer adapter or can be dropped.
