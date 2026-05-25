# Digit KYC

## What this module does

This module handles KYC (Know Your Customer) verification status checks for the Go Digit insurer integration. It exposes a single operation — `checkKycStatus` — which queries the Digit OneAPI platform to retrieve the current KYC verification state of a motor insurance policy. The normalized result tells the caller whether KYC is complete, pending, or failed, along with supplementary payment and policy status fields.

## Why this module exists

Insurance regulations require that customers complete identity verification (KYC) before a policy can be issued. After a proposal is submitted and payment is initiated, the application polls Digit to confirm that the KYC check has cleared. This module isolates all Digit-specific KYC logic so the rest of the codebase can remain insurer-agnostic — the controller asks the factory for a KYC service by insurer code, and this module is what the factory returns for `DIGIT` or `DIGIT_ONE`.

## When this module runs / is used

Triggered by an HTTP `POST /api/customer/motor/kyc/status` request. In the motor insurance flow this endpoint is called after payment initiation — typically polled by the frontend until `kyc_status` returns `"DONE"`. The request must include `insurer_id`, `insurer_code`, and either `policyNumber` or `policy_number` in the JSON body.

## How it fits in

**Depends on:**
- `digit-transport` (`digit.config.js`, `digit.executor.service.js`) — provides environment configuration and the authenticated HTTP call wrapper
- `digit-mapper` (`digit.mapper.js`) — builds the Digit-format request payload and normalizes the raw response into a flat, snake_case structure
- `insurer-factory` — selects this service when the insurer code resolves to `DIGIT` or `DIGIT_ONE`
- `insurer-api-log-service` — called indirectly via `digit.executor.service.js` to persist the request/response log row

**Depended on by:**
- `motor-kyc` controller (`controllers/motor-kyc.js`) — the only direct caller; resolves the service via `InsurerFactory.getMotorKycService(insurerCode)`
- `insurer-factory` (`insurer.factory.js`) — holds a reference to the singleton exported by this module

## Key files

| File | Purpose |
|------|---------|
| `services/insurers/digit/digit.kyc.service.js` | Core service class; validates that `policyNumber` is present, delegates to `DigitExecutorService`, and layers in normalized + raw response fields |
| `services/insurers/mock/mock.kyc.service.js` | Mock implementation used in development and testing; returns a static `kyc_status: "DONE"` response without hitting a real API |
| `services/insurers/digit/digit.mapper.js` (lines 519–568) | `buildKycStatusPayload` wraps the policy number in the `queryParam` envelope Digit expects; `normalizeKycStatusResponse` flattens the deeply nested Digit response into a consistent shape |
| `services/insurers/digit/digit.config.js` | Supplies the `kycStatusIntegrationId` (`28235-0100` in UAT) and the executor URL |
| `services/insurers/digit/digit.executor.service.js` | Generic wrapper: obtains a Bearer token, calls `insurer-http-client`, logs the outcome |
| `controllers/motor-kyc.js` | HTTP layer; validates `insurer_id`, resolves the service, calls `checkKycStatus`, and serializes the response |
| `routes/motor-kyc.js` | Mounts `POST /status` on the router; the app mounts this router at `/api/customer/motor/kyc` |

## Optimization opportunities

- **What**: Replace `console.log(error)` in `controllers/motor-kyc.js` (line 40) with a structured Winston log that includes the metadata fields (`url`, `function`, `operation`, `relativeDetail`, `err`) the rest of the codebase uses.
  **Why**: Raw `console.log` bypasses Winston's file transports and daily rotation, so KYC errors do not appear in the structured log files. Debugging production issues requires log files, not stdout.
  **When**: Now
  **Where**: `controllers/motor-kyc.js` line 40

- **What**: Guard against client-controlled environment switching. The controller passes the entire request body as `payload` to the service, which reads `payload?.environment` (line 8 of `digit.kyc.service.js`) to decide whether to use UAT or PROD credentials. A caller that sends `{ "environment": "PROD" }` will silently hit production Digit APIs.
  **Why**: This is a privilege-escalation risk — a misconfigured or malicious client could trigger real policy queries against the production insurer without any server-side authorization. The environment should be resolved from a server-side configuration or from the `insurer_id` record in the database, not from user input.
  **When**: Now
  **Where**: `services/insurers/digit/digit.kyc.service.js` line 8; `controllers/motor-kyc.js` (does not strip the field before forwarding)

- **What**: Switch error and success responses in `controllers/motor-kyc.js` to use `ResponseHandler` from `utils/response-handler.js` instead of raw `res.status(x).json(...)` calls.
  **Why**: Every other controller uses `ResponseHandler` to ensure consistent JSON shape and i18n-keyed messages. This controller is the only one in the motor flow that bypasses it, which means its error responses have a different schema and its messages are hard-coded English strings rather than locale keys.
  **When**: Next quarter
  **Where**: `controllers/motor-kyc.js` lines 11–14 and 33–61

- **What**: Add a short-lived cache (e.g., Redis, 30–60 second TTL) keyed on `policy_number` for successful KYC status responses.
  **Why**: Frontends polling for KYC completion may issue several requests per second. Each request makes an authenticated HTTP round-trip to Digit, burning API quota and adding latency. KYC status is unlikely to change within a 30-second window once the verification process has started.
  **When**: Nice to have
  **Where**: `services/insurers/digit/digit.kyc.service.js`, before the `DigitExecutorService.execute` call

- **What**: Add a request timeout to the outbound HTTP call in `digit.executor.service.js`.
  **Why**: The shared executor currently has no timeout, so a Digit API slowdown or outage would hold Node.js HTTP connections open indefinitely. This affects all Digit operations, but KYC is especially exposed because it is polled repeatedly.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.executor.service.js` line 61 (the `postJson` call)

- **What**: Add at least one integration test for the KYC status endpoint (e.g., using the mock adapter to verify the happy path and the missing-`policy_number` validation path).
  **Why**: There are currently zero tests covering this flow. Changes to the mapper's normalization logic or the executor's error handling could silently break KYC status checking.
  **When**: Next quarter
  **Where**: New file: `tests/api/routes/insurance/motor-kyc.spec.js`

## Open questions

- The module only supports checking KYC status (polling). There is no endpoint to submit KYC documents or trigger KYC verification initiation. Is KYC initiation handled out-of-band (e.g., directly by the frontend against Digit's own KYC URL), or is it simply not yet implemented here?
- The `normalizeKycStatusResponse` mapper (lines 562–568 of `digit.mapper.js`) has two sets of field lookups — a top-level path and a nested `kycStatus.*` path — suggesting the Digit API returns different shapes in different scenarios. Is one of these paths obsolete, or are both still live?
- The mock service always returns `kyc_status: "DONE"`. Is there a way to configure the mock to return `"PENDING"` or an error state to test the frontend polling loop in development?
