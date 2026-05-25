# Third-Party

## What this module does

This module is a thin adapter layer that re-exports functions from the shared-library's `ThirdPartyService`. It provides a single, local import point for all outbound calls to external financial-services platforms — covering wallet payments, UPI (Unified Payments Interface) transactions, AEPS (Aadhaar-Enabled Payment System), domestic money transfers (DMT), bank account verification, vendor beneficiary management, Fingpay CMS authentication, and insurance platform login.

## Why this module exists

Rather than requiring each controller to import directly from the private shared-library package, this module acts as an indirection layer. This means that if the shared-library's API changes or is replaced, only one file needs updating. It also keeps the shared-library dependency boundary explicit and auditable from a single location.

## When this module runs / is used

The module is imported at application startup (Node.js `require` is synchronous). Individual functions are invoked at runtime on a per-request basis:

- `insuranceAuthLogin` — called by `controllers/insurance.js` when a user initiates an AEPS/insurance vendor authentication flow. The same function is imported by `controllers/import-master.js` but is **never called** there (dead import).
- All other exports (`getSenderWalletLimit`, `transaction`, `upiTransaction`, `upiVerificationDetails`, `addVendorBeneficiry`, `addUpiBeneficiary`, `makeTwoFactorAuthentication`, `sendOtpForAepsKyc`, `verifyOtpForAepsKyc`, `aepsKyc`, `aepsOnboard`, `aepsTransaction`, `validateRemitterSearch`, `validateRemitterAadhaar`, `remitterSendOtp`, `verifyRemitterOtp`, `verifyRemitterKyc`, `processRemitterEkyc`, `processGenerateOTP`, `processRemitterRegistration`, `sendDmtTransactionOtp`, `verifyDmtTransactionOtp`, `dmtTransaction`, `processTransactionDmt`, `fingpayCmsAuthLogin`, `cashDepositTransaction`) have **no active callers** anywhere in this codebase at the time of this review.

## How it fits in

| Direction | Module |
|---|---|
| Depends on | `shared-library/services/third-party` (GitHub-hosted private package, resolved via `node_modules`) |
| Used by | `controllers/insurance.js` (active — `insuranceAuthLogin`) |
| Imported but unused | `controllers/import-master.js` (`insuranceAuthLogin` is imported but never called) |

Note: `controllers/insurance.js` itself has no active route mount in this application (see the `insurance-misc` module doc), so even `insuranceAuthLogin` is not reachable via HTTP in practice.

## Key files

| File | Purpose |
|---|---|
| `services/third-party.js` | The entire module — one file, 119 lines. Imports `ThirdPartyService` from shared-library and re-exports individual wrapper functions, each of which is a single `await` passthrough. |

## Optimization opportunities

- **What**: Remove the dead import of `insuranceAuthLogin` from `controllers/import-master.js` (line 4).
  **Why**: Unused imports add noise, confuse readers, and incur a module-load cost for no benefit.
  **When**: Now.
  **Where**: `controllers/import-master.js:4`

- **What**: Delete the commented-out duplicate `require` on line 2 of `services/third-party.js`.
  **Why**: It is identical to line 1 and serves no purpose; dead code clutters the file.
  **When**: Now.
  **Where**: `services/third-party.js:2`

- **What**: Audit and remove (or document) the 17+ exported functions that have no active callers in this codebase (wallet, AEPS, DMT, UPI, remittance, Fingpay, cash deposit).
  **Why**: Each unused export is invisible technical debt — it signals capability that does not exist in this service, misleads future maintainers, and increases the surface area that must be kept in sync with the shared-library. If these features are genuinely planned, a comment block stating so (and linking to the tracking issue) is better than silent dead code.
  **When**: Next quarter (requires a product decision on whether these features are still roadmapped for this service).
  **Where**: `services/third-party.js:4–119` (all exported symbols except `insuranceAuthLogin`)

- **What**: Fix the typo `addVendorBeneficiry` → `addVendorBeneficiary` in both the function name and the export (line 19 and line 101).
  **Why**: Misspelled identifiers impede searchability, create confusion, and must be matched exactly by any future caller.
  **When**: Next quarter (a rename is a breaking change for any external consumer of this module, so it should be coordinated).
  **Where**: `services/third-party.js:19, 101`

- **What**: Add structured logging (using the project's Winston logger) around shared-library call failures, rather than letting errors propagate silently through the passthrough layer.
  **Why**: When a third-party service call fails, there is currently no local log entry capturing which function was called or what payload was used. Debugging requires tracing back through the shared-library, which is a separate repository. A `try/catch` with a Winston `error` log at this boundary would make production incidents far easier to diagnose.
  **When**: Nice to have.
  **Where**: `services/third-party.js` (all exported functions)

## Open questions

1. Are the wallet, AEPS, DMT, UPI, remittance, and Fingpay CMS functions still part of the product roadmap for this service, or were they copied from a broader fintech platform and never activated? This determines whether they should be removed or simply documented as "coming soon".
2. `controllers/insurance.js` (the only active caller of `insuranceAuthLogin`) has no route mount — is there a plan to re-enable it, or is the whole insurance-misc feature deprecated?
3. The environment variables used by `insuranceAuthLogin` (`INSURANCE_BASE_URL`, `INSURANCE_SUPER_MERCHANT_ID`, `INSURANCE_SUPER_MERCHANT_USERNAME`, `INSURANCE_SUPER_MERCHANT_KEY`) are not documented in the sample `.env`. Are they populated in any deployed environment?
