# Mock Adapter

## What this module does

The mock adapter is a set of five service classes that simulate the full motor insurance flow — quote generation, proposal creation, KYC, payment, and policy issuance — without making any real calls to an external insurer. Each service returns hardcoded, plausible-looking response data and records the interaction in the same API log table that real insurer calls use. This makes it indistinguishable from a live adapter at the calling layer.

## Why this module exists

Real insurer APIs (such as Digit's) require credentials, network access, and valid policy data. During development, internal testing, and demos it is impractical to call a live insurer for every code change. The mock adapter provides a zero-dependency stand-in so the entire motor insurance flow can be exercised end-to-end on a local machine or CI environment without touching production systems.

## When this module runs / is used

The adapter is selected by the insurer factory (`services/insurers/insurer.factory.js`) in three cases:

1. The caller passes `insurer_code: "MOCK"` or `insurer_code: "MOCK_DIGIT"` in the request body.
2. No insurer code is provided — all motor controllers default to `"MOCK_DIGIT"` when the field is absent.
3. An unrecognised insurer code is passed — the factory's catch-all fallthrough returns the mock service rather than throwing an error.

In practice every motor flow endpoint (quote, proposal, KYC, payment, policy status, policy PDF) can exercise the mock adapter at any time simply by omitting the `insurer_code` field.

## How it fits in

- **Depends on**: `services/insurers/common/insurer-api-log.service.js` — every mock operation writes to the same API log table as real integrations.
- **Loaded by**: `services/insurers/insurer.factory.js` — the factory is the only consumer; individual controllers never import mock services directly.
- **Used by (via factory)**: `controllers/motor-quotes.js`, `controllers/motor-proposal.js`, `controllers/motor-kyc.js`, `controllers/motor-payment.js`, `controllers/motor-policy.js`.

## Key files

| File | Purpose |
|---|---|
| `services/insurers/mock/mock.quote.service.js` | Returns a hardcoded comprehensive quote (IDV 4.5 L, final premium ₹12,173) with a `MOCK-<quote_request_no>` reference number. |
| `services/insurers/mock/mock.proposal.service.js` | Echoes back a proposal reference (`MOCK-PROP-<id>`) and application ID; always returns `proposal_status: "CREATED"`. |
| `services/insurers/mock/mock.kyc.service.js` | Returns `kyc_status: "DONE"` but deliberately sets `policy_status: "INCOMPLETE"` and `payment_status: "NOT_PAID"` to simulate a mid-flow state. |
| `services/insurers/mock/mock.payment.service.js` | Generates a fake payment link (`https://mock-payment.local/pay/<id>`) and a `MOCK-PAY-<id>` reference; always returns `payment_status: "PENDING"`. |
| `services/insurers/mock/mock.policy.service.js` | Implements two methods: `checkPolicyStatus` (returns `EFFECTIVE` / `PAID`) and `generatePdf` (returns a fake `.pdf` URL under `mock-policy.local`). |

## Optimization opportunities

- **What**: Consolidate the repeated try/catch/log scaffolding into a shared `withMockLog(apiMeta, handler)` helper within the mock folder.
  **Why**: All five services contain structurally identical boilerplate (create log → execute → markSuccess / markFailed → throw). A single 20-line helper would halve the file sizes and make future changes (e.g. adding a new log field) a one-line edit.
  **When**: Next quarter.
  **Where**: All five files, lines 28–92 in `mock.quote.service.js`; equivalent blocks in the other four.

- **What**: Align the default insurer code across all mock services — `mock.quote.service.js` defaults to `"MOCK"` while the other four default to `"MOCK_DIGIT"`.
  **Why**: Inconsistency makes the API log table misleading; log rows for the same flow will show different `insurer_code` values depending on which step produced them.
  **When**: Now (low-effort, prevents log confusion).
  **Where**: `mock.quote.service.js` line 7 — change default from `"MOCK"` to `"MOCK_DIGIT"` (or vice-versa, matching whichever code is canonical).

- **What**: Replace `Date.now()` in reference IDs with deterministic values derived from input IDs.
  **Why**: `mock.kyc.service.js` line 29 and `mock.policy.service.js` lines 28 and 83 embed `Date.now()` in reference fields. Two calls within the same millisecond return different IDs, and future snapshot or integration tests will always fail on these fields.
  **When**: Next quarter.
  **Where**: `mock.kyc.service.js:29`, `mock.policy.service.js:28`, `mock.policy.service.js:83`.

- **What**: Add unit tests covering each mock service method.
  **Why**: There are no tests in the repository at all for the mock adapter. A simple test per method (call → assert returned shape) would catch interface drift when the factory or controllers change their expected contract.
  **When**: Next quarter.
  **Where**: New file `tests/services/insurers/mock/mock.*.spec.js`.

- **What**: Guard against the factory's silent fallthrough to mock in production.
  **Why**: `insurer.factory.js` lines 35, 44, 53, 62, 71 fall through to mock for any unrecognised `insurerCode`. In production this means a misconfigured `insurer_code` (typo, missing env var) silently generates mock data instead of failing fast. A thrown `Error` or at least a warning log would surface the misconfiguration immediately.
  **When**: Next quarter.
  **Where**: `services/insurers/insurer.factory.js` lines 35, 44, 53, 62, 71.

## Open questions

- Is `MOCK_DIGIT` the canonical mock code, or is `MOCK` equally valid? The factory accepts both, but the two codes carry different meaning to the log reader. A decision on which one to standardise would also resolve the inconsistent default noted above.
- The mock payment response always returns `payment_status: "PENDING"`. Is there a plan to add a "success" variant so the full happy-path payment flow can be exercised without requiring a real payment callback?
- `mock.kyc.service.js` exposes only `checkKycStatus`. If the real `DigitKycService` adds a `submitKyc` method in the future, the mock will silently be out of parity. Is there a formal interface/contract (e.g. a shared abstract class or JSDoc `@interface`) that both real and mock services are expected to implement?
