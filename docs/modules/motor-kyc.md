# Motor KYC

## What this module does
The motor-kyc module provides a single API endpoint that checks the Know Your Customer (KYC) verification status for a motor insurance policy. It accepts a policy number and an insurer code, delegates the lookup to the appropriate insurer adapter (currently Digit or Mock), and returns a normalized status object containing the KYC result, policy status, and payment status.

## Why this module exists
KYC is a regulatory requirement for issuing motor insurance policies in India. After a proposal is submitted to an insurer and payment is initiated, the insurer runs identity and document verification on the customer. This module exists so the front-end can poll for the KYC outcome without coupling to any single insurer's API structure — the adapter pattern ensures a uniform response shape regardless of which insurer is used.

## When this module runs / is used
- Triggered whenever the client application calls `POST /api/customer/motor/kyc/status`.
- In the motor insurance customer journey this is polled after payment has been initiated and before policy issuance is confirmed (`information.md` places KYC between Payment and Policy Status).
- Called by front-end or middleware to determine whether the customer's documents have been verified by the insurer, so that the policy-issuance step can be unblocked.

## How it fits in
| Direction | Module |
|---|---|
| Depends on | `insurer-factory` — resolves the correct KYC service for the given `insurer_code` |
| Depends on | `digit-kyc` (`digit.kyc.service.js`) — Digit-specific KYC status call |
| Depends on | `mock-adapter` (`mock.kyc.service.js`) — Mock KYC response for testing |
| Depends on | `digit-transport` (`digit.executor.service.js`) — executes the outbound HTTP call and handles auth |
| Depends on | `digit-mapper` (`digit.mapper.js`) — builds the Digit request and normalizes the response |
| Depends on | `insurer-api-log-service` — persists every insurer request/response |
| Depends on | `common-service` — logs errors to Winston via `errorHandler` |
| Called by | Front-end / API gateway polling for post-payment KYC completion |
| Referenced by | `motor-proposal` stores the initial `kyc_status` returned by the proposal insurer call; `motor-policy` stores the final `kyc_status` from the policy status response |

## Key files
| File | Purpose |
|---|---|
| `controllers/motor-kyc.js` | Single `status` handler: validates `insurer_id`, resolves the adapter, calls `checkKycStatus`, and returns a normalized JSON response. |
| `routes/motor-kyc.js` | Registers `POST /status` and wires it to the controller; mounted at `/api/customer/motor/kyc` in `app.js`. |
| `services/insurers/digit/digit.kyc.service.js` | Digit adapter: validates `policy_number`, invokes `DigitExecutorService.execute` with the KYC integration ID, and delegates response normalization to `DigitMapper`. |
| `services/insurers/mock/mock.kyc.service.js` | Mock adapter: creates an API log entry, returns a hardcoded `kyc_status: "DONE"` response, and marks the log as success. Intended for development and testing. |
| `services/insurers/digit/digit.mapper.js` (lines 519–568) | `buildKycStatusPayload` and `normalizeKycStatusResponse` — builds the Digit query-param payload from `policyNumber` and flattens the nested Digit response into the app's uniform shape. |

## Optimization opportunities

- **What**: Remove the bare `console.log(error)` on line 40 of `controllers/motor-kyc.js` and route all logging through Winston via the `errorHandler` already called on line 42.
  **Why**: `console.log` bypasses the structured Winston transports (daily rotation, HTTP transport in production). Sensitive error detail — insurer stack traces, policy numbers — ends up in unrotated stdout rather than the secure log pipeline.
  **When**: Now
  **Where**: `controllers/motor-kyc.js:40`

- **What**: Add `await` to the `CommonService.errorHandler(...)` call on line 42.
  **Why**: `errorHandler` is declared `async`; without `await`, any exception thrown inside it becomes an invisible unhandled-promise rejection. The error is silently discarded instead of being logged.
  **When**: Now
  **Where**: `controllers/motor-kyc.js:42`

- **What**: Add an authorization check — verify that the `proposal_id` (or `policy_number`) in the request body belongs to the authenticated caller before passing it to the insurer.
  **Why**: Currently any authenticated user can query KYC status for any policy number by supplying it in the body. This is an information-disclosure vulnerability (IDOR): insurer KYC outcome, policy status, and payment status are personally sensitive data.
  **When**: Now
  **Where**: `controllers/motor-kyc.js:7–61`

- **What**: Validate `insurer_code` explicitly and return a 400 error when it is absent, rather than silently defaulting to `MOCK_DIGIT`.
  **Why**: A missing `insurer_code` in production silently routes the request to the mock adapter, returning a fake `kyc_status: "DONE"` to the client and persisting a misleading API log entry. This can mask configuration errors or front-end bugs.
  **When**: Next quarter
  **Where**: `controllers/motor-kyc.js:8`

- **What**: Validate or restrict the `environment` field accepted by the Digit KYC service.
  **Why**: `digit.kyc.service.js` reads `payload?.environment || "UAT"` without any check. A caller that passes `environment: "PROD"` will route the status check against the production Digit API, even from a non-production deployment of this service.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.kyc.service.js:7`

- **What**: Normalize the `policyNumber` / `policy_number` field name to a single convention at the controller boundary.
  **Why**: The Digit service reads `payload.policyNumber || payload.policy_number` to accommodate both camelCase and snake_case. This dual-path tolerance hides an inconsistency in how callers send the field. Enforcing a single name in the controller prevents the issue from propagating further downstream.
  **When**: Nice to have
  **Where**: `services/insurers/digit/digit.kyc.service.js:9`

- **What**: Consolidate the two nested-vs-flat read paths in `normalizeKycStatusResponse` (e.g. `responsePayload?.kycVerificationStatus || responsePayload?.kycStatus?.kycVerificationStatus`).
  **Why**: The dual paths imply that two different Digit response shapes are possible, but this is undocumented. If Digit has standardized its response, the dead branch should be removed; if both shapes are genuinely live, they should be explained in a comment so future maintainers do not inadvertently break one.
  **When**: Nice to have
  **Where**: `services/insurers/digit/digit.mapper.js:560–568`

- **What**: Add at least one spec file covering the `status` endpoint (both success and insurer-error paths).
  **Why**: The KYC status endpoint is entirely untested. Given that it is a real-money regulatory checkpoint (KYC failure blocks policy issuance), a regression here would be hard to detect without tests.
  **When**: Next quarter
  **Where**: `tests/api/routes/insurance/` (mirroring the pattern of existing spec files)

## Open questions
- **KYC/Payment ordering**: `CLAUDE.md` lists the journey as `…Proposal → KYC → Payment → PolicyStatus…`, while `information.md` lists it as `…Proposal → Payment → KYC → Policy Status…`. Which ordering is correct in the current production flow? The controller itself is stateless and does not enforce order, so the discrepancy is in documentation only — but it should be resolved to avoid confusion.
- **KYC write-back**: The KYC status check does not update any row in the database (no `quote_proposal` or `proposal_payment` update on success). Is the front-end expected to store the result itself, or is a write-back step missing?
- **Insurer field `integrationId`**: The UAT value `28235-0100` is hardcoded in `digit.config.js`; the production value comes from `DIGIT_PROD_KYC_STATUS_ID`. Is there a staging/QA environment that needs its own ID?
