# SMS

## What this module does
The SMS module is the designated place for sending text messages (SMS) to customers. Its only current function, `senderVerificationOTP`, is meant to deliver a one-time password (OTP) to a customer's mobile number so the customer can verify their identity. In practice, the sending logic is an empty stub — the function accepts the OTP but does not actually transmit it.

## Why this module exists
Sender (remitter) registration requires phone verification: a code is generated, stored on the remitter record, and the customer must enter it to confirm ownership of the number. Splitting the delivery channel into its own file keeps the transport concern (SMS gateway calls, credentials) separate from the business logic that decides when to send an OTP.

## When this module runs / is used
`senderVerificationOTP` is called by `services/sender-registration.js` in three situations:

1. **Search (remitter exists, unverified)** — when the search endpoint finds an existing remitter whose `is_verified` flag is `"NO"`, a fresh OTP is generated and passed to this function so it can be delivered before the user is asked to verify.
2. **Add (new remitter)** — when a remitter record is created for the first time, an OTP is included in the payload saved to the database and then passed here for delivery.
3. **Resend OTP** — the `resendOtp` endpoint reads the stored OTP from the database and passes it here again.

## How it fits in

| Direction | Module |
|---|---|
| Depends on | Nothing — no imports |
| Used by | `services/sender-registration.js` (the only caller) |

## Key files

| File | Purpose |
|---|---|
| `services/sms.js` | Exports `senderVerificationOTP(otp)` — the single entry point for SMS delivery. Currently a stub with no gateway integration. |

## Optimization opportunities

- **What**: Implement the SMS sending body inside `senderVerificationOTP` using a real SMS gateway (e.g. MSG91, Fast2SMS, or Twilio).
  **Why**: The function is called in production with a live OTP, but the message is silently dropped. Customers never receive the verification code, making remitter registration non-functional in production.
  **When**: Now
  **Where**: `services/sms.js`, lines 3–7 (the empty `if` block)

- **What**: Add structured logging (using the project's Winston logger) for both successful dispatch and failure cases.
  **Why**: With no logging, silent failures are invisible in production logs — there is no way to diagnose why customers are not receiving OTPs.
  **When**: Now (implement alongside the gateway integration)
  **Where**: `services/sms.js`, inside `senderVerificationOTP`

- **What**: Make the function `async` and return a result (success/failure) so the caller can react — for example, by returning an error response instead of a success when delivery fails.
  **Why**: Currently callers ignore the return value because it is always `undefined`. A failed delivery is indistinguishable from a successful one.
  **When**: Now (implement alongside the gateway integration)
  **Where**: `services/sms.js` line 3; `services/sender-registration.js` lines 46, 69, 88

- **What**: Store OTPs as a one-way hash (e.g. bcrypt or SHA-256) rather than plaintext in the `remitter` table.
  **Why**: A database leak exposes valid, live OTPs that can be used to verify arbitrary remitter accounts.
  **When**: Next quarter
  **Where**: `services/sender-registration.js` lines 58–64 (OTP written to DB); line 77 (OTP comparison in `verify`)

- **What**: Add an OTP expiry timestamp to the `remitter` record and reject OTPs that are too old.
  **Why**: Without expiry, a stolen OTP remains valid indefinitely, which is a security risk.
  **When**: Next quarter
  **Where**: `services/sender-registration.js` `verify` function (line 77)

- **What**: Introduce a test file for the sms module (and the sender-registration flows that consume it).
  **Why**: There are no tests at all for this path; once the gateway is implemented, regressions will be silent.
  **When**: Next quarter
  **Where**: `tests/api/routes/` (follow the existing spec file naming convention)

## Open questions

- Which SMS gateway does the business use (or intend to use)? The code gives no hint — no package is installed and no environment variable is named for a gateway API key.
- Should `senderVerificationOTP` log or swallow gateway errors silently? The current shape suggests "fire and forget", but that may not be intentional.
- Is the `APP_MODE` environment variable documented anywhere? It is checked in `sms.js` and `services/common.js` but does not appear in `.env.test` or the constants files.
- Is remitter/sender registration part of the motor insurance product, or is it a separate financial services product that happens to live in this codebase? The `MysqlRemitterModel` and wallet logic in `sender-registration.js` feel distinct from the motor insurance flow documented in `CLAUDE.md`.
