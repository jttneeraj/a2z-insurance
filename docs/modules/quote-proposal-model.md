# Quote Proposal Model

## What this module does

This module provides the data-access layer for the `quote_proposals` database table — the single record that represents a customer's insurance proposal. It tracks the proposal from the moment it is created internally through the insurer's acceptance, KYC, and payment confirmation. It exposes four focused operations: create, update, look-up by primary key, and look-up by arbitrary conditions.

## Why this module exists

During the motor insurance flow, after a customer selects a quote plan, the application needs a durable record of the proposal before calling out to the insurer's API. The proposal row acts as the anchor for all downstream activity — KYC, payment, and policy issuance all reference it by `id`. Isolating these database operations in their own model keeps the controller thin and makes the persistence behaviour easy to locate and change without touching business logic.

## When this module runs / is used

- **Proposal creation** — Called by `motor-proposal.js` controller whenever a customer submits a proposal request (`POST /api/customer/motor/proposal/add`). The model's `add` method is called inside a Sequelize transaction that also updates the parent `quote_request` status to `PROPOSAL_CREATED`.
- **Proposal status update** — Called again by the same controller immediately after the insurer API responds, to write back fields such as `proposal_status`, `insurer_application_id`, `insurer_policy_number`, `kyc_status`, and `payment_status`.
- **Proposal look-up before payment** — Called by `motor-payment.js` controller (`POST /api/customer/motor/payment/initiate`) to retrieve the saved proposal (including `final_premium` and `insurer_application_id`) before creating a payment record.
- **Proposal detail retrieval** — Called by `motor-proposal.js` controller on the `GET /api/customer/motor/proposal/:id` endpoint to return proposal details to the client.

## How it fits in

| Direction | Module |
|-----------|--------|
| Extends | `MysqlQuoteProposalsModel` (base Sequelize model in `shared-library`) |
| Re-exports | `mysqldb` (Sequelize connection) from `shared-library` |
| Consumed by | `controllers/motor-proposal.js` — proposal creation, status updates, and detail fetch |
| Consumed by | `controllers/motor-payment.js` — proposal look-up before payment initiation |
| Indirectly related | `models/mysqldb/quote-request.js` — the parent record whose `quote_status` is updated in the same transaction as proposal creation |
| Indirectly related | `models/mysqldb/proposal-payment.js` — child record created after a proposal is found via this model |

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/quote-proposal.js` | The active model: extends the shared-library base class with `add`, `update`, `findByQuery`, and `findById` methods |
| `models/mysqldb/quote-proposal copy.js` | Legacy snapshot — byte-for-byte identical to the active file; kept as a reference per repository convention; do not import |

## Optimization opportunities

- **What**: Remove the unused `Op` and `QueryTypes` imports on line 1 of `quote-proposal.js`.
  **Why**: Both symbols are imported from Sequelize but never referenced anywhere in the file. Dead imports make readers wonder whether an advanced query is planned and add unnecessary coupling to Sequelize internals.
  **When**: Now
  **Where**: `models/mysqldb/quote-proposal.js`, line 1

- **What**: Rename `findByQuery` to `findOneWhere` (or `findOneByQuery`).
  **Why**: The name `findByQuery` implies it could return a list, but it calls `model.findOne` and always returns at most one record. The current name has already caused controller code to treat it as a single-result check (`if (existingProposal)`), which works correctly — but a new developer reading the method name could not tell this without looking at the body.
  **When**: Next quarter
  **Where**: `models/mysqldb/quote-proposal.js`, line 28; all three call sites in `controllers/motor-proposal.js` (lines 128, 354, 571)

- **What**: Add optional transaction parameters to `findByQuery` and `findById`.
  **Why**: `add` and `update` already accept a transaction argument, which is used correctly during proposal creation. The read methods do not, which means a transactional read-modify-write cannot be expressed cleanly using this model alone. If the proposal-exists check (`findByQuery`) is ever needed within a transaction, the caller must bypass the model and access `this.model` directly.
  **When**: Nice to have
  **Where**: `models/mysqldb/quote-proposal.js`, lines 28 and 34

- **What**: Extract the duplicated proposal-creation block in `motor-proposal.js` into a shared helper.
  **Why**: The pattern — check for existing proposal, open a transaction, call `MysqlQuoteProposalsModel.add`, update `quote_request` status, commit, call the insurer adapter, then update proposal status — appears three times nearly verbatim (lines ~128–226, ~354–436, ~571–653). Any bug fix or field addition must be applied three times. This is a controller concern, not a model concern, but the model's `add` and `update` signatures are stable enough to support the refactor today.
  **When**: Next quarter
  **Where**: `controllers/motor-proposal.js`, lines 128–226, 354–436, 571–653

## Open questions

- What are the full column definitions of the `quote_proposals` table? The schema lives in the `shared-library` repository (`MysqlQuoteProposalsModel`) which is not installed in this working tree. Understanding the full column set (particularly any indexed or nullable columns) would help validate whether `findByQuery` on `quote_request_id` alone is efficient or whether a database index is already in place.
- Are the three proposal-creation functions in `motor-proposal.js` intentionally separate (for example, for different vehicle categories or insurer types), or is the duplication an artefact of iterative development? The answer determines the right scope for a deduplication refactor.
