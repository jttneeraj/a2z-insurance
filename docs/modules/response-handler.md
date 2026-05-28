# Response Handler

## What this module does

`ResponseHandler` is a small utility class that wraps an Express response object and provides named methods — `success`, `successList`, `failure`, `validationError`, `error`, and `downloadExcel` — for sending JSON responses back to API consumers. Every method enforces a shared envelope shape (`error`, `status`, `message`, `result`) and runs the message string through the i18n translation layer before sending it.

## Why this module exists

Without a central response helper, every controller would compose its own JSON objects, choose its own HTTP status codes, and format messages in its own way. This module keeps the API surface consistent: all responses from controllers that use it follow the same field names and the same i18n flow. It lives in `utils/` rather than inside a controller or service because it is a pure transport concern shared across multiple controllers.

## When this module runs / is used

Called at the tail end of a controller handler, just before the response is sent to the client. A controller imports `ResponseHandler`, creates an instance with the Express `res` object, and calls one of its methods:

- `success` — data was found or an action succeeded
- `successList` — a paginated list of records was returned
- `failure` — a business-logic condition failed (e.g. duplicate record, validation mismatch)
- `validationError` — the request payload failed input validation
- `error` — an unexpected server-side error occurred
- `downloadExcel` — an Excel file blob is being returned

It is also invoked directly inside `services/sender-registration.js`, which passes `res` into the service rather than keeping HTTP formatting in the controller.

## How it fits in

**Depends on:**
- `constants/common.js` — for the `HTTP_STATUS` map (200, 400, 500, etc.)
- `i18n` (npm package) — translates message keys via `i18n.__()` using catalogs in `locales/`

**Used by:**
- `controllers/import-master.js` — master-data import responses
- `controllers/insurance-products.js` — insurance product CRUD responses
- `controllers/insurance-types.js` — insurance type CRUD responses
- `controllers/insurance.js` — legacy/misc insurance endpoint responses
- `controllers/insurer-products.js` — insurer–product mapping responses
- `controllers/insurers.js` — insurer company CRUD responses
- `services/sender-registration.js` — sender registration flow responses (see Optimization opportunities)

**Not used by:** the motor-flow controllers (`motor-quote-request.js`, `motor-quotes.js`, `motor-proposal.js`, `motor-kyc.js`, `motor-payment.js`, `motor-policy.js`), which use direct `res.status().json()` calls or `CommonService.errorHandler` instead.

## Key files

| File | Purpose |
|------|---------|
| `utils/response-handler.js` | The only file in this module. Defines the `ResponseHandler` class and exports it. |
| `constants/common.js` | Provides `HTTP_STATUS` constants consumed by the response methods. |
| `locales/en.json` | i18n message catalog whose keys are passed as the `message` argument to each response method. |

## Optimization opportunities

### 1. Bug: `error()` method sends `error: 0` instead of `error: 1`

- **What**: Change `error: 0` to `error: 1` on line 47 of `utils/response-handler.js`.
- **Why**: The `error` field is the consumer's primary machine-readable signal: `0` means "no error" and `1` means "error". Returning `error: 0` on a 500 response causes any client checking this field to silently treat a server failure as success. The `failure()` method correctly returns `error: 1`; `error()` appears to be a copy-paste oversight.
- **When**: Now — this is a correctness bug in an observable API contract.
- **Where**: `utils/response-handler.js:47`

### 2. Inconsistency: `error()` response is missing the `status` field

- **What**: Add `status: 0` to the JSON body returned by `error()`.
- **Why**: Every other method (`success`, `successList`, `failure`, `downloadExcel`) includes a `status` field. Its absence in `error()` forces consumers to handle one response shape differently from all others, breaking uniform destructuring.
- **When**: Next quarter — low risk, purely additive change.
- **Where**: `utils/response-handler.js:45–50`

### 3. Default message strings are not real i18n keys

- **What**: Add `"SUCCESS"` and `"FAILED"` entries to `locales/en.json` (and `fr.json`), or replace the defaults in `success()` and `failure()` with existing catalog keys (e.g. `"API_COMPLITED"` or a new `"OPERATION_SUCCESS"` key).
- **Why**: `i18n.__()` falls back to returning the raw key when no translation is found — so `"SUCCESS"` and `"FAILED"` pass through untranslated today. This silently bypasses the i18n layer and will produce untranslated responses if the locale is ever switched to French.
- **When**: Next quarter — low risk but worth closing the gap while the locale catalog is small.
- **Where**: `utils/response-handler.js:19`, `utils/response-handler.js:29`, `locales/en.json`, `locales/fr.json`

### 4. `ResponseHandler` used inside a service layer

- **What**: Refactor `services/sender-registration.js` to return plain result objects and move all `ResponseHandler` calls into the calling controller.
- **Why**: Services are business-logic units and should not know about HTTP. Passing `res` into a service creates a tight coupling to the HTTP transport, makes the service untestable without a mock response object, and violates the routes → controllers → services layering described in `CLAUDE.md`.
- **When**: Next quarter — medium effort, improves testability.
- **Where**: `services/sender-registration.js` (all `new ResponseHandler(res)` calls)

### 5. Split response pattern: motor-flow controllers do not use `ResponseHandler`

- **What**: Either migrate the motor-flow controllers to `ResponseHandler`, or formally document `CommonService.errorHandler` + direct `res.status().json()` as the canonical pattern for that layer and retire `ResponseHandler` for new code.
- **Why**: Two competing conventions exist side by side. New contributors reading the admin controllers will adopt `ResponseHandler`; those reading the motor-flow controllers will use the other pattern. Picking one reduces cognitive load and surface area.
- **When**: Nice to have — the motor-flow controllers also use semantic HTTP status codes (400, 404, 502) which is architecturally preferable to the always-200 `failure()` approach, so that context is worth weighing before migrating.
- **Where**: `controllers/motor-*.js`, `utils/response-handler.js`

### 6. `failure()` always returns HTTP 200 for business-logic errors

- **What**: Use semantically appropriate HTTP status codes (404, 409, 422) in `failure()`, or introduce variant methods like `notFound()` and `conflict()`.
- **Why**: Returning HTTP 200 for all failures — including "record not found" or "duplicate key" — prevents API gateways, monitoring tools, and load balancers from detecting application errors via status codes. The motor-flow controllers already use proper 4xx codes, which highlights this inconsistency.
- **When**: Nice to have — this is a breaking change for any consumer that relies on the HTTP 200 today.
- **Where**: `utils/response-handler.js:29–36`

## Open questions

- Is the `error: 0` in `error()` intentional (i.e. some client explicitly checks for this) or a copy-paste bug? Reverting it is the safe assumption, but confirming with the original author before the fix ships is worthwhile.
- The `fr.json` locale is only 29 lines compared to 155 lines in `en.json` — it appears incomplete. Is French an active locale or a placeholder? If it is active, many message keys will fall back to raw key strings for French-locale users.
- `downloadExcel()` returns the raw file data embedded in a JSON response (`xlsFile` field) rather than streaming a binary response. Was this a deliberate decision, or is the intent to eventually stream the file directly?
