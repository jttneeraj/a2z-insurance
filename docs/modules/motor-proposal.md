# Motor Proposal

## What this module does

The motor-proposal module is the third step in the motor insurance customer journey, sitting between quote selection and KYC. It accepts a customer's chosen quote result, creates an internal proposal record in the database, and then calls the appropriate insurer's API to register the proposal with that insurer. The insurer's response (application ID, policy number, KYC/payment status) is stored back against the proposal record and returned to the caller.

## Why this module exists

A "proposal" is the formal application to an insurer for a specific policy at a specific premium. It has its own lifecycle (`CREATED` → `INSURER_PROPOSAL_CREATED` → `INSURER_PROPOSAL_FAILED`) separate from the quote request lifecycle, and it carries proposer contact details (name, mobile, email) that may differ from the vehicle owner's details captured in the quote request. Separating this step allows the payment and KYC steps downstream to reference a stable `proposal_id` rather than re-deriving the selected insurer and premium from the quote layer.

## When this module runs / is used

- **`POST /api/customer/motor/proposal/add`** — Called when a customer is ready to convert their selected quote into a formal proposal. Typically triggered by the front-end after the customer confirms the selected plan. Requires a prior `quote_request_id` and either a `quote_result_id` (explicit) or a previously recorded `quote-selected-plan` row (implicit fallback).
- **`GET /api/customer/motor/proposal/:id`** — Called after proposal creation to retrieve the full proposal record (useful for polling proposal status or prefilling downstream KYC/payment screens).
- All requests pass through `validateHeaders` / `decodeUserData` middleware; the endpoints are live on `main` at the path registered in `app.js:162`.

## How it fits in

**Depends on:**
- `models/mysqldb/quote-request` — Reads the originating quote request; updates its `quote_status` to `PROPOSAL_CREATED` inside the same transaction.
- `models/mysqldb/quote-result` — Reads the chosen insurer quote (premium, insurer ID, insurer reference number).
- `models/mysqldb/quote-selected-plan` — Fallback lookup when `quote_result_id` is not explicitly supplied.
- `models/mysqldb/quote-proposal` — Writes and reads the internal proposal record.
- `services/insurers/insurer.factory` — Routes the outbound proposal call to the correct adapter (Digit or Mock).
- `services/insurers/digit/digit.proposal.service` — Makes the real Digit API call and normalises the response.
- `services/insurers/mock/mock.proposal.service` — Simulates a successful Digit proposal response for testing.
- `services/common` — `errorHandler` for structured Winston logging.

**Depended on by:**
- `controllers/motor-payment` — Requires a `proposal_id` produced by this module; reads `MysqlQuoteProposalsModel` for premium and insurer ID.
- `controllers/motor-kyc` — Passes `proposal_id` forward to associate KYC submissions with the correct proposal.
- `controllers/motor-policy` — Carries `proposal_id` through to policy-status and PDF retrieval.

## Key files

| File | Purpose |
|------|---------|
| `routes/motor-proposal.js` | Registers `POST /add` and `GET /:id` on the Express router; single require of the controller. |
| `controllers/motor-proposal.js` | Main logic: validation, duplicate guard, DB transaction, insurer adapter call, status update, response. Also contains two dead backup functions (`add_bk`, `add_1`) that are never exported. |
| `models/mysqldb/quote-proposal.js` | Thin Sequelize wrapper over the shared-library `MysqlQuoteProposalsModel`; exposes `add`, `update`, `findByQuery`, `findById`. |
| `services/insurers/digit/digit.proposal.service.js` | Builds the Digit API payload via `DigitMapper`, obtains a Bearer token, calls the executor URL, and normalises the response. |
| `services/insurers/mock/mock.proposal.service.js` | Returns a deterministic mock response; logs the request and response via `InsurerApiLogService` identically to the real adapter. |

## Optimization opportunities

### 1. Dead backup functions inflate the controller by ~280 lines

- **What**: Delete `add_bk` (lines 58–275) and `add_1` (lines 277–481) from `controllers/motor-proposal.js`. Neither function is exported or called; they are superseded by the live `add` function (lines 483–698).
- **Why**: Maintainability — three near-identical 200-line functions in one file make it hard to see which handler is real, and changes to the live handler have to be mentally untangled from the dead ones on every read.
- **When**: Now
- **Where**: `controllers/motor-proposal.js:58–481`

### 2. Failed insurer proposal permanently blocks retries (functional bug)

- **What**: When the insurer call fails after the DB transaction has already committed, the proposal is marked `INSURER_PROPOSAL_FAILED` but `quote_status` is left as `PROPOSAL_CREATED`. The duplicate-proposal guard on line 571 then blocks any future `POST /add` for the same `quote_request_id`, so the customer can never retry.
- **Why**: Correctness — a transient insurer failure (network timeout, 5xx) permanently prevents the customer from completing their purchase without manual DB intervention.
- **When**: Now
- **Where**: `controllers/motor-proposal.js:571–581` (guard), `controllers/motor-proposal.js:633–641` (failed-insurer update). Fix: either reset `quote_status` back to `PLAN_SELECTED` and delete the failed proposal row on insurer failure, or replace the duplicate guard with a status check (`INSURER_PROPOSAL_CREATED` only).

### 3. IDOR on `detail` endpoint — any authenticated user can read any proposal

- **What**: `GET /api/customer/motor/proposal/:id` fetches any proposal row by primary key without checking that the authenticated caller owns that proposal. No comparison against `req.headers['userdata']` is made.
- **Why**: Security — this is an Insecure Direct Object Reference (IDOR). An authenticated user who knows (or guesses) another customer's `proposal_id` can read their full proposal including proposer name, mobile, email, and insurer application ID.
- **When**: Now
- **Where**: `controllers/motor-proposal.js:723–756`. Fix: after fetching the proposal, verify `proposal.lead_id` or `quoteRequest.member_id` matches the caller's identity from `req.headers['userdata']`.

### 4. `console.log` in catch blocks bypasses Winston

- **What**: Both exported handlers call `console.log("motor proposal catch error===> ", error)` (lines 672 and 455 in the dead `add_1`) before `CommonService.errorHandler`, and `detail` calls `console.log(error)` (line 742). Remove the `console.log` calls; `CommonService.errorHandler` already writes a structured Winston entry.
- **Why**: The raw `console.log` dumps full stack traces to stdout, bypassing log-level controls and duplicating the structured entry. On containerised deployments, stdout logs and Winston file logs diverge.
- **When**: Now
- **Where**: `controllers/motor-proposal.js:672` (active `add`), `controllers/motor-proposal.js:742` (`detail`)

### 5. Digit-only quote-reference guard misses `DIGIT_ONE`

- **What**: Line 563 checks `if (insurerCode === "DIGIT" && !quoteResult.insurer_quote_reference_no)` but the factory also maps `"DIGIT_ONE"` to the Digit proposal service. A `DIGIT_ONE` proposal bypasses the guard and calls the Digit API without a quote reference, causing a downstream Digit 4xx.
- **Why**: Correctness — the guard exists precisely to provide an early, readable error instead of a cryptic Digit API failure.
- **When**: Next quarter
- **Where**: `controllers/motor-proposal.js:563`. Fix: `if (["DIGIT", "DIGIT_ONE"].includes(insurerCode) && !quoteResult.insurer_quote_reference_no)`

### 6. Insurer mock-detection logic duplicated in controller

- **What**: Lines 496–498 hardcode `const mockInsurers = ["MOCK", "MOCK_DIGIT"]` to decide whether `quote_result_id` is required. The same classification lives in `insurer.factory.js` (`isMock()`). Adding a new mock insurer requires updating both places.
- **Why**: Maintainability — single source of truth for insurer classification.
- **When**: Nice to have
- **Where**: `controllers/motor-proposal.js:496–498`. Fix: expose `InsurerFactory.isMock(code)` as a public method and call it here.

### 7. Debug `console.log` in Digit proposal service fires in production

- **What**: Line 75–78 of `digit.proposal.service.js` calls `console.log("Digit proposal validationMessages ...")` with the full Digit error body on every non-2xx response. This includes insurer-internal field names and validation detail.
- **Why**: Information disclosure — the raw insurer error body reaches stdout on every Digit proposal failure, potentially logging sensitive policy or personal data.
- **When**: Now
- **Where**: `services/insurers/digit/digit.proposal.service.js:75–78`. Replace with a Winston-level `warn` or remove.

## Open questions

- **Quote-proposal schema**: The model's `add` and `update` methods come from the shared-library `MysqlQuoteProposalsModel`. The exact column list (e.g. whether `insurer_proposal_reference_no` is nullable, whether there is a unique constraint on `quote_request_id`) can only be confirmed from `node_modules/shared-library/database-tables.sql`. A maintainer should verify whether the uniqueness of `quote_request_id` is enforced at the DB level (which would make the `findByQuery` duplicate guard redundant but safe) or only in application code (which makes the TOCTOU window between guard and insert a real concern).
- **Proposer identity vs owner identity**: The proposer fields (`proposer_name`, `proposer_mobile`, `proposer_email`) accept arbitrary values from the request payload without cross-checking them against the lead or owner-detail records created in `motor-quote-request`. It is unclear whether this is intentional (allowing a broker to propose on behalf of a customer) or an oversight.
