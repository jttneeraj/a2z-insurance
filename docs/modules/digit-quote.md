# Digit Quote

## What this module does

This module calls the Go Digit insurance API to fetch a motor vehicle insurance quote. It sends vehicle, owner, and policy details to Digit's "quick quote" endpoint and returns a normalised premium breakdown (net premium, GST, IDV range, etc.) that the rest of the system stores and shows to the customer.

## Why this module exists

Digit (Go Digit General Insurance) is one of the real insurer integrations in the platform. Keeping the Digit-specific quoting logic in its own service isolates the insurer-specific HTTP call, authentication, field mapping, and error handling from the generic motor-quote orchestration in the controller. This makes it straightforward to add or swap insurer adapters without touching shared code.

## When this module runs / is used

Called whenever a user requests a motor insurance quote and the resolved insurer code is `DIGIT` or `DIGIT_ONE`. Concretely:

1. `POST /api/customer/motor/generate-quote` hits `controllers/motor-quotes.js`.
2. The controller calls `InsurerFactory.getMotorQuoteService("DIGIT")`, which returns this service.
3. The controller calls `generateMotorQuote({ quoteRequest, insurerId, insurerProductId, payload })`.

## How it fits in

**Depends on:**
- `digit-transport` (`digit.config.js`) — resolves environment-specific API URLs and integration IDs
- `digit-transport` (`digit.auth.service.js`) — fetches a Bearer token from Digit's auth endpoint before each call
- `digit-mapper` (`digit.mapper.js`) — builds the outbound JSON payload and normalises the raw Digit response into the platform's schema
- `insurer-http-client` (`common/insurer-http-client.js`) — makes the outbound HTTPS POST
- `insurer-api-log-service` (`common/insurer-api-log.service.js`) — persists the request and response for audit and debugging

**Depended on by:**
- `insurer-factory` (`services/insurers/insurer.factory.js`) — selects this service when `insurerCode` is `DIGIT` or `DIGIT_ONE`
- `motor-quotes` (`controllers/motor-quotes.js`) — the sole caller

## Key files

| File | Purpose |
|---|---|
| `services/insurers/digit/digit.quote.service.js` | The only file in this module. Orchestrates auth → HTTP call → log update for the Digit quick-quote API. |
| `services/insurers/digit/digit.mapper.js` (lines 77–161, 534–536) | `buildQuickQuotePayload` builds the outbound body; `normalizeQuickQuoteResponse` / `normalizeDigitQuickQuoteResponse` converts the raw Digit response to the platform schema. |
| `services/insurers/digit/digit.config.js` | Provides UAT (hardcoded) and PROD (env-var) URLs and integration IDs. |

## Optimization opportunities

- **What**: Replace all `console.log` calls with the Winston logger (`require('../../winston')` or the shared logger).
  **Why**: `console.log` bypasses log rotation, structured metadata, and the HTTP transport used in production. Lines 60, 66–69, and 106 of `digit.quote.service.js` would be invisible in centralized log aggregation.
  **When**: Now
  **Where**: `services/insurers/digit/digit.quote.service.js` lines 60, 66–69, 106

- **What**: Cache the Digit access token (in memory or Redis) for its `expiresIn` duration instead of fetching a fresh token before every quote call.
  **Why**: Each `generateMotorQuote` call currently makes two sequential external HTTP requests (auth then executor). Token reuse eliminates the auth round-trip for the common case, halving latency and reducing load on Digit's auth server. The token lifetime is returned in `response.body.expiresIn` but is currently discarded.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.auth.service.js` and `digit.quote.service.js` line 43

- **What**: Remove the commented-out old `getAccessToken` call (one-argument form) on line 42 of `digit.quote.service.js`.
  **Why**: Dead code adds noise and confuses readers about which form is current. The replacement on lines 43–49 is already in use.
  **When**: Now
  **Where**: `services/insurers/digit/digit.quote.service.js` line 42

- **What**: Remove the `_debugMappedFrom` key from the payload returned by `buildQuickQuotePayload` in `digit.mapper.js` (lines 155–159), or move it into a separate debug-only field that is never sent to Digit.
  **Why**: The key is included in `requestPayload` which is posted directly to Digit's API. While Digit likely ignores unknown fields, sending internal debug information (owner name, mobile, email) to a third-party endpoint is a data-hygiene and minor privacy risk.
  **When**: Now
  **Where**: `services/insurers/digit/digit.mapper.js` lines 155–159

- **What**: Add test coverage for `generateMotorQuote` — happy path, Digit API failure, and auth failure.
  **Why**: There are currently zero tests for any Digit service file. A quote is the first billable step in the motor flow; an undetected regression here silently breaks the customer journey for all Digit quotes.
  **When**: Next quarter
  **Where**: `tests/` (no existing test file for this module)

- **What**: The `plan_name` is hardcoded to `"Digit Motor Comprehensive"` in `normalizeDigitQuickQuoteResponse` (mapper line 101) regardless of what Digit returns.
  **Why**: If Digit's API introduces additional product types (third-party-only, standalone OD, etc.), all quotes will be mis-labelled, which will mislead customers and downstream logic that keys on plan name.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.mapper.js` line 101

## Open questions

- What is the actual `expiresIn` value returned by Digit's auth endpoint, and is token reuse safe across concurrent requests in the current single-process Node deployment?
- Should `insurerProductId` passed into `generateMotorQuote` influence the `insuranceProductCode` or `subInsuranceProductCode` sent to Digit, or is the current hardcoded `"20101"` / `"PB"` always correct?
- The `environment` value defaults to `"UAT"` from `payload?.environment`. Is there a safeguard that prevents a production deployment from accidentally hitting the Digit UAT endpoint if the caller omits the field?
