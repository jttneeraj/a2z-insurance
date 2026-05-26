# Quote Result Model

## What this module does

The quote-result model stores the normalized, UI-ready summary of each insurer's quote response. After the raw insurer API response is persisted elsewhere, this module writes a clean, insurer-agnostic record containing all the premium breakdown fields the frontend needs to display a quote card. It also tracks which quotes are active and which one the customer has selected.

## Why this module exists

Different insurers return quote data in different formats and with different field names. Rather than exposing the raw insurer response to the frontend, the system normalizes each response into a consistent `quote_result` row. This means the UI always reads from the same schema regardless of which insurer generated the quote. The table also serves as the anchor point for plan selection — downstream steps (proposal, KYC, payment) look up the selected quote result to determine which insurer to call and at what premium.

## When this module runs / is used

- **On quote generation** — `motor-quotes.js → generateQuote` calls `add()` once per successful insurer response, immediately after the raw response is saved. Each insurer that returns a valid quote gets one row here.
- **On quote listing** — `motor-quotes.js → listByQuoteRequest` calls `find()` to return all `ACTIVE` rows for a given quote request, sorted by `final_premium` ascending, for the customer to compare options.
- **On plan selection** — `motor-quotes.js → selectPlan` calls `findById()` to validate the chosen quote, then calls `update()` to flip its `result_status` from `ACTIVE` to `SELECTED`.
- **On proposal creation** — `motor-proposal.js` calls `findById()` to retrieve the selected quote's insurer ID, premium, and `insurer_quote_reference_no` before forwarding a proposal to the insurer.

## How it fits in

- **Depends on**: `shared-library/services/models` — provides the `MysqlQuoteResultsModel` base class with the Sequelize model binding and database connection (`mysqldb`).
- **Used by**: `motor-quotes` controller (generate quote, list quotes, select plan) and `motor-proposal` controller (proposal creation and update flows).

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/quote-result.js` | Defines `QuoteResultsModel`, extends the shared-library base, and exports the instantiated singleton `MysqlQuoteResultsModel`. |

## Optimization opportunities

- **What**: Remove or repurpose the `is_recommended` field — it is hardcoded to `1` on every insert, so the field carries no information.
  **Why**: Dead data increases table row size and misleads future developers who may expect it to encode real recommendation logic.
  **When**: Nice to have
  **Where**: `models/mysqldb/quote-result.js` (write path in `controllers/motor-quotes.js:246`)

- **What**: Remove or mark `findAllCount(conditions)` as unused — no caller exists in the codebase.
  **Why**: Dead methods inflate the public API of the model, making the codebase harder to understand and maintain.
  **When**: Nice to have
  **Where**: `models/mysqldb/quote-result.js:28–32`

- **What**: Specify explicit `attributes` (column list) in the `listByQuoteRequest` query instead of passing `null` (which fetches all columns).
  **Why**: Fetching all columns — including raw premium breakdown fields the UI may not display — increases network and serialization cost as the quote_result table grows. Only the columns rendered in the quote card need to be returned.
  **When**: Next quarter
  **Where**: `controllers/motor-quotes.js:366` — the `find(null, ...)` call

- **What**: Add at least one integration test covering the `add → find → update` lifecycle.
  **Why**: The quote-result row is the central artifact that every downstream step (proposal, KYC, payment) depends on. There are currently no tests for this model, so regressions in the write or read path would be silent.
  **When**: Next quarter
  **Where**: `tests/api/routes/` — no file exists yet for this module

## Open questions

- What `result_status` values are valid beyond `ACTIVE` and `SELECTED`? The code writes only these two, but the shared-library schema may define additional states (e.g. `EXPIRED`, `CANCELLED`). A maintainer should confirm the full set and whether any cleanup job transitions stale `ACTIVE` rows after `quote_valid_till` passes.
- Is there a plan to implement real recommendation logic for `is_recommended`, or can the field be dropped safely?
- `findAllCount` exists on the model but is never called — was it part of a planned admin listing endpoint that was never finished?
