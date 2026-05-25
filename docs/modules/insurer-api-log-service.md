# Insurer API Log Service

## What this module does

This module records every outbound HTTP call made to an external insurer's API. Before each call is sent, a log record is written to the database with a `PENDING` status and the full request details. After the response arrives, the record is updated to either `SUCCESS` or `FAILED`, along with the response body, HTTP status code, and any error message. This creates a complete, timestamped audit trail of every insurer interaction.

## Why this module exists

Calls to external insurer APIs (for quotes, proposals, KYC, payments, auth tokens, and policy retrieval) are expensive, non-retryable, and frequently the source of customer-facing bugs. Having a log record for every call lets the support team diagnose failures by looking up a specific quote or proposal ID, and gives the compliance and finance teams a full record of what was sent and received. The module lives as its own service so any insurer adapter — real or mock — can use a single, consistent logging contract.

## When this module runs / is used

This service is called inside every insurer adapter's try/catch block around an outbound API call:

1. `createLog(data)` — called immediately before the HTTP request is sent; creates a `PENDING` row in `insurer_api_log`.
2. `markSuccess(logId, data)` — called after a successful response; updates the row to `SUCCESS` with response details.
3. `markFailed(logId, data)` — called in the catch block; updates the row to `FAILED` with the error and any error response body.

The flow is the same regardless of insurer or operation type: log first, call, then update. If `createLog` itself fails, the log record is `null` and the caller skips the update steps silently (`markSuccess` and `markFailed` both no-op when `logId` is falsy).

## How it fits in

**Depends on:**
- `MysqlInsurerApiLogModel` from the shared library — the Sequelize model for the `insurer_api_log` database table.

**Depended on by:**
- `services/insurers/digit/digit.executor.service.js` — calls all three methods for every Digit API call routed through the executor (quote, proposal, KYC, payment, policy).
- `services/insurers/digit/digit.auth.service.js` — calls all three methods specifically for Digit token generation calls.
- `services/insurers/digit/digit.quote.service.js` — calls all three methods directly for the Digit quote API.
- `services/insurers/digit/digit.proposal.service.js` — calls all three methods directly for the Digit proposal API.
- `services/insurers/mock/mock.quote.service.js` — uses the same pattern for mock quote calls.
- `services/insurers/mock/mock.proposal.service.js` — uses the same pattern for mock proposal calls.
- `services/insurers/mock/mock.kyc.service.js` — uses the same pattern for mock KYC calls.
- `services/insurers/mock/mock.payment.service.js` — uses the same pattern for mock payment calls.
- `services/insurers/mock/mock.policy.service.js` — uses the same pattern for mock policy calls.

## Key files

| File | Purpose |
|---|---|
| `services/insurers/common/insurer-api-log.service.js` | The log service itself: `createLog`, `markSuccess`, `markFailed`. Exported as a singleton instance. |
| `services/insurers/common/insurer-http-client.js` | The HTTP client used alongside this service. Callers invoke `postJson` and then call `markSuccess`/`markFailed` based on the result. Not part of the log service, but always used together with it. |

## Optimization opportunities

- **What**: Replace `data.http_status_code || 200` with `data.http_status_code ?? 200` in `markSuccess`, and `data.http_status_code || 500` with `data.http_status_code ?? 500` in `markFailed`.
  **Why**: Using `||` means a genuine HTTP status code of `0` (e.g. connection refused, network timeout) gets stored as the default (`200` or `500`) rather than as `0`. This masks network-level failures in the log. `??` only falls back when the value is `null` or `undefined`.
  **When**: Now
  **Where**: `services/insurers/common/insurer-api-log.service.js` lines 47 and 66

- **What**: Remove the `api_endpoint` and `integration_id` fields from the `markSuccess` update payload (lines 44–45), or keep them only when the caller explicitly provides them.
  **Why**: These two fields are already written during `createLog`. If a caller omits them from the `markSuccess` call (which all current callers do), the update writes `null` over the values that were already stored, silently erasing them.
  **When**: Now
  **Where**: `services/insurers/common/insurer-api-log.service.js` lines 44–45

- **What**: Remove the three debug `console.log` statements at lines 5–7 of `insurer-http-client.js`.
  **Why**: These log the full request URL, headers, and payload — including any `Authorization: Bearer <token>` header — to stdout on every insurer API call. In production this means access tokens and policy data appear in raw console output, which is a security concern and generates substantial log noise.
  **When**: Now
  **Where**: `services/insurers/common/insurer-http-client.js` lines 5–7

- **What**: Replace the direct model instantiation `new MysqlInsurerApiLogModel().model` (line 5) with the standard pattern used elsewhere: a class extending `MysqlInsurerApiLogModel` exported as a singleton from `models/mysqldb/`.
  **Why**: Every other model in the codebase follows the `class Foo extends MysqlFooModel` pattern with an exported singleton. This file bypasses that convention by instantiating the shared-library class directly, which makes it inconsistent and harder to add local overrides or methods later.
  **When**: Nice to have
  **Where**: `services/insurers/common/insurer-api-log.service.js` lines 1–5

- **What**: Add a `null`-safe `??` in `markFailed` for `response_payload` and `error_message` (`data.response_payload ?? null` instead of `data.response_payload || null`).
  **Why**: `||` coerces falsy values (empty string `""`, `false`, `0`) to `null`, potentially discarding a legitimate empty response body or error message. `??` only falls back for `null`/`undefined`.
  **When**: Nice to have
  **Where**: `services/insurers/common/insurer-api-log.service.js` lines 64–65

- **What**: Ensure that Digit KYC, payment, and policy services log with the correct `api_name` values visible in the audit trail. Currently `digit.kyc.service.js`, `digit.payment.service.js`, and `digit.policy.service.js` route through `digit.executor.service.js` (which handles logging), but the `api_name` passed through the executor is the only identifier of which flow triggered the call.
  **Why**: If the `api_name` string is wrong or missing in the executor call, the log record is attributed to the wrong operation. A cursory check of the executor callers should verify the `apiName` argument is always passed explicitly.
  **When**: Nice to have
  **Where**: `services/insurers/digit/digit.kyc.service.js`, `digit.payment.service.js`, `digit.policy.service.js` — `apiName` arguments in `DigitExecutorService.execute()` calls

## Open questions

- Should `markFailed` also log the error to Winston (via `CommonService.errorHandler`) in addition to writing to the DB? Currently a failed insurer call is persisted in the log table but no structured log message is emitted, so it won't appear in log aggregators unless the calling service also logs the error.
- The `transaction` parameter exists on all three methods but no current caller passes one. Was this intended for a future pattern where log creation is tied to the parent DB transaction (so a rolled-back quote would also roll back the log row), or can the parameter be removed to reduce the surface area?
- What retention policy applies to `insurer_api_log` rows? For a production system processing many quotes daily, this table could grow large quickly. Is there a scheduled cleanup job or archival process planned?
