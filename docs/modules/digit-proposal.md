# Digit Proposal

## What this module does

This module sends a motor insurance proposal to the Go Digit insurer API. When a customer selects a quote and proceeds to buy, this module takes all the collected data (vehicle details, owner identity, policy choices, KYC information, nominee details) and packages it into the format Digit requires, then submits it. The response — Digit's internal application ID and a preliminary policy number — is returned to the caller so it can be stored against the proposal record.

## Why this module exists

Every insurer has its own API contract for what a "create proposal" call must look like. Isolating the Digit-specific logic here keeps the motor-proposal controller insurer-agnostic: it only calls a generic `createMotorProposal(...)` interface and does not need to know anything about Digit's authentication, endpoint URLs, or field naming. This follows the same adapter pattern used for Digit's quote, payment, KYC, and policy steps.

## When this module runs / is used

Triggered when a customer (or agent) submits `POST /api/customer/motor/proposal/add` with `insurer_code: "DIGIT"` or `"DIGIT_ONE"`. The motor-proposal controller resolves the right adapter via `InsurerFactory.getMotorProposalService(insurerCode)`, which returns this service. The service always runs after the internal `quote_proposal` row has been created in the database (inside a transaction) and before that row is updated with Digit's application ID and policy reference.

## How it fits in

- **Depends on**
  - `digit.config.js` — provides UAT/PROD endpoint URLs and integration IDs
  - `digit.auth.service.js` — fetches a short-lived Bearer token from Digit's auth endpoint before each call
  - `digit.mapper.js` — builds the full Digit-format request body (`buildCreateQuotePayload`) and normalizes Digit's response (`normalizeCreateQuoteResponse`)
  - `common/insurer-http-client.js` — makes the outbound HTTPS POST
  - `common/insurer-api-log.service.js` — persists the raw request and response for auditing
- **Used by**
  - `services/insurers/insurer.factory.js` — registers and returns this service for insurer codes `DIGIT` and `DIGIT_ONE`
  - `controllers/motor-proposal.js` — the only caller; invokes `createMotorProposal(...)` and stores the result

## Key files

| File | Purpose |
|---|---|
| `services/insurers/digit/digit.proposal.service.js` | Core adapter: orchestrates auth, request building, HTTP call, logging, and response normalization |
| `services/insurers/digit/digit.mapper.js` | Builds the Digit-format proposal payload and normalizes the response (shared with quote, payment, KYC, policy steps) |
| `services/insurers/digit/digit.config.js` | UAT endpoints hardcoded; PROD endpoints read from environment variables |
| `services/insurers/digit/digit.auth.service.js` | Fetches and returns a Digit Bearer access token, logging the token call as `TOKEN_GENERATION` |
| `services/insurers/common/insurer-http-client.js` | Generic HTTP client used for all outbound insurer calls |
| `services/insurers/common/insurer-api-log.service.js` | Persists request/response pairs to the `insurer_api_log` table |
| `services/insurers/mock/mock.proposal.service.js` | Drop-in mock that satisfies the same interface for local development and testing |
| `controllers/motor-proposal.js` | HTTP controller that triggers this adapter and writes results back to the database |

## Optimization opportunities

- **What**: Remove the four `console.log` debug statements (including emoji) in `digit.mapper.js` `buildPolicyHolderPerson` (lines 269–272) and the one in `digit.auth.service.js` (line 95).
  **Why**: These fire on every proposal call in production, logging full `payload`, `proposal`, and `ownerDetail` objects that contain PII (mobile, email, date of birth, names). They also create noise in the log aggregation pipeline and can inflate log storage costs.
  **When**: Now
  **Where**: `services/insurers/digit/digit.mapper.js:269–272`, `services/insurers/digit/digit.auth.service.js:95`

- **What**: Fix the hardcoded state code `state: "8"` in `buildPolicyHolderPerson` and restore the dynamic lookup from `ownerDetail.state_code`.
  **Why**: The commented-out line above it (`//state: payload.state || payload.state_code || ownerDetail?.state_code || "8"`) shows this was once dynamic. Hardcoding `"8"` (Himachal Pradesh) means proposals for customers in any other state are submitted with the wrong state to Digit, which can cause KYC and issuance failures or silent policy errors.
  **When**: Now
  **Where**: `services/insurers/digit/digit.mapper.js:293`

- **What**: Cache the Digit access token for its declared `expiresIn` duration instead of fetching a new token on every proposal call.
  **Why**: Every `createMotorProposal` call currently makes two sequential outbound HTTP requests — one to the auth endpoint and one to the executor. Token caching (in memory or Redis, which is already a project dependency) would cut round-trip latency and reduce load on Digit's auth endpoint. The `expiresIn` field is already present in the auth response.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.auth.service.js` (add a TTL cache keyed on `insurerId + environment`)

- **What**: Remove the fallback payload builder (`buildFallbackCreateQuotePayload`) and the `normalizeCreateQuoteResponse` instance method from `digit.proposal.service.js`.
  **Why**: The guard `if (DigitMapper.buildCreateQuotePayload)` (lines 21–29) will always be true — the mapper always exports this method. The fallback is dead code that can mislead a developer into thinking the mapper method is optional, and the duplicate normalizer on the service diverges from the canonical one in the mapper (missing the `final_premium` field).
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.proposal.service.js:21–29`, `145–157`

- **What**: Replace the placeholder default values (`"Test Address"`, `"test@example.com"`, `"9876543210"`, `"KA01ED4289"`, `"CHASSIS12345"`) with hard failures or explicit validation in `buildPolicyHolderPerson` and `buildVehicle`.
  **Why**: These defaults silently allow malformed or incomplete proposals to reach Digit with fake data. Digit may accept the request in UAT but the resulting application ID is based on bogus data. In production this would cause issuance failures or fraudulent policy records.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.mapper.js:283–421`

- **What**: Add unit tests for `DigitProposalService.createMotorProposal` and the mapper's `buildCreateQuotePayload`/`normalizeCreateQuoteResponse` functions.
  **Why**: There are currently no tests for this module. The mapping logic has many conditional field paths and default fallbacks; a test suite would catch regressions when the mapper is edited (it is frequently changed per recent commit history).
  **When**: Next quarter
  **Where**: `tests/` (new file, e.g. `tests/services/insurers/digit/digit.proposal.spec.js`)

## Open questions

- The `selectedPlan` parameter is threaded from the controller through to `createMotorProposal` and then into `buildCreateQuotePayload`, but neither the service nor the mapper currently reads any field from it. Was it intended to carry add-on selections or IDV overrides? If not, the parameter can be dropped from the interface.
- The `buildPolicyhHolderPerson` method always sets `state: "8"` (hardcoded). Was this a temporary workaround for a specific Digit UAT environment issue, or was it done to unblock a demo? A maintainer should confirm whether this is safe to revert.
- `DigitConfig.getConfig` for PROD reads all endpoint URLs from environment variables, but the UAT URLs are hardcoded strings. Is there a case where UAT endpoints need to change without a code deploy (e.g. Digit migrates their sandbox)? If so, UAT URLs should also move to env vars.
