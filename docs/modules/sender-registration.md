# Sender Registration

## What this module does

This module manages the registration and OTP-based verification lifecycle for "remitters" — the senders in a domestic money-transfer (DMT) or wallet product. It also computes per-wallet spending limits for a given remitter so the caller knows how much of their monthly allowance has been used and how much remains. The four main operations are: look up a remitter by mobile number, register or update a remitter's details, verify an OTP to activate the account, and resend the stored OTP.

## Why this module exists

In money-transfer products, a "remitter" (the person sending money) must be registered and identity-verified before transactions are allowed. Keeping this registration logic in a dedicated service isolates the remitter lifecycle — which involves OTP generation, wallet-balance lookups, and verification-state transitions — from the broader motor-insurance flow and from the third-party DMT adapter in `services/third-party.js`.

## When this module runs / is used

**This module is currently not reachable via any HTTP endpoint.** Its exported functions (`search`, `add`, `verify`, `resendOtp`, `setWalletLimit`) are not imported by any route file or controller in the codebase, and there is no corresponding route file in `routes/`. The module was written in anticipation of a remitter/wallet feature but has not been wired up yet.

If and when it is connected, the expected trigger points would be:

- `search(req, res)` — called when a frontend looks up whether a mobile number is already registered as a remitter.
- `add(req, res)` — called when a customer submits the remitter registration form.
- `verify(req, res)` — called when a customer enters the OTP that was sent to their mobile.
- `resendOtp(req, res)` — called when a customer requests the OTP to be re-sent.

## How it fits in

**Depends on:**
- `models/mysqldb/remitter` — provides `MysqlRemitterModel` for all remitter DB reads and writes. **These model files do not currently exist in the local `models/mysqldb/` folder** — they are expected to come from the shared-library package.
- `models/mysqldb/balance` — provides `MysqlBalanceModel` to read payout wallet balances. Same gap as above.
- `services/common` — `generateOtp()` produces a 6-digit OTP (fixed `DEFAULT_OTP` in non-production environments).
- `services/sms` — `senderVerificationOTP(otp)` is called to dispatch the OTP via SMS; the SMS send logic is a stub with only a comment placeholder in production mode.
- `utils/response-handler` — `ResponseHandler` shapes all HTTP responses.

**Depended on by:**
- Nothing in the current codebase imports this service.

## Key files

| File | Purpose |
|---|---|
| `services/sender-registration.js` | Single file containing all four endpoint handlers (`search`, `add`, `verify`, `resendOtp`) and the internal wallet-limit helper (`setWalletLimit`). |
| `services/sms.js` | Exports `senderVerificationOTP`; currently a stub — the production send path is an empty comment block. |
| `services/common.js` | Provides `generateOtp()`; returns `process.env.DEFAULT_OTP` outside production. |
| `models/mysqldb/remitter` *(missing)* | Expected model for the `remitter` table — not present locally; should live in shared-library. |
| `models/mysqldb/balance` *(missing)* | Expected model for the `balance` table — not present locally; should live in shared-library. |

## Optimization opportunities

- **What**: Remove the dead `return` statement on line 52 of `sender-registration.js`.
  **Why**: The line (`return { status: 2, error: 0, message: req.t("SENDER_NOT_FOUND"), result: {} };`) immediately follows an earlier `return` on line 51 and can never execute. It is a leftover from a refactor that switched to `ResponseHandler`. Dead code confuses readers and may indicate the refactor was incomplete.
  **When**: Now
  **Where**: `services/sender-registration.js:52`

- **What**: Fix the double `JSON.parse` on the `userdata` header in `search()`.
  **Why**: The `decodeUserData` middleware already replaces `req.headers['userdata']` with the parsed object before controllers or services run. Calling `JSON.parse(userdata)` on line 11 will throw a `SyntaxError` at runtime because the value is already an object, not a JSON string. Every other controller in this codebase reads `req.headers['userdata']` directly without parsing it again.
  **When**: Now
  **Where**: `services/sender-registration.js:11`

- **What**: Pass the recipient mobile number to `senderVerificationOTP()` in `sms.js` and implement the actual SMS dispatch.
  **Why**: `senderVerificationOTP(otp)` is called in three places but only receives the OTP value — not the mobile number to send it to. Even when someone fills in the production branch (currently an empty comment), the function has no way to know the recipient. The feature cannot work end-to-end until this is resolved.
  **When**: Now (blocks the feature entirely)
  **Where**: `services/sms.js:3–6`, `services/sender-registration.js:46, 69, 88`

- **What**: Send a fresh OTP when updating an existing remitter in `add()`.
  **Why**: When a remitter already exists (the `if(remitter)` branch, lines 60–66), the code generates a new OTP, sets `is_verified = 'NO'`, and saves — but then does **not** call `senderVerificationOTP`. The new OTP is stored silently and the remitter has no way to verify it. The `create` path (line 69) correctly calls `senderVerificationOTP` after creation.
  **When**: Now (blocks re-registration flow)
  **Where**: `services/sender-registration.js:60–71`

- **What**: Deduplicate the `PAYOUT_WALLET` and `PAYOUT_UPI` switch cases in `setWalletLimit()`.
  **Why**: Lines 128–135 and 137–145 are byte-for-byte identical. Both cases could fall through to a single block, or share a helper. The duplication means any future change (e.g. adding `payout_upi_wallet` column) must be applied twice and risks diverging.
  **When**: Next quarter
  **Where**: `services/sender-registration.js:127–145`

- **What**: Replace `var` with `const` for `conditions` and `payoutBal` inside the switch cases.
  **Why**: `var` inside a `switch` block is function-scoped, not block-scoped, which can cause accidental variable re-use across cases and makes the code harder to reason about. `const` makes the scope explicit and prevents accidental mutation.
  **When**: Next quarter
  **Where**: `services/sender-registration.js:129, 130, 140, 141`

- **What**: Remove the `console.log("remitter_limit", remitter_limit)` in `search()`.
  **Why**: Debug logging left in production code clutters stdout/logs and may leak internal limit values. The structured Winston logger used everywhere else in the codebase should be used instead if this information is needed.
  **When**: Now
  **Where**: `services/sender-registration.js:21`

- **What**: Add try/catch (or an async error-wrapper middleware) to all four exported handlers.
  **Why**: None of `search`, `add`, `verify`, or `resendOtp` wrap their `await` calls in error handling. An unhandled database rejection will crash the request without a structured JSON error response. Every other controller in this codebase propagates errors to Express's `next(err)`.
  **When**: Next quarter (before any route is wired up)
  **Where**: `services/sender-registration.js:7–91`

- **What**: Do not export `setWalletLimit` from the module.
  **Why**: It is a private helper used only by `search()`. Exporting it invites callers to misuse it with partial data; nothing outside the file currently imports it.
  **When**: Nice to have
  **Where**: `services/sender-registration.js:158–163`

## Open questions

1. **Are `models/mysqldb/remitter.js` and `models/mysqldb/balance.js` expected to be added locally, or should they always come from the shared-library package?** They are required on lines 1 and 5 of the service but do not exist in the local `models/mysqldb/` directory, which will cause a `MODULE_NOT_FOUND` crash at startup if this service is ever imported.

2. **Is this module intended for the A2Z Suvidha DMT (domestic money transfer) product or for a separate wallet feature inside the insurance platform?** The motor-insurance flow does not appear to involve remitter registration; understanding the product context would clarify which team owns this service and when it is expected to be activated.

3. **What route prefix and authentication rules should apply to these endpoints?** The existing routes follow `/api/admin/*` or `/api/customer/motor/*` patterns; sender registration does not obviously fit either group.

4. **Is `resendOtp` intentionally re-sending the previously stored OTP rather than generating a new one?** Reusing a stored OTP is unusual — if the OTP was intercepted or expired, a fresh one should be generated. This may be an intentional design choice or an oversight.
