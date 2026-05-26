# Quote Selected Plan Model

## What this module does

This module is the data-access layer for the `quote_selected_plan` database table. When a customer browses a list of insurer quotes and picks one, this model records that choice — linking the quote request, the chosen quote result, and the insurer into a single row. It is the permanent record that "this customer chose this plan."

## Why this module exists

Before a proposal can be created, the system needs to know which insurance plan the customer selected. Storing the selection in its own table (rather than just marking a field on the quote result) keeps the selection auditable, prevents accidental overwrites, and lets downstream steps (proposal creation, KYC, payment) retrieve the chosen plan without re-querying the full list of quotes. It lives as its own model to match the wider pattern in this codebase where each step in the motor flow owns its own table.

## When this module runs / is used

- **Plan selection**: Called by `POST /api/customer/motor/quotes/select-plan` (handled in `controllers/motor-quotes.js`) to create a new selected-plan row the moment the customer taps "Buy" on a quote card.
- **Proposal creation (fallback)**: Called by all three proposal actions in `controllers/motor-proposal.js` (create proposal, retrieve proposal for KYC entry, and a third variant). When the caller does not supply an explicit `quote_result_id`, the controller looks up the customer's saved selection here.

## How it fits in

| Relationship | Module |
|---|---|
| **Depends on** | `shared-library` (`MysqlQuoteSelectedPlanModel` base class, Sequelize instance) |
| **Used by** | `motor-quotes` controller — writes a row on plan selection |
| **Used by** | `motor-proposal` controller — reads the row as fallback when no `quote_result_id` is provided |
| **Data passed to** | `digit-proposal` service and `mock-adapter` proposal service (as `selectedPlan` parameter, no direct import) |

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/quote-selected-plan.js` | The full model. Extends the shared-library base class and adds `add()` and `findByQuery()` methods. |

## Optimization opportunities

- **What**: Remove the unused `Op` and `QueryTypes` imports at the top of the file.
  **Why**: Dead imports add noise and inflate the module's apparent complexity.
  **When**: Now
  **Where**: `models/mysqldb/quote-selected-plan.js`, line 1

- **What**: Add a `UNIQUE` database constraint on `quote_request_id` in the `quote_selected_plan` table (via a shared-library migration).
  **Why**: The uniqueness rule ("one selection per quote request") is currently enforced in application code only (`controllers/motor-quotes.js:487-497`). If two simultaneous requests for the same `quote_request_id` slip past the application check — a real possibility under load — both rows are inserted silently, corrupting the proposal flow. A database-level unique index makes this race condition impossible.
  **When**: Next quarter
  **Where**: shared-library schema / `database-tables.sql`; application guard at `controllers/motor-quotes.js:487`

- **What**: Add an `update()` method (e.g., to set `selection_status` to `"CANCELLED"` or `"REPLACED"`).
  **Why**: Currently there is no way to void a plan selection once made. If a user wants to re-select a different plan (e.g., after a failed payment), the business logic has no mechanism to cancel the old row; an operator would need to do a manual database update. An `update()` method would unlock a "change plan" flow.
  **When**: Next quarter
  **Where**: `models/mysqldb/quote-selected-plan.js`

- **What**: Extract the repeated `findByQuery → guard → fetchQuoteResult` block in `motor-proposal.js` into a shared helper.
  **Why**: The same six-line fallback pattern appears three times in `controllers/motor-proposal.js` (lines ~96–116, ~323–343, ~540–560). Extracting it reduces duplication and centralises the error message strings for easier i18n maintenance.
  **When**: Nice to have
  **Where**: `controllers/motor-proposal.js`, lines 96, 323, 540

## Open questions

- The table columns (`quote_request_id`, `quote_result_id`, `lead_id`, `insurer_id`, `selection_status`) are inferred from the `add()` call in the controller. The authoritative schema lives in the shared-library repo. It would be worth confirming whether there are additional columns (e.g., timestamps, `selected_by` user ID) that this application code never touches.
- `selection_status` is always hardcoded to `"SELECTED"` at creation time. Is there an intended set of allowed values (e.g., `CANCELLED`, `EXPIRED`)? If so, a constants entry in `constants/common.js` would be cleaner than a bare string literal.
