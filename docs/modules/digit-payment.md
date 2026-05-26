# Digit Payment

## What this module does

This module generates a payment link for a motor insurance proposal by calling Digit's OneAPI payment endpoint. It receives a proposal reference, creates a local payment record in the database, calls the Digit API to obtain a hosted payment URL, and stores the returned payment details (link, amount, Digit-assigned payment ID) back against the record.

## Why this module exists

Motor insurance policies at Digit require an online payment step before the policy is issued. The buyer must visit a payment gateway page hosted by Digit. This module encapsulates the entire handshake: persisting the pending payment locally so it can be tracked even if the API call fails, invoking Digit's "payment link generation" API, and normalising the response into the internal schema so the rest of the platform never needs to know Digit-specific field names.

## When this module runs / is used

Triggered when the customer is ready to pay after proposal creation. The API surface is:

- `POST /api/customer/motor/payment/initiate` — creates a payment record and returns a `payment_link` URL the front-end redirects the user to.
- `GET  /api/customer/motor/payment/status/:id` — looks up a payment record by its internal ID (no insurer call; database read only).

Both endpoints require the `userdata` header (standard platform auth middleware). The payment initiation endpoint is the primary entry point and is called once per proposal.

## How it fits in

**Depends on:**
- `services/insurers/digit/digit.executor.service.js` — handles Digit OneAPI HTTP transport, auth token injection, and API logging.
- `services/insurers/digit/digit.mapper.js` — `buildPaymentPayload` (assembles the request body) and `normalizePaymentResponse` (maps Digit response fields to internal names).
- `services/insurers/digit/digit.config.js` — supplies the `paymentIntegrationId` (`28926-0100` for UAT; `DIGIT_PROD_PAYMENT_ID` env var for PROD) and base URLs.
- `services/insurers/insurer.factory.js` — `getMotorPaymentService("DIGIT")` returns the singleton instance of this service.
- `models/mysqldb/proposal-payment.js` — stores the `proposal_payment` row before and after the API call.
- `models/mysqldb/quote-proposal.js` — reads the proposal to retrieve `insurer_id`, `insurer_application_id`, and premium.
- `services/common.js` — `errorHandler` utility for structured error logging.
- `services/insurers/common/insurer-http-client.js` — underlying HTTP client used by the executor.
- `services/insurers/common/insurer-api-log.service.js` — persists the raw Digit request/response pair for audit.

**Depended on by:**
- `controllers/motor-payment.js` — the only consumer; drives the full payment initiation flow.
- `routes/motor-payment.js` — mounts the two HTTP endpoints and delegates to the controller.
- `app.js` — registers the route under `/api/customer/motor/payment`.

## Key files

| File | Purpose |
|---|---|
| `services/insurers/digit/digit.payment.service.js` | Core service: validates inputs, delegates to mapper + executor, returns normalised result |
| `controllers/motor-payment.js` | HTTP layer: parses request, creates DB record in a transaction, calls service, updates record, returns response |
| `routes/motor-payment.js` | Express router: two routes — `POST /initiate` and `GET /status/:id` |
| `services/insurers/digit/digit.mapper.js` (lines 510–558) | `buildPaymentPayload` assembles the Digit request; `normalizePaymentResponse` maps Digit response fields to internal schema |
| `services/insurers/digit/digit.config.js` (line 17, 31) | Supplies `paymentIntegrationId` per environment (`28926-0100` for UAT) |

## Optimization opportunities

- **What**: The `proposal_payment` row is created inside a transaction in `motor-payment.js`, but the Digit API call and the subsequent `update` happen *outside* it — if the update fails after the Digit call succeeds, the DB record stays `PENDING` with no link even though Digit returned one.
  **Why**: Data consistency — a partial failure leaves a stale row that is hard to reconcile manually, and a retry will create a duplicate payment attempt.
  **When**: Now
  **Where**: `controllers/motor-payment.js` lines 24–78

- **What**: The payment `amount` field used in the DB insert comes from `proposal.final_premium` (line 38), but the update on line 75 can silently overwrite it with `normalized.amount` which is `0` if Digit omits `premium` from the response. Guard with `normalized.amount || payment.amount` already exists but `Number(0)` is falsy — the expression resolves correctly only by accident; an explicit null-check would make intent clear.
  **Why**: Correctness / readability — the current logic works because `0 || payment.amount` returns `payment.amount`, but the intent is "use Digit amount only when Digit actually returned a positive value."
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.mapper.js` line 554; `controllers/motor-payment.js` line 75

- **What**: `normalizePaymentResponse` hard-codes `payment_status: "FAILED"` when `paymentLink` is absent (line 556 in `digit.mapper.js`), but a missing link can also indicate that the Digit API returned a non-error response for an in-progress or already-paid application. Add a dedicated check or expose the raw `paymentStatus` field so the controller can distinguish the two cases.
  **Why**: Correctness — callers currently cannot tell whether a missing link means "Digit rejected it" or "Digit is still processing"; this can result in premature FAILED status being shown to the customer.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.mapper.js` lines 550–558

- **What**: The `detail` endpoint (`GET /status/:id`) uses a bare `console.log` for error logging (line 133 in `controllers/motor-payment.js`) rather than the structured `CommonService.errorHandler` pattern used by the `initiate` endpoint. Aligning both ensures logs have the standard metadata fields expected by Winston and the 404/error handlers.
  **Why**: Maintainability / observability — inconsistent logging makes it harder to aggregate errors in production.
  **When**: Nice to have
  **Where**: `controllers/motor-payment.js` lines 131–134

- **What**: `DIGIT_PROD_PAYMENT_ID` is the only payment-specific env var without a fallback. If it is unset at runtime in a PROD deployment, `paymentIntegrationId` will be `undefined` and the Digit executor will silently pass an empty `integrationid` header, causing every payment call to fail with a generic Digit 400.
  **Why**: Reliability / fail-fast — a startup guard or validation call (alongside similar checks in `digit.config.js` for the other PROD IDs) would surface the misconfiguration before real traffic hits it.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.config.js` lines 5–18

## Open questions

- Does the business require payment status webhooks from Digit, or is the current pull-only model (`GET /status/:id`) sufficient? No callback/webhook handler exists in this module.
- The legacy `controllers/motor-payment copy.js` has identical logic. It is not imported anywhere but should be deleted to avoid confusion — confirm it is safe to remove.
- Is there a planned retry or idempotency key for the Digit payment link API? Re-submitting the same `applicationId` to Digit could create duplicate payment sessions.
