# Motor Policy

## What this module does

The `motor-policy` module is the final step in the motor insurance customer journey. It provides two endpoints: one to check the current status of a policy from the insurer (whether it is active, paid, and KYC-verified), and one to retrieve a downloadable PDF link for the policy schedule document. Each call persists a record of the insurer's response to the `motor_policy_document` table for audit purposes.

## Why this module exists

After a customer completes payment, the system needs to confirm the insurer has issued a live policy and provide a document the customer can save or print. This module is the bridge between the app and the insurer's policy-management APIs, normalising the response into a consistent shape regardless of which insurer was used and keeping an immutable audit trail of what the insurer returned.

## When this module runs / is used

- `POST /api/customer/motor/policy/status` — called by the front-end after payment to poll whether the insurer has activated the policy. The client supplies a `proposal_id`, `payment_id`, and `policy_number` (or `policyNumber`); the module delegates to the insurer adapter and persists the result.
- `POST /api/customer/motor/policy/pdf` — called by the front-end when the customer wants to download their policy schedule. The client supplies `proposal_id`, `policy_id` (or `policyId`/`insurer_policy_id`), and — for the Digit adapter — an `authorization` token. The module fetches the PDF link from the insurer and persists the record with `document_type: "POLICY_SCHEDULE"`.

Both endpoints are protected by the `validateHeaders` + `decodeUserData` middleware chain (authenticated requests only).

## How it fits in

**Depends on:**
- `services/insurers/insurer.factory.js` — resolves the correct insurer adapter (Digit or Mock) from `insurer_code`
- `services/insurers/digit/digit.policy.service.js` — Digit-specific policy status and PDF logic
- `services/insurers/digit/digit.executor.service.js` — wraps the Digit OneAPI call (authentication, logging, error mapping)
- `services/insurers/digit/digit.mapper.js` — builds the Digit request payload and normalises the response
- `services/insurers/mock/mock.policy.service.js` — test/mock adapter
- `models/mysqldb/motor-policy-document.js` — persists policy document records
- `services/common.js` — structured error logging via `errorHandler`

**Depended on by:**
- No other module in the motor flow calls these endpoints programmatically. They are terminal endpoints invoked directly by the customer-facing front-end.

## Key files

| File | Purpose |
|------|---------|
| `routes/motor-policy.js` | Mounts `POST /status` → `MotorPolicyController.status` and `POST /pdf` → `MotorPolicyController.generatePdf` |
| `controllers/motor-policy.js` | The two request handlers: resolves the insurer adapter, calls the service, persists the result, returns a normalised JSON response |
| `models/mysqldb/motor-policy-document.js` | Thin Sequelize wrapper over the `motor_policy_document` table; exposes `add`, `update`, `findById`, `findByQuery` |
| `services/insurers/digit/digit.policy.service.js` | Digit adapter: validates required fields, calls `DigitExecutorService.execute` with the appropriate integration ID, and delegates normalisation to `DigitMapper` |
| `services/insurers/mock/mock.policy.service.js` | Mock adapter: logs to `insurer_api_log` and returns hardcoded `EFFECTIVE`/`PAID`/`DONE` status and a `mock-policy.local` PDF URL |
| `services/insurers/digit/digit.mapper.js` (lines 523–588) | `buildPolicyStatusPayload`, `buildPdfPayload`, `normalizePolicyStatusResponse`, `normalizePdfResponse` — constructs and normalises the Digit OneAPI request/response |

## Optimization opportunities

### 1. Unawaited `CommonService.errorHandler` — silent promise rejection
- **What**: Add `await` before both `CommonService.errorHandler(...)` calls in the catch blocks.
- **Why**: Without `await`, any exception thrown inside `errorHandler` becomes an unhandled-promise rejection. Node.js emits a process warning and the error is never logged — a silent failure in the error-handling path itself.
- **When**: Now
- **Where**: `controllers/motor-policy.js:54` and `controllers/motor-policy.js:117`

### 2. IDOR on both endpoints — no ownership check
- **What**: Before fetching or persisting policy data, verify that the `proposal_id` in the request body belongs to the authenticated caller (from `req.headers['userdata']`).
- **Why**: Both endpoints accept a `proposal_id` from the request body and act on it without checking who owns it. Any authenticated user can poll another customer's policy status or retrieve their policy PDF URL — a textbook Insecure Direct Object Reference. Policy numbers, insurer application IDs, and payment status are personally sensitive data.
- **When**: Now
- **Where**: `controllers/motor-policy.js:14–73` (`status`) and `controllers/motor-policy.js:76–137` (`generatePdf`)

### 3. `console.log(error)` bypasses Winston in both catch blocks
- **What**: Remove `console.log(error)` at lines 52 and 115 and rely solely on `CommonService.errorHandler` (once it is awaited per finding #1).
- **Why**: Raw stack traces go to unrotated stdout instead of the structured Winston log pipeline, duplicating output and bypassing log-level controls. The same pattern has been flagged across `motor-kyc`, `motor-payment`, and `motor-quotes`.
- **When**: Next quarter
- **Where**: `controllers/motor-policy.js:52` and `controllers/motor-policy.js:115`

### 4. Silent MOCK fallback on missing `insurer_code`
- **What**: Log a structured `WARN` via Winston when `insurer_code` is absent and the default MOCK adapter is used, and consider returning a `400` validation error in production environments.
- **Why**: `payload.insurer_code || "MOCK_DIGIT"` silently routes production traffic to the mock adapter, returning a fake policy status of `EFFECTIVE` and a `mock-policy.local` PDF URL. There is no log warning and no alert — the bug is invisible until the customer reports a problem.
- **When**: Now
- **Where**: `controllers/motor-policy.js:18` and `controllers/motor-policy.js:80`

### 5. Client must supply insurer authorization token for PDF generation
- **What**: Fetch the Digit authorization token server-side (via `DigitAuthService.getAccessToken`) inside `digit.policy.service.js:generatePdf` rather than reading it from the client payload.
- **Why**: The Digit PDF endpoint requires a Bearer token (`headerAuthorization`/`authorization`) to be supplied in the request body. This means the client must hold and transmit an insurer-internal credential, expanding the attack surface. If the token is intercepted or mis-delivered, it can be replayed to access policy documents directly from Digit's API. The executor service already uses `DigitAuthService` to obtain a Bearer token for all other Digit calls; the same mechanism should be used here.
- **When**: Now
- **Where**: `services/insurers/digit/digit.policy.service.js:41–44`

### 6. `environment` accepted from client payload — client can force PROD API calls
- **What**: Remove `payload?.environment` as the source of the environment parameter in the Digit services; derive `environment` server-side from `process.env.NODE_ENV` or a server-controlled config.
- **Why**: `digit.policy.service.js` reads `payload?.environment || "UAT"` to select between UAT and PROD Digit configs. Because `payload` is the raw request body, any caller can pass `environment: "PROD"` to force a live production API call regardless of the deployment environment. The same vulnerability exists in `digit.kyc.service.js` and `digit.payment.service.js`.
- **When**: Now
- **Where**: `services/insurers/digit/digit.policy.service.js:7` and `:38`

### 7. Duplicate `motor_policy_document` rows accumulate on repeated polling
- **What**: Replace `MysqlMotorPolicyDocumentsModel.add()` with an upsert (or first check for an existing row and update it) keyed on `(proposal_id, document_type)`.
- **Why**: Both `status` and `generatePdf` call `.add()` unconditionally on every request. If the front-end polls `POST /status` every few seconds until the policy is active, each poll creates a new `motor_policy_document` row for the same proposal, polluting the audit table with hundreds of duplicate status snapshots with no way to identify which is current.
- **When**: Nice to have
- **Where**: `controllers/motor-policy.js:31–43` (`status`) and `controllers/motor-policy.js:93–106` (`generatePdf`)

### 8. `insurer_id` silently defaults to `1`
- **What**: Validate that `payload.insurer_id` is present and is a valid insurer FK before writing it to the database.
- **Why**: `payload.insurer_id || 1` silently writes FK `1` when the field is absent, linking the `motor_policy_document` row to the wrong insurer in audit queries. The same pattern has been flagged in `motor-quotes` and `motor-payment`.
- **When**: Next quarter
- **Where**: `controllers/motor-policy.js:19` and `controllers/motor-policy.js:81`

## Open questions

1. **What does the front-end pass as `authorization` for the Digit PDF endpoint?** The service expects `headerAuthorization`/`header_authorization`/`authorization` in the request body, but there is no code in any motor-flow controller that fetches or stores a Digit Bearer token for the client to use. It is unclear how the client obtains this token and whether it is the same token issued during payment or KYC.
2. **Is there a policy-number storage model?** The `motor_policy_document` table stores `policy_number`, but there is no dedicated `motor_policy` or `policy` model. It is unclear whether `policy_number` written here is queried anywhere else in the application (e.g. for renewal, claims, or reporting).
3. **Is polling expected, or should there be a webhook/push model?** Both endpoints are synchronous request-response. If the insurer takes minutes to activate a policy, the front-end must poll repeatedly. There is no webhook or event-driven alternative; it is worth asking whether Digit supports callback notifications for policy activation.
