# Proposal Payment Model

## What this module does

This module provides the data-access layer for the `proposal_payments` table, which records each payment attempt made during the motor insurance purchase journey. It stores the payment amount, currency, status, the redirect URLs for success and cancellation, and the payment link and reference IDs returned by the insurer. The model is a thin wrapper around a Sequelize base class that lives in the shared library.

## Why this module exists

A payment attempt is a distinct business event that must be persisted independently of the proposal. Separating it into its own table (and its own model file) lets the system record multiple payment attempts per proposal, track the lifecycle from `PENDING` to a terminal state, and preserve the insurer's own payment identifiers for reconciliation and support lookups. Following the project convention of one model class per table keeps the data-access code predictable and easy to find.

## When this module runs / is used

The model is loaded when the Express application starts (because `controllers/motor-payment.js` requires it at the top level). Its methods are called during two HTTP requests:

- **`POST /api/customer/motor/payment/initiate`** — calls `add()` inside a database transaction to create a `PENDING` payment row, then calls `update()` (outside the transaction) to store the payment link and insurer reference IDs returned by the insurer API.
- **`GET /api/customer/motor/payment/status/:id`** — calls `findById()` to return the stored payment record.

## How it fits in

**Depends on:**
- `MysqlProposalPaymentsModel` (base class) from the shared library (`a2z-shared-library`) — provides the Sequelize model bound to the `proposal_payments` table.
- `mysqldb` from the same shared library — the shared Sequelize connection instance.

**Used by:**
- `controllers/motor-payment.js` — the only consumer; calls `add`, `update`, and `findById`.

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/proposal-payment.js` | Defines and exports the `ProposalPaymentsModel` singleton with `add`, `update`, `findById`, and `findByQuery` methods. |
| `controllers/motor-payment.js` | The sole caller; orchestrates the full payment initiation flow using this model plus `MysqlQuoteProposalsModel` and the insurer factory. |
| `routes/motor-payment.js` | Mounts `POST /initiate` and `GET /status/:id` on the Express app at `/api/customer/motor/payment/`. |

## Optimization opportunities

- **What**: Guard `update()` against a missing or undefined `id` — if `id` is `undefined`, Sequelize will build `WHERE id = undefined` which can silently match no rows or, depending on the adapter, update all rows.
  **Why**: Data integrity. If a create step fails to return a populated record, the caller should get an error rather than a silent no-op or mass-update.
  **When**: Now
  **Where**: `models/mysqldb/proposal-payment.js`, line 6

- **What**: Wrap the post-insurer `update()` call in a transaction (or at least handle its failure explicitly).
  **Why**: Currently, `add()` runs inside a transaction (committed before the insurer call), but the second `update()` that stores `payment_link`, `insurer_payment_id`, and `insurer_request_reference` runs outside any transaction (see `controllers/motor-payment.js`, line 72). If the update fails after the insurer has already created a payment session, the database retains a `PENDING` row with no payment link — the customer has a live payment URL but the system has no record of it.
  **When**: Now
  **Where**: `controllers/motor-payment.js`, lines 72–78 and surrounding error handling.

- **What**: Rename `findByQuery` to `findOneWhere` (or `findOneByConditions`).
  **Why**: `findByQuery` implies it might return a list; the implementation calls `model.findOne` and always returns at most one row. The misleading name can lead callers to expect an array. This method is not currently called anywhere in the codebase, so the rename has no callers to update.
  **When**: Nice to have
  **Where**: `models/mysqldb/proposal-payment.js`, line 8.

- **What**: Add a `findByProposalId(proposalId)` convenience method.
  **Why**: Looking up all payment attempts for a proposal is a natural support and admin need (e.g., to check if a payment was previously initiated before creating a new one). Exposing this as a named method makes intent clearer than calling `findByQuery({ proposal_id: ... })` inline.
  **When**: Nice to have
  **Where**: `models/mysqldb/proposal-payment.js`.

- **What**: Remove or stop exporting `mysqldb` from this module, or add a code comment explaining why it is exported.
  **Why**: `motor-payment.js` acquires the `mysqldb` Sequelize instance from `models/mysqldb/quote-request.js` (line 1), not from this model. All model files export the same shared `mysqldb` instance, so the export is harmless but creates the impression that callers of `proposal-payment.js` need a database handle from it. Following a consistent convention (e.g., only the "owner" of a transaction exports `mysqldb`) would reduce confusion.
  **When**: Nice to have
  **Where**: `models/mysqldb/proposal-payment.js`, line 11.

## Open questions

1. **Table schema**: The base class `MysqlProposalPaymentsModel` lives in the shared library, which is not installed in this working tree. The exact column list (including column types, constraints, and any soft-delete fields) cannot be verified without inspecting the shared library or the live database. Check `node_modules/shared-library/database-tables.sql` on an environment where the dependency is installed.
2. **Duplicate payment prevention**: Nothing in the current code prevents a second `add()` call for the same `proposal_id` if the customer retries. Is the table expected to hold one row per proposal or multiple attempts? Knowing this determines whether a unique index on `proposal_id` is correct or whether a retry/idempotency mechanism is needed.
3. **Payment status transitions**: The code only sets `PENDING` on creation and whatever the insurer returns on update. There is no documented state machine or list of valid terminal states (e.g., `SUCCESS`, `FAILED`, `CANCELLED`). Where is this defined?
