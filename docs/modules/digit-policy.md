# Digit Policy

## What this module does

This module handles the two final steps of the motor insurance journey with Digit Insurance: checking whether a policy has been successfully issued after payment and KYC, and retrieving the downloadable PDF document (the policy schedule) for that policy. It talks to Digit's OneAPI platform and saves the results to the database so they can be surfaced to the customer.

## Why this module exists

After a customer completes payment and KYC, the insurer (Digit) processes the policy asynchronously. The application must poll or query Digit's API to confirm issuance before showing a "policy active" status. The PDF retrieval step is separate because Digit generates the schedule document independently. Having a dedicated service for these two operations keeps the policy-status concern isolated from earlier flow steps (proposal, KYC, payment), which have their own services.

## When this module runs / is used

- **Policy status check**: Triggered when a client posts to `POST /api/customer/motor/policy/status`. This is typically called after a successful payment to confirm policy issuance.
- **PDF generation**: Triggered when a client posts to `POST /api/customer/motor/policy/pdf`. This is called once the policy is confirmed active to retrieve the schedule document URL/code.

Both endpoints require the `userdata` header (Base64-encoded JSON) set by the auth middleware, just like all other motor flow endpoints.

## How it fits in

**Depends on:**
- `digit-transport` — `DigitConfig` (UAT/PROD URL and integration IDs) and `DigitExecutorService` (auth, HTTP call, API logging)
- `digit-mapper` — `buildPolicyStatusPayload`, `buildPdfPayload`, `normalizePolicyStatusResponse`, `normalizePdfResponse` (lines 523–589)
- `insurer-factory` — selects `DigitPolicyService` or `MockPolicyService` based on `insurer_code`
- `motor-policy-document` model — persists each status check and PDF record to `motor_policy_documents` table
- `common-service` — `errorHandler` for Winston-structured error logging

**Depended on by:**
- `motor-policy` controller/routes — the only callers of `DigitPolicyService`
- `insurer-factory` — registers this service as the handler for `DIGIT` and `DIGIT_ONE` insurer codes

## Key files

| File | Purpose |
|---|---|
| `services/insurers/digit/digit.policy.service.js` | Core service: `checkPolicyStatus` and `generatePdf` methods that call `DigitExecutorService` and apply mapper normalization |
| `controllers/motor-policy.js` | Express controller: resolves the right policy service via `InsurerFactory`, calls the service, persists the result, and returns the JSON response |
| `routes/motor-policy.js` | Router: maps `POST /status` → `status` handler and `POST /pdf` → `generatePdf` handler |
| `services/insurers/digit/digit.mapper.js` (lines 523–589) | Builds the Digit-specific request payloads and normalizes raw Digit responses to the application's field names |
| `models/mysqldb/motor-policy-document.js` | Thin model wrapper over the shared-library `MysqlMotorPolicyDocumentsModel`; stores policy status and PDF document records |
| `services/insurers/mock/mock.policy.service.js` | Mock implementation used in development and when `insurer_code` is `MOCK` or `MOCK_DIGIT`; mirrors the same interface |

## Optimization opportunities

- **What**: Replace unconditional `MysqlMotorPolicyDocumentsModel.add()` calls in the controller with an upsert keyed on `(proposal_id, document_type)` or similar unique constraint.
  **Why**: Each call to `/status` creates a new row regardless of whether one already exists for that proposal, leading to unbounded row growth when clients poll. An upsert (MySQL `ON DUPLICATE KEY UPDATE`) would keep the table to one current record per proposal/document type.
  **When**: Next quarter
  **Where**: `controllers/motor-policy.js` lines 31–43 (status), lines 93–106 (PDF)

- **What**: Remove the `console.log(error)` calls that precede `CommonService.errorHandler`.
  **Why**: The error handler already logs via Winston with structured metadata. The raw `console.log` bypasses the structured log pipeline, may leak stack traces into stdout in production, and duplicates the log entry.
  **When**: Now
  **Where**: `controllers/motor-policy.js` line 52, line 115

- **What**: Consolidate the three accepted field names for the authorization header (`headerAuthorization`, `header_authorization`, `authorization`) into a single canonical field.
  **Why**: Three aliases for the same parameter indicate past API drift and make the contract unclear to callers. Settling on one name (e.g. `header_authorization`) reduces confusion and makes the API surface easier to document.
  **When**: Next quarter
  **Where**: `services/insurers/digit/digit.policy.service.js` line 41; co-ordinate with client teams before removing the aliases

- **What**: Add unit/integration tests covering the happy path and insurer-error path for both `/status` and `/pdf`.
  **Why**: There are currently zero tests for this module. The policy issuance step is the final customer-facing outcome; a regression here directly affects whether customers receive their policy documents.
  **When**: Next quarter
  **Where**: New files under `tests/api/routes/` following the existing spec pattern

- **What**: Clarify the spread-plus-overwrite pattern in `DigitPolicyService` (executor result spread, then `response_payload` overwritten with normalized data while `raw_response_payload` is set to the pre-normalized payload).
  **Why**: The current pattern is subtle — `raw_response_payload` in the returned object is populated from `result.response_payload` (the raw Digit response), but the same object also has a `response_payload` key re-used by the executor for the raw body. A future change to `DigitExecutorService` could silently break the raw/normalized split.
  **When**: Nice to have
  **Where**: `services/insurers/digit/digit.policy.service.js` lines 30–34, 62–66

## Open questions

- The `generatePdf` method accepts `payload.headerAuthorization` — is this the same bearer token returned by Digit during payment/KYC, or a separately issued token? The name suggests it should be forwarded as an HTTP header to Digit, but the executor adds its own `Authorization: Bearer <access_token>` header. How these two authorization values interact is not clear from the code.
- Is there a recommended polling interval or maximum retry count for `/status`? The service itself has no retry or back-off logic; this is left entirely to the caller.
- The `normalizePolicyStatusResponse` maps `responsePayload.applicationId` to `insurer_policy_id`. Clarification on whether Digit's `applicationId` and `policyNumber` are always both present, or whether one supersedes the other at different points in the policy lifecycle, would help avoid null-handling gaps.
