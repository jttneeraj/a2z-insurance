# Insurer Factory

## What this module does
The insurer factory is the single decision point that maps an insurer code (e.g. `"DIGIT"`, `"MOCK"`) to the correct service implementation for each step of the motor insurance flow. It exposes five methods — one per flow step (quote, proposal, KYC, payment, policy) — and returns the right service class to the calling controller.

## Why this module exists
Without a factory, every controller that needs to call an insurer would have to contain its own `if/else` logic to pick the right implementation. The factory centralises that routing so controllers stay thin and a new insurer adapter only needs to be wired up in one place rather than five.

## When this module runs / is used
The factory is invoked at runtime on every request that touches an insurer, immediately before the insurer call is made:
- `motor-quotes` controller calls `getMotorQuoteService` when generating quotes for a lead.
- `motor-proposal` controller calls `getMotorProposalService` at plan-selection and proposal-creation steps.
- `motor-payment` controller calls `getMotorPaymentService` at payment initiation.
- `motor-kyc` controller calls `getMotorKycService` when submitting KYC documents.
- `motor-policy` controller calls `getMotorPolicyService` when polling policy status or fetching the PDF.

## How it fits in
- **Depends on**: `services/insurers/digit/digit.*.service.js` (real Digit adapter), `services/insurers/mock/mock.*.service.js` (test/stub adapter).
- **Depended on by**: `controllers/motor-quotes.js`, `controllers/motor-proposal.js`, `controllers/motor-payment.js`, `controllers/motor-kyc.js`, `controllers/motor-policy.js`.

## Key files
| File | Purpose |
|------|---------|
| `services/insurers/insurer.factory.js` | The entire module — normalises the insurer code, then dispatches to Digit or Mock service classes via `isMock()` / `isDigit()` helpers. Exported as a singleton (`module.exports = new InsurerFactory()`). |

## Optimization opportunities

- **What**: Remove duplicated normalisation from all five controller callers and let the factory be the sole place that normalises the code.
  - **Why**: Every controller that calls the factory already executes `String(insurerCode || "MOCK_DIGIT").trim().toUpperCase()` before passing the code in. The factory then repeats the same operation in `normalizeCode()`. Double-normalisation is harmless today but is confusing and will become a subtle source of bugs if the default or casing rules ever diverge between call sites.
  - **When**: Next quarter
  - **Where**: `services/insurers/insurer.factory.js:16–18` and the five controller callers (e.g. `controllers/motor-quotes.js:140`, `controllers/motor-payment.js:21`, `controllers/motor-kyc.js:8`, `controllers/motor-policy.js:18,80`, `controllers/motor-proposal.js:80,289`).

- **What**: Log a warning (or throw) when an unknown insurer code falls through to the mock.
  - **Why**: The final `return MockService` fallback in each method is silent — if a new insurer code is passed in without a corresponding `isX()` branch, the caller silently gets the mock adapter and proceeds with fake data. This has caused "wrong adapter" confusion (noted in `CLAUDE.md`). A single `logger.warn` line in the fallback path would surface this immediately.
  - **When**: Now
  - **Where**: `services/insurers/insurer.factory.js:34–35, 43–44, 51–52, 59–60, 68–70` (the trailing `return Mock*` lines in each method).

- **What**: Replace the five near-identical `if (isDigit) … if (isMock) … return Mock` method bodies with a lookup-table approach keyed by flow step.
  - **Why**: The five methods are structurally identical — only the imported class names differ. A map of `{ DIGIT: DigitXService, MOCK: MockXService }` per flow step would make adding a third insurer a single-line change per flow rather than copying an entire method block and remembering to wire `isNewInsurer()` in five places.
  - **When**: Nice to have
  - **Where**: `services/insurers/insurer.factory.js:28–73`

- **What**: Add unit tests for the factory.
  - **Why**: There are no tests for this file. Because the factory is pure routing logic with no I/O, it is trivial to test (`getMotorQuoteService("DIGIT")` should return `DigitQuoteService`; unknown codes should return mock and emit a warning). Tests would prevent accidental regressions when a new insurer is added.
  - **When**: Next quarter
  - **Where**: New file `tests/services/insurers/insurer.factory.spec.js`

## Open questions
- Is `DIGIT_ONE` a distinct Digit environment (e.g. a second UAT tenant) or a legacy alias? Both `"DIGIT"` and `"DIGIT_ONE"` route to the same Digit services; knowing whether they are truly equivalent would clarify whether `isDigit()` needs to distinguish them.
- Should unknown insurer codes be rejected at the API boundary (validation on `insurer_code` in the request) rather than silently falling back to mock? Clarifying the intended behaviour would help decide whether the fallback should warn or throw.
