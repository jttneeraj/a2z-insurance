# Mail

## What this module does

The mail module is intended to provide outbound email notifications via SMTP. It defines a `MailService` class with a single `sendEmail` method that accepts a recipient address, subject line, HTML body, and an optional sender address, then hands the message off to an SMTP relay using the `nodemailer` package. As of today the module is an incomplete stub — it is never imported by any other file and would crash at runtime if called.

## Why this module exists

Email notifications are a standard channel for confirming events like policy issuance, payment receipts, KYC status updates, and OTPs to end customers. The module was created to house that capability in one place rather than scattering SMTP logic across controllers or services. The `nodemailer` dependency (`^6.9.5`) is already declared in `package.json`, indicating the feature was planned but not completed.

## When this module runs / is used

Currently this module **never runs**. No other file in the codebase imports or calls it. It was introduced in the initial commit and has not been touched since. The intended trigger would be any flow that needs to notify a customer or agent by email (e.g., after a policy is issued or a payment is confirmed), but that wiring has not been built.

## How it fits in

- **Depends on**: `nodemailer` (npm package, `^6.9.5`) — but does not currently `require` it, so the dependency is declared but unused.
- **Depended on by**: Nothing — no other module imports `services/mail.js`.

## Key files

| File | Purpose |
|------|---------|
| `services/mail.js` | Defines the `MailService` class and its `sendEmail` method. The only file in this module. |

## Optimization opportunities

- **What**: Add the missing `require('nodemailer')` at the top of `services/mail.js`.
  **Why**: The file references `nodemailer` as a global, which will throw `ReferenceError: nodemailer is not defined` the moment `sendEmail` is called. The package is already installed; it just needs to be required.
  **When**: Now (blocks any future use).
  **Where**: `services/mail.js` line 1.

- **What**: Add `module.exports = new MailService()` (or export the class) so the module can actually be imported.
  **Why**: Without an export statement the file is a dead file — `require('./mail')` returns an empty object, making the class completely inaccessible.
  **When**: Now (blocks any future use).
  **Where**: `services/mail.js` (end of file, after the class definition).

- **What**: Replace the hardcoded `smtp.ethereal.email` host with environment-variable-driven SMTP configuration (`SMTP_HOST`, `SMTP_PORT`).
  **Why**: Ethereal Mail is a fake SMTP sink for local testing — messages sent to it are never delivered. A real host (AWS SES, SendGrid, or a self-hosted relay) must be configured for any production or staging use.
  **When**: Now (the current implementation cannot deliver real email under any configuration).
  **Where**: `services/mail.js` lines 7–14.

- **What**: Rename the SMTP credential environment variables from `USER` / `PASS` to something specific like `SMTP_USER` / `SMTP_PASS`.
  **Why**: `USER` is a reserved Unix/Linux environment variable that always contains the OS login name of the running process. Using it as an SMTP username means the wrong value will be read in every deployment environment.
  **When**: Now (silent misconfiguration risk).
  **Where**: `services/mail.js` lines 11–12; also update `.env` / `.env.test` templates and deployment config.

- **What**: Add a `try/catch` block around the `transporter.sendMail` call and replace the `console.log` success message with a Winston logger call.
  **Why**: Unhandled promise rejections from a failed SMTP call will bubble up to the caller with no structured log entry. The rest of the codebase uses Winston with structured metadata (`{ url, function, operation }`) — this module should follow the same pattern.
  **When**: Next quarter (once the blocking issues above are fixed and the module is actually wired up).
  **Where**: `services/mail.js` lines 17–19.

- **What**: Wire `sendEmail` into at least one real flow (e.g., post-payment confirmation or post-policy-issuance) and add integration or unit tests.
  **Why**: The `nodemailer` package costs roughly 2 MB in the production bundle and is listed as a production dependency, but currently delivers zero value. Either complete the integration or remove the package and the stub file to reduce attack surface and bundle weight.
  **When**: Next quarter.
  **Where**: `services/mail.js`; caller: `controllers/motor-payment.js` or `controllers/motor-policy.js` (most natural trigger points).

## Open questions

- **Which email events should be sent?** It is unclear from the code which business events (payment confirmed, policy issued, KYC rejected, OTP) are meant to trigger an email. The `sms.js` module handles OTP via SMS — is email expected to duplicate that, or cover a different set of events?
- **Which SMTP provider is planned for production?** The codebase uses AWS (via `lib/aws.js`) and has AWS credentials in env vars — AWS SES may be the intended provider, but this is not reflected in `mail.js` at all.
- **Should this module be deleted?** If email notifications are not on the near-term roadmap, removing the stub and the `nodemailer` dependency would reduce maintenance overhead until the feature is needed.
