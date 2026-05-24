# Motor Quotes

## What this module does

The motor-quotes module drives two consecutive steps in the customer insurance journey: generating premium quotes from insurers, and locking in a chosen plan. When a customer asks for a price, this module calls the appropriate insurer adapter (real or mock), saves the full request and response for audit purposes, and writes a normalized quote result row for the UI to display. Once the customer picks a plan, the module records that selection and advances the quote-request status so the proposal step can begin.

## Why this module exists

Insurance pricing is fetched live from external insurer APIs — the response structure and data differ by insurer and must be normalized before the rest of the application can use them. Keeping this in its own module separates the insurer-call orchestration (fan out, log, normalize, persist) from both the earlier data-collection step (`motor-quote-request`) and the later proposal creation step (`motor-proposal`). Plan selection is co-located here because it finalizes the pricing step and is a direct consequence of a quote result.

## When this module runs / is used

- **Quote generation** — `POST /api/customer/motor/quotes/generate` — called by the frontend after a quote request has been created. The caller must supply a `quote_request_id` and optionally an `insurer_code` (defaults to `MOCK_DIGIT`), `insurer_id` (defaults to `1`), and `insurer_product_id` (defaults to `1`). One quote result is written per call; the frontend calls this endpoint once per insurer to build a comparison list.
- **List quotes** — `GET /api/customer/motor/quotes/:quote_request_id` — called by the frontend to display the comparison screen. Returns up to 50 active quote results sorted by `final_premium` ascending.
- **Select plan** — `POST /api/customer/motor/quotes/select-plan` — called once when the customer clicks "Buy this plan". Permanently locks the chosen quote; re-selection is blocked after this point.

## How it fits in

- **Depends on**: `motor-quote-request` (the `quote_request_id` FK must exist before any quote can be generated), `insurer-factory` (resolves the correct adapter from `insurer_code`), `quote-insurer-request-model` and `quote-insurer-response-model` (audit logging of raw API calls), `quote-result-model` (normalized quote storage), `quote-selected-plan-model` (plan lock), `quote-request-model` (status updates), `common-service` (structured error logging).
- **Depended on by**: `motor-proposal` — the proposal controller reads `quote_request.selected_quote_result_id` and `quote_result` fields that are populated by `selectPlan`.

## Key files

| File | Purpose |
|---|---|
| `routes/motor-quotes.js` | Registers three routes: `POST /generate`, `POST /select-plan`, `GET /:quote_request_id` under `/api/customer/motor/quotes`. |
| `controllers/motor-quotes.js` | Three handler functions (`generate`, `listByQuoteRequest`, `selectPlan`) that own the full request/response lifecycle, including DB transactions. |
| `models/mysqldb/quote-result.js` | Thin wrapper over the shared-library `MysqlQuoteResultsModel`; adds `add`, `update`, `findById`, `find` methods used by the controller. |
| `models/mysqldb/quote-selected-plan.js` | Thin wrapper over `MysqlQuoteSelectedPlanModel`; provides `add` and `findByQuery` (used to check for an existing selection). |
| `models/mysqldb/quote-insurer-request.js` | Persists the outbound insurer API request for each quote call. |
| `models/mysqldb/quote-insurer-response.js` | Persists the raw insurer API response paired with each request. |

## Optimization opportunities

- **What**: Remove the debug payload log on line 117 of `controllers/motor-quotes.js` (`console.log("🚀 ~ generate ~ payload:", payload)`).
  **Why**: This fires on every production quote-generation call, writing the full request body — which can include vehicle registration numbers and personal data — to stdout, bypassing Winston log-level controls and flooding logs.
  **When**: Now.
  **Where**: `controllers/motor-quotes.js:117`

- **What**: Replace the three `console.log(error)` calls in catch blocks with no duplicate logging; `CommonService.errorHandler` already writes a structured Winston entry.
  **Why**: Duplicate raw stack traces appear in stdout alongside every structured error log. The same pattern was flagged in `motor-quote-request` and several admin controllers.
  **When**: Now.
  **Where**: `controllers/motor-quotes.js:291`, `controllers/motor-quotes.js:389`, `controllers/motor-quotes.js:551`

- **What**: Validate `insurer_id` and `insurer_product_id` before using them; do not silently default both to `1`.
  **Why**: If either field is omitted, the quote is silently attributed to insurer ID 1 and product ID 1 regardless of which insurer was actually called. The audit log (`quote_insurer_request`, `quote_result`) records wrong FK values, making the data unreliable for reporting or re-quoting.
  **When**: Next quarter.
  **Where**: `controllers/motor-quotes.js:138–139`

- **What**: Stop hardcoding `is_recommended: 1` on every `quote_result` row written by `generate`.
  **Why**: Every result is marked as recommended, which makes the flag meaningless. The intended use (highlight the best-value plan when multiple insurers are compared) requires recommendation logic based on premium, coverage, or a configurable rule — not a constant.
  **When**: Next quarter.
  **Where**: `controllers/motor-quotes.js:246`

- **What**: Add a `normalized_quote` field to the insurer service return shape, or consistently use `response_payload` — and document the contract.
  **Why**: `generate` resolves the normalized quote via `insurerQuote.normalized_quote || insurerQuote.response_payload`. The mock service only returns `response_payload`; `normalized_quote` is never set by any current adapter. The fallback works today, but the ambiguity will cause a silent bug if a future adapter returns a `response_payload` that is the raw (un-normalized) insurer response and a separate `normalized_quote`.
  **When**: Next quarter.
  **Where**: `controllers/motor-quotes.js:151–154`, `services/insurers/mock/mock.quote.service.js:65–81`

- **What**: Use `ResponseHandler` (the i18n-keyed response utility) instead of inline `res.status().json()` objects.
  **Why**: All three handlers write raw JSON response objects, bypassing the i18n envelope and `ResponseHandler` helper used across the rest of the application. This creates inconsistent API response shapes.
  **When**: Nice to have.
  **Where**: `controllers/motor-quotes.js` (all handlers)

- **What**: Add at least one integration test for `generate` and `selectPlan`.
  **Why**: There are no test files for this module at all. Both handlers involve DB transactions and external service calls; a test with the mock adapter would cover the happy path and the rollback-on-error path without needing live insurer access.
  **When**: Nice to have.
  **Where**: `tests/api/routes/` (new file)

## Open questions

- **Permanent plan lock**: `selectPlan` hard-blocks re-selection with a 400 once any plan is chosen. Is this intentional, or should an agent/admin be able to reset the selection (e.g. if the customer changes their mind before submitting a proposal)?
- **Multi-insurer quoting strategy**: The current implementation calls `generate` once per insurer, relying on the frontend to call the endpoint multiple times. Is there a planned batch endpoint, or is sequential front-end calling the intended design?
- **`listByQuoteRequest` limit of 50**: The `find` call uses a hard ceiling of 50 results. If this is ever expected to exceed 50 (e.g. if more insurers are onboarded), the response silently truncates. Should this be paginated or have a configurable cap?
