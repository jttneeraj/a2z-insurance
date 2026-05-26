# Quote Insurer Response Model

## What this module does

This module provides a data-access layer for the `quote_insurer_response` database table. Every time the system calls an external insurer's API to generate a motor insurance quote, the raw response — including HTTP status code, response body, any error details, and the insurer's own quote reference number — is saved here as a permanent record.

## Why this module exists

Motor insurance quotes involve calls to third-party insurer systems (e.g. Digit Insurance). Preserving the raw, unmodified response from each insurer before any internal processing begins creates an auditable trail. This makes it possible to investigate pricing disputes, replay failed calls, and diagnose integration bugs without re-calling the live API. It also separates raw storage from the normalized view that lives in `quote_result`.

## When this module runs / is used

This module is invoked during the quote generation step of the customer-facing motor insurance flow. Specifically, it is called inside `controllers/motor-quotes.js` when a customer requests a quote:

1. The controller calls the appropriate insurer adapter via `InsurerFactory`.
2. Immediately after the adapter returns — whether the call succeeded or failed — `MysqlQuoteInsurerResponsesModel.add()` writes the response to the database.
3. The saved record's `id` is then passed downstream: it is linked into the `quote_result` row (via `quote_insurer_response_id`) and included in the API error response when the insurer call fails.

No other code path currently writes to or reads from this table.

## How it fits in

- **Depends on**: `shared-library` (`MysqlQuoteInsurerResponsesModel` base class, Sequelize ORM setup), `sequelize` (`Op`, `QueryTypes` imported but unused)
- **Depended on by**: `controllers/motor-quotes.js` (only consumer — the `generate` handler)
- **Related tables**: `quote_insurer_request` (parent; each response row carries a `quote_insurer_request_id` FK), `quote_result` (child; references this table via `quote_insurer_response_id`)

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/quote-insurer-response.js` | Defines `QuoteInsurerResponsesModel`, extends the shared-library base class, and exports a ready-to-use singleton instance |
| `controllers/motor-quotes.js` | The only caller; writes a response row inside a transaction during quote generation (lines 188–205) |

## Optimization opportunities

- **What**: Remove unused `Op` and `QueryTypes` imports at the top of the model file.
  **Why**: These are imported from Sequelize but never referenced; removing them keeps the file honest and reduces noise for future readers.
  **When**: Nice to have
  **Where**: `models/mysqldb/quote-insurer-response.js:1`

- **What**: Remove or justify the `update`, `findAllCount`, `find`, and `findByQuery` methods.
  **Why**: None of these methods are called by any controller or service. Insurer API responses are immutable by design — updating them after the fact would undermine the audit trail. The dead code misleads maintainers into thinking mutation is expected or that pagination is in use.
  **When**: Nice to have
  **Where**: `models/mysqldb/quote-insurer-response.js:19–51`

- **What**: Add transaction support to `update` (if it is ever intentionally kept).
  **Why**: The `add` method accepts an optional `transaction` parameter, but `update` does not. If a future developer calls `update` inside a transaction, the absence of the parameter will silently bypass atomicity.
  **When**: Nice to have (only relevant if `update` is retained)
  **Where**: `models/mysqldb/quote-insurer-response.js:19–25`

- **What**: Remove the debug `console.log` statement in the quote generation controller.
  **Why**: Line 117 of `controllers/motor-quotes.js` logs the entire request payload (`console.log("🚀 ~ generate ~ payload:", payload)`) to stdout. The payload can contain personal vehicle and owner data. In production, this line exposes PII in application logs and should be removed or replaced with a structured Winston log at debug level.
  **When**: Now
  **Where**: `controllers/motor-quotes.js:117`

- **What**: Explicitly serialize `response_payload` to a JSON string before calling `add`.
  **Why**: The model accepts any value for `response_payload`. If an insurer adapter passes a plain JavaScript object, behaviour depends on the underlying Sequelize column type — it may silently coerce it to `[object Object]` or throw depending on the DB column definition. An explicit `JSON.stringify()` call in the controller (or in a model-level hook) makes the contract clear.
  **When**: Next quarter
  **Where**: `controllers/motor-quotes.js:156–203`

## Open questions

- What is the column type for `response_payload` in the shared-library schema (string, JSON, TEXT)? The shared-library source is a private GitHub package not available locally; the column definition in `database-tables.sql` would clarify whether JSON serialization is enforced at the DB level.
- Is `findById` used by any admin or internal tooling not visible in this repository (e.g. a back-office dashboard)? It is the only read method that sees real use plausibility; the others (find, findByQuery, findAllCount) look like copy-paste from sibling models.
