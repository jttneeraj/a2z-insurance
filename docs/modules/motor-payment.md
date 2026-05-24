# Motor Payment

## What this module does

The motor-payment module is the payment-initiation step in the motor insurance customer journey. When a customer is ready to pay for their selected policy, the module creates a payment record, calls the appropriate insurer adapter to generate a payment link, and returns that link to the front-end so the customer can complete the transaction. It also exposes a read endpoint so the application can retrieve a payment record's current status.

## Why this module exists

Motor insurance policies cannot be issued until payment is confirmed. This module exists as a distinct step between KYC and policy issuance: it owns the `proposal_payment` table, orchestrates the insurer-specific payment-link API call, and records the response (payment link, insurer payment ID, amount) back to the database. Separating payment into its own module keeps the proposal and policy modules free of payment-gateway concerns.

## When this module runs / is used

- **`POST /api/customer/motor/payment/initiate`** — Called by the customer front-end after KYC is accepted. The client sends a `proposal_id` and optional `insurer_code`; the module creates a payment record and returns a hosted payment link.
- **`GET /api/customer/motor/payment/status/:id`** — Called by the front-end (or a polling loop) to retrieve payment status and metadata after the customer has been redirected from the payment gateway.

Both routes are mounted in `app.js` at line 166 and go through the `validateHeaders` + `decodeUserData` middleware chain.

## How it fits in

| Direction | Module | Reason |
|---|---|---|
| Depends on | `motor-proposal` | Reads `quote_proposal` rows to obtain `final_premium`, `lead_id`, `insurer_id`, and `insurer_application_id` |
| Depends on | `insurer-factory` | `getMotorPaymentService(code)` resolves the right payment adapter |
| Depends on | `digit-payment` | Digit-specific payment-link API orchestration |
| Depends on | `mock-adapter` | Mock payment adapter used during development and testing |
| Depends on | `proposal-payment-model` | Reads and writes `proposal_payment` rows |
| Depends on | `common-service` | `errorHandler` for structured error logging |
| Depended on by | `motor-policy` | `motor-policy` reads `payment_id` from the proposal to confirm payment before issuing a policy |

## Key files

| File | Purpose |
|---|---|
| `routes/motor-payment.js` | Registers two Express routes: `POST /initiate` and `GET /status/:id` |
| `controllers/motor-payment.js` | Implements `initiate` (payment creation + insurer call) and `detail` (payment lookup) |
| `models/mysqldb/proposal-payment.js` | Thin ORM wrapper over the `proposal_payment` table; provides `add`, `update`, `findById`, `findByQuery` |
| `services/insurers/digit/digit.payment.service.js` | Calls the Digit payment-link API via `DigitExecutorService` and normalises the response |
| `services/insurers/mock/mock.payment.service.js` | Returns a synthetic payment link and logs it through `InsurerApiLogService` for local testing |
| `controllers/motor-payment copy.js` | Legacy snapshot kept as a reference (do not import); differs from the active controller only in the absence of `proposal.insurer_application_id` as an `insurer_application_id` fallback |

## Optimization opportunities

### 1. IDOR on the `detail` endpoint
- **What**: Add an ownership check so that `GET /status/:id` only returns a payment record that belongs to the authenticated caller's lead or proposal.
- **Why**: Any user who holds a valid `userdata` header can fetch any other customer's payment record by guessing or enumerating payment IDs. The response includes `amount`, `payment_link`, `insurer_application_id`, and `lead_id` — all personally sensitive data.
- **When**: Now
- **Where**: `controllers/motor-payment.js:120–129`

### 2. No duplicate-payment guard in `initiate`
- **What**: Check for an existing non-FAILED payment row for the same `proposal_id` before creating a new one, and either return the existing record or reject the request.
- **Why**: A caller who invokes `POST /initiate` twice for the same proposal gets two `proposal_payment` rows and two insurer API calls. If the insurer charges on link-generation rather than link-completion, the customer could be double-billed. Even without double-billing, orphaned PENDING rows accumulate and confuse status lookups.
- **When**: Now
- **Where**: `controllers/motor-payment.js:24–54` (before transaction open)

### 3. Payment row committed before insurer call — orphaned PENDING rows on failure
- **What**: Move the initial `proposal_payment` insert inside the same logical unit as the insurer call, or mark the row as `INITIATING` and roll it back on insurer failure rather than leaving it as `PENDING`.
- **Why**: The current flow commits the payment row at line 50, then calls the insurer at line 56. If the insurer call throws, the committed PENDING row cannot be cleaned up — and the missing duplicate-payment guard (#2 above) means the next retry will create yet another orphaned row.
- **When**: Now
- **Where**: `controllers/motor-payment.js:24–54`

### 4. `CommonService.errorHandler` called without `await`
- **What**: Add `await` before `CommonService.errorHandler(...)`.
- **Why**: `CommonService.errorHandler` is an async function. Without `await`, any exception thrown inside it becomes a silent unhandled-promise rejection — neither caught by the outer `try/catch` nor surfaced to the caller. The same pattern was flagged in `motor-kyc`.
- **When**: Now
- **Where**: `controllers/motor-payment.js:96`

### 5. `console.log(error)` bypasses Winston structured logging
- **What**: Remove the two `console.log(error)` calls and rely on `CommonService.errorHandler` (with the `await` fix above) for all error logging.
- **Why**: `console.log` writes unrotated, unstructured output to stdout, bypassing Winston's daily-rotation, log-level controls, and HTTP transport. The `detail` handler's catch block (line 132) does not even call `errorHandler`, so its errors are invisible to Winston entirely.
- **When**: Now
- **Where**: `controllers/motor-payment.js:94`, `controllers/motor-payment.js:132`

### 6. Silent MOCK fallback when `insurer_code` is missing
- **What**: Require `insurer_code` explicitly or at minimum warn loudly (via structured log) when it is absent and the code silently defaults to `"MOCK_DIGIT"`.
- **Why**: If a production caller omits `insurer_code`, the module silently uses the mock adapter and returns a fake `https://mock-payment.local/…` link. The customer's browser is redirected to a non-existent URL and payment cannot be completed, with no warning in structured logs.
- **When**: Now
- **Where**: `controllers/motor-payment.js:21`

### 7. No Swagger / OpenAPI annotations on either endpoint
- **What**: Add `@openapi` JSDoc blocks to `initiate` and `detail` in `controllers/motor-payment.js`.
- **Why**: Both endpoints are invisible in the Swagger UI (`/api-docs`), making manual QA, client integration, and API documentation harder.
- **When**: Nice to have
- **Where**: `controllers/motor-payment.js:8`, `controllers/motor-payment.js:118`

## Open questions

1. **Payment status callbacks**: There is no webhook or callback endpoint for the payment gateway to notify the application that a customer completed or abandoned payment. It is unclear whether `payment_status` is updated by polling, by a separate callback service, or by the customer's next action (e.g. landing on the success page). Needs maintainer clarification.
2. **`paymentMode` "EB" default**: The default value `"EB"` (likely "Electronic/Bank") is hardcoded without documentation. Confirm whether Digit's payment API requires a specific mode code and whether other modes (UPI, credit card) should be supported.
3. **One payment per proposal**: The intent is not confirmed in code — should a proposal ever have more than one payment record (e.g. after a failure and a retry)? Clarify the intended lifecycle so a duplicate guard can be designed correctly.
