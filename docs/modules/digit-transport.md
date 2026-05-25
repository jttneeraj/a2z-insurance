# Digit Transport

## What this module does

This module handles all low-level communication with Go Digit's OneAPI platform. It has three responsibilities: resolving the right API URLs and integration IDs for the current environment (UAT or production), fetching a short-lived Bearer access token from Digit's authentication endpoint, and executing individual API calls against Digit's generic executor endpoint by combining the token with a caller-supplied payload.

## Why this module exists

Digit's OneAPI uses a two-step pattern for every call: authenticate first to get a token, then send the real request with that token. Centralising this handshake in one place means the higher-level services (quote, proposal, KYC, payment, policy) do not have to understand authentication mechanics. The config layer exists separately so that UAT and production credentials can differ without changing any calling code.

## When this module runs / is used

Every outbound call to Go Digit triggers this module:

- `digit.config.js` is read at the start of any Digit service method to get the correct URLs and integration IDs for the environment passed in the request payload (defaults to `"UAT"`).
- `digit.auth.service.js#getAccessToken` is called before every real API request — once by `DigitExecutorService` for KYC, payment, and policy flows, and directly by `DigitQuoteService` and `DigitProposalService` for quote and proposal flows.
- `digit.executor.service.js#execute` is called by `digit.kyc.service.js`, `digit.payment.service.js`, and `digit.policy.service.js` as their single point of entry for authenticated Digit calls.

## How it fits in

**Depends on:**
- `services/insurers/common/insurer-http-client.js` — all outbound HTTP is made through `postJson` from this module.
- `services/insurers/common/insurer-api-log.service.js` — every auth and executor call is logged before the request is sent and updated with success or failure afterwards.
- Environment variables (`DIGIT_PROD_*`, `DIGIT_UAT_USERNAME`, `DIGIT_UAT_PASSWORD`) — read at runtime by `digit.config.js`.

**Used by:**
- `digit.quote.service.js` — imports `DigitConfig` and `DigitAuthService` directly.
- `digit.proposal.service.js` — imports `DigitConfig` and `DigitAuthService` directly.
- `digit.kyc.service.js` — imports `DigitConfig` and `DigitExecutorService`.
- `digit.payment.service.js` — imports `DigitConfig` and `DigitExecutorService`.
- `digit.policy.service.js` — imports `DigitConfig` and `DigitExecutorService`.

## Key files

| File | Purpose |
|---|---|
| `services/insurers/digit/digit.config.js` | Returns the full set of API URLs, credentials, and integration IDs for a given environment string (`"UAT"` or `"PROD"`). UAT values are hardcoded; PROD values are read from environment variables. |
| `services/insurers/digit/digit.auth.service.js` | Fetches a fresh Bearer token from Digit's auth endpoint, redacts credentials in the API log, and throws a structured error if authentication fails. Exported as a singleton. |
| `services/insurers/digit/digit.executor.service.js` | Obtains a token, attaches it to the request, calls Digit's executor endpoint, logs success or failure, and returns a normalised result object. Exported as a singleton. |

## Optimization opportunities

- **What**: Cache the access token in memory with a TTL derived from the `expiresIn` field returned by the auth endpoint, rather than fetching a new token on every call.
  **Why**: Each Digit API call currently makes two HTTP round-trips — one to `/auth` and one to `/executor`. Token caching would halve the number of outbound calls and reduce per-request latency by one network hop.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.auth.service.js` (add a module-level token cache and expiry check before making the auth request)

- **What**: Route `digit.quote.service.js` and `digit.proposal.service.js` through `DigitExecutorService.execute()` instead of calling `DigitAuthService` and `postJson` directly.
  **Why**: These two services bypass the executor and re-implement the same auth-fetch + HTTP-call + error-throw pattern that the executor already encapsulates. Any future change to that pattern (retry logic, header additions, new error handling) must be applied in three places instead of one.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.quote.service.js` lines 42–58; `services/insurers/digit/digit.proposal.service.js` lines 54–71

- **What**: Replace `console.log` calls with the application's Winston logger.
  **Why**: `console.log` on line 95 of `digit.auth.service.js` and similar calls in `digit.quote.service.js` (line 60) and `digit.proposal.service.js` (line 75) bypass the structured logging infrastructure. Log entries from these paths will not carry the standard metadata fields, will not appear in the daily-rotated log files, and will not be captured by the HTTP transport in production.
  **When**: Now
  **Where**: `services/insurers/digit/digit.auth.service.js:95`, `services/insurers/digit/digit.quote.service.js:60`, `services/insurers/digit/digit.proposal.service.js:75`

- **What**: Move the UAT integration IDs (`quickQuoteIntegrationId`, `createQuoteIntegrationId`, etc.) from hardcoded string literals to environment variables, mirroring the pattern already used for the PROD equivalents.
  **Why**: If Digit rotates or reassigns these IDs, a code change and full deployment are currently required. Externalising them to env vars means the values can be updated in the environment without touching the codebase.
  **When**: Nice to have
  **Where**: `services/insurers/digit/digit.config.js` lines 26–31

- **What**: Remove the duplicate `raw_response_payload` field from the executor's return object, or clarify why it differs from `response_payload`.
  **Why**: Both `response_payload` (line 84) and `raw_response_payload` (line 85) are assigned the same value (`response.body`). The distinction is not used by any caller and may mislead future maintainers into thinking transformation occurs between the two.
  **When**: Nice to have
  **Where**: `services/insurers/digit/digit.executor.service.js` lines 83–85

## Open questions

- **DIGIT_ONE code purpose**: The factory (`insurer.factory.js`) maps both `"DIGIT"` and `"DIGIT_ONE"` to the same set of Digit services. `digit.config.js` treats any non-`"PROD"` environment string as UAT, so `DIGIT_ONE` does not produce a different configuration. Is `DIGIT_ONE` meant to target a separate Digit environment (e.g., a second production account or a staging slot), and if so, should `getConfig` handle it as a third case?

- **Token expiry value**: The auth service logs `expiresIn` from the Digit response but does not use it for any caching or validation. What is the actual TTL of a Digit access token, and is fetching a fresh token per call within Digit's rate limits?

- **`DIGIT_PROD_EXECUTOR_URL` vs executor pattern**: The UAT config hardcodes the executor URL; production reads it from `DIGIT_PROD_EXECUTOR_URL`. Are the UAT and PROD executor endpoints structurally identical (same path, same request schema), or do they differ in ways that might require separate logic paths?
