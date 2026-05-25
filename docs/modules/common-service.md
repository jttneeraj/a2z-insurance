# Common Service

## What this module does

`services/common.js` is a catch-all utility library that exports 40 helper functions. It covers structured error logging, OTP and reference-number generation, date range formatting, UI label/value dropdown builders, arithmetic helpers (commission calculation, DMT charge), and personal-name splitting. It is the single shared utility layer for cross-cutting logic that no individual module should own.

## Why this module exists

The application needs a central place for small, stateless helpers that are called by many different controllers and services — particularly a structured error logger (`errorHandler`) that every catch block in the app uses to write to the Winston pipeline. In practice, only 2 of the 40 exported functions (`errorHandler` and `generateOtp`) are called anywhere in this codebase. The remaining 38 appear to have been carried over from a broader multi-product fintech platform (MPOS, AEPS, DMT, payment-gateway card-type selectors, user-role management) and were never removed when this project was narrowed to motor insurance.

## When this module runs / is used

- **`errorHandler`** — runs on every unhandled exception across all 14+ controllers and the commission-grid service. It is the universal structured error logger for the application; every controller catch block calls `CommonService.errorHandler(error, { ... })`.
- **`generateOtp`** — called by `services/sender-registration.js` when generating a one-time password for mobile verification, twice per OTP flow (once for agent, once for retailer).
- All other exports are never called anywhere in the codebase (see Optimization opportunities).

## How it fits in

- **Depends on**: `winston.js` (for `logger.error` inside `errorHandler`), `moment` (for date formatting and reference-number timestamp generation)
- **Used by**: All active controllers (`controllers/addon.js`, `controllers/commission-grid.js`, `controllers/customer-lead.js`, `controllers/insurance-types.js`, `controllers/insurer-api-credential.js`, `controllers/insurer-api-field-master.js`, `controllers/insurer-api-field-validation-rule.js`, `controllers/insurers.js`, `controllers/motor-kyc.js`, `controllers/motor-payment.js`, `controllers/motor-policy.js`, `controllers/motor-proposal.js`, `controllers/motor-quote-request.js`, `controllers/motor-quotes.js`, `controllers/product-addon.js`, `controllers/product-configs.js`, `controllers/product-document-requirement.js`) — all via `errorHandler`
- **Used by**: `services/sender-registration.js` — via `generateOtp`
- **Dead import in**: `validations/user.js` — imported but no method is ever called

## Key files

| File | Purpose |
|---|---|
| `services/common.js` | The entire module — 40 exported utility functions; the only active ones are `errorHandler` and `generateOtp` |

## Optimization opportunities

- **`isNumber` always returns `true`** (logic bug)
  - **What**: Replace `typeof parseFloat(value) === "number"` with `Number.isFinite(Number(value))` or `!isNaN(parseFloat(value)) && isFinite(value)`
  - **Why**: `typeof NaN === "number"` in JavaScript, so `isNumber("abc")` returns `true`. Any caller relying on this function for input validation silently accepts non-numeric strings.
  - **When**: Now — though the function is currently unused, this is a crash-waiting-to-happen if a caller is added
  - **Where**: `services/common.js:218–221`

- **`getOffset` creates an implicit global `offset`** (concurrency bug)
  - **What**: Add `let` declaration: `let offset; if (page) offset = page * limit; else offset = 0;`
  - **Why**: `offset = page * limit` with no `let`/`var`/`const` silently creates `global.offset` in non-strict mode. Concurrent requests would overwrite each other's offset before the return value is consumed.
  - **When**: Now — same class of bug as the `result_data` global in `services/commission.js`
  - **Where**: `services/common.js:213–217`

- **`console.log` inside `errorHandler` bypasses Winston** (logging gap)
  - **What**: Remove or replace line 31's `console.log(...)` with `logger.debug(...)` or omit it entirely since `logger.error` on line 48 already records the same information
  - **Why**: `errorHandler` is the app's structured error pipeline; `console.log` inside it bypasses log-level controls and log rotation, and doubles log volume on every error
  - **When**: Now
  - **Where**: `services/common.js:31`

- **`genderTypes` has a mixed-case value bug** (data inconsistency)
  - **What**: Change `value: "Female"` to `value: "FEMALE"` to match the uppercase convention used by every other entry in the same function and across all constants
  - **Why**: Any consumer matching against uppercase constants (e.g. from the DB or another dropdown) would silently miss the female value
  - **When**: Now — though `genderTypes` is currently not called in the motor flow, fixing it before it is wired in prevents a subtle bug
  - **Where**: `services/common.js:275`

- **38 of 40 exported functions are dead code in this codebase** (maintenance burden)
  - **What**: Audit and remove all functions that belong to fintech products not present in this repo: `upDownService`, `activeInactiveService`, `flatPercentService`, `mposCardType`, `paymentGatewayCardType`, `yesNoService`, `companyPaymentBanksLabelValue`, `workingManualActivateRejectService`, `capitalizeFirstLetter`, `setValueToLabel`, `selectActiveResult`, `getActiveResult`, `resultWithLabelAndValue`, `commissionTypes`, `statusTypes`, `genderTypes`, `servicePermissionTypes`, `userdocumentKycTypes`, `aadhaarKycTypes`, `agreementKycTypes`, `getSelecteResult`, `selectActiveResultFromLabel`, `resgistrationUserRole`, `getSelecteRole`, `clearPayload`, `calculateChargeCommission`, `calculateDMTChargeCommission`, `generateRamdomString`, `ackno`, `aepsAckno`, `numberToDate`, `randomNumber`, `from_date`, `to_date`, `getOffset`, `isNumber`, `splitName`, `generatePaymentRequestId`
  - **Why**: Reduces the module to its actual role (error handler + OTP), eliminates latent bugs (`isNumber`, `getOffset`), and removes ~340 lines of confusing context for new maintainers
  - **When**: Next quarter — first confirm no caller exists in the shared-library package or any downstream service before deleting
  - **Where**: `services/common.js:51–454` (everything after `errorHandler` except `generateOtp` at line 358)

- **`splitName` is duplicated in `digit.mapper.js`** (two sources of truth)
  - **What**: Either delete `CommonService.splitName` (if the motor flow never needs it) or have `digit.mapper.js` adopt `CommonService.splitName` with a field-name adapter (`firstName`→`first_name` etc.)
  - **Why**: Two independent implementations with different output shapes (`{ first_name, middle_name, last_name }` vs `{ firstName, lastName }`) will diverge silently if either is updated
  - **When**: Nice to have
  - **Where**: `services/common.js:429–453` vs `services/insurers/digit/digit.mapper.js:47–57`

- **`calculateChargeCommission` is duplicated in `services/commission.js`** (duplicate arithmetic)
  - **What**: Remove one copy; the commission module (`agentCharge`, `getCommission`) should delegate to `CommonService.calculateChargeCommission` or vice versa
  - **Why**: Two sources of truth for the same FLAT/PERCENT formula — already flagged in the `commission` module doc
  - **When**: Nice to have
  - **Where**: `services/common.js:375–381` vs `services/commission.js:30–38`

- **Dead import in `validations/user.js`**
  - **What**: Remove `const CommonService = require('../services/common');` from `validations/user.js`
  - **Why**: The module is imported but no method is ever called — dead startup cost and misleading to readers
  - **When**: Nice to have
  - **Where**: `validations/user.js:4`

## Open questions

- Do any callers outside this repository (e.g. in the `shared-library` package or any partner service) import `services/common.js` directly, or is it strictly an internal module? This must be confirmed before removing the 38 dead-code functions.
- `resgistrationUserRole` (note the typo) returns hardcoded role IDs 3, 4, 5 for Master Distributor, Distributor, and Retailer. Are these IDs stable DB constants or should they come from the database? If stable, they should move to `constants/common.js`.
- `generatePaymentRequestId` includes milliseconds and a random suffix but not a UUID or cryptographically secure random source — is collision resistance sufficient for production payment request IDs?
