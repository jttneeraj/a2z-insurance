# Quote Insurer Request Model

## What this module does
This module is the data-access layer for the `quote_insurer_request` database table. Every time the system calls an external insurer's API to fetch a motor insurance quote, one row is written to this table capturing the outbound request — what was sent, to which endpoint, at what time, and whether it succeeded. It acts as the audit trail for all outbound insurer API calls during the quoting phase.

## Why this module exists
The motor insurance quoting process fans out to one or more insurer APIs per customer request. Capturing each outbound call in a dedicated table enables debugging failed quotes (what exactly was sent?), supports retry logic (how many times was this called?), and provides a linkage point so that the corresponding response record (`quote_insurer_response`) can be traced back to its originating request. Keeping this as a separate model follows the project's one-model-per-table convention and lets the data layer be extended independently of business logic.

## When this module runs / is used
This module is invoked during the quote generation step of the motor insurance flow. Specifically, `controllers/motor-quotes.js` calls `MysqlQuoteInsurerRequestsModel.add()` inside a database transaction immediately after the insurer service returns a quote result, regardless of whether that result was a success or a failure. The `add()` call is always the first write in that transaction — the request row is created before the response row so the response can reference it by foreign key.

## How it fits in
- **Depends on**: `shared-library` (`MysqlQuoteInsurerRequestsModel` base class provides the Sequelize model definition and table schema); `mysqldb` Sequelize instance from shared-library.
- **Depended on by**: `controllers/motor-quotes.js` (the only current consumer — calls `add()` at quote generation time).
- **Related sibling**: `models/mysqldb/quote-insurer-response.js` — stores the insurer's reply and holds a foreign key (`quote_insurer_request_id`) back to this table.

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/quote-insurer-request.js` | Defines `QuoteInsurerRequestsModel`, extends the shared-library base, and exports the instantiated singleton `MysqlQuoteInsurerRequestsModel`. |
| `controllers/motor-quotes.js` (lines 170–186) | The sole caller — constructs the row payload and calls `add()` within a Sequelize transaction during quote generation. |

**Fields written at creation** (from `motor-quotes.js`):
- `quote_request_id` — links to the parent quote request
- `insurer_id`, `insurer_product_id` — identifies which insurer and product was called
- `request_reference_no` — formatted as `REQ-<quote_request_no>`
- `api_endpoint`, `request_payload`, `request_headers` — full outbound HTTP call details
- `request_status` — defaults to `"SUCCESS"`; set from the insurer service's result
- `requested_at`, `response_received_at` — both set to `new Date()` at the time of logging
- `retry_count` — always hardcoded to `0`
- `error_message` — always `null` at creation, never updated later

## Optimization opportunities

- **What**: Remove or mark as internal-only the four unused query methods (`update`, `findAllCount`, `find`, `findById`, `findByQuery`). Only `add()` is ever called anywhere in the codebase.
  - **Why**: Dead code inflates the surface area, misleads readers into thinking these query paths are exercised, and creates maintenance burden if the table schema changes.
  - **When**: Nice to have
  - **Where**: `models/mysqldb/quote-insurer-request.js`, lines 18–50

- **What**: Populate `error_message` and update `request_status` on the existing request row when an insurer call fails, instead of leaving both fields as their initial values.
  - **Why**: Currently, a failed quote creates a request row with `request_status: "SUCCESS"` and `error_message: null` even when the insurer returned an error. This makes the audit trail misleading — reading the `quote_insurer_request` table alone cannot distinguish successful from failed calls.
  - **When**: Next quarter
  - **Where**: `controllers/motor-quotes.js`, lines 170–223; `models/mysqldb/quote-insurer-request.js` line 18 (`update` would need a `transaction` parameter added)

- **What**: Add a `transaction` parameter to the `update` method, matching how `add` already works.
  - **Why**: If `update` is ever called inside a transaction (e.g. to fix the status-update gap above), it will operate outside the transaction boundary, risking partial writes if the transaction rolls back.
  - **When**: Next quarter
  - **Where**: `models/mysqldb/quote-insurer-request.js`, line 18

- **What**: Replace the `console.log("🚀 ~ generate ~ payload:", payload)` debug line with the structured Winston logger used elsewhere, or remove it entirely.
  - **Why**: Raw `console.log` bypasses the Winston transport chain, so this output never reaches the rotated log files or the HTTP transport in production. It also logs the full request payload (which may contain PII) to stdout without filtering.
  - **When**: Now
  - **Where**: `controllers/motor-quotes.js`, line 117

- **What**: Either implement retry tracking or remove the `retry_count` field from the insert payload.
  - **Why**: `retry_count` is always written as `0` and never incremented. If retries are not currently implemented, the field is misleading; if retries are planned, the increment logic belongs here alongside a timestamp field for each retry.
  - **When**: Nice to have
  - **Where**: `controllers/motor-quotes.js`, line 182; `models/mysqldb/quote-insurer-request.js`

## Open questions

- The shared-library is not installed in `node_modules` in this environment, so the full Sequelize field definitions (column types, nullable constraints, indexes on `quote_request_id` or `insurer_id`) for `quote_insurer_request` could not be confirmed. A maintainer should verify whether composite indexes exist on `(quote_request_id, insurer_id)` — this column pair is the natural lookup key for finding all insurer calls for a given quote, and a missing index would cause slow scans as volume grows.
- `requested_at` and `response_received_at` are both set to `new Date()` at the moment the log row is written, after the insurer call has already returned. Is this intentional (log-time stamp), or should `requested_at` be captured before the HTTP call goes out and `response_received_at` after it returns, to measure actual round-trip latency?
