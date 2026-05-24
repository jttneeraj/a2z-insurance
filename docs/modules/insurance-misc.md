# Insurance Misc

## What this module does

This module consists of a single controller, `controllers/insurance.js`, that implements one endpoint — `authLogin` — intended to authenticate a user against an external AEPS (Aadhaar-enabled Payment System) vendor and return a redirect URL into that vendor's CMS (Cash Management System) portal. It checks the user's AEPS KYC and onboarding status, verifies the "CMS" service is active, looks up the user's merchant login ID, and then calls the external `insuranceAuthLogin` third-party service to obtain a session URL.

## Why this module exists

The endpoint appears to have been grafted onto this motor-insurance application from a sibling fintech application that handles AEPS/CMS payment flows. It carries no motor-insurance business logic; the terminology (AEPS KYC, merchant login ID, CMS service status) and the database tables it targets (`api_aeps_agent_registration`, `transaction_type`, `user`) are all from the broader fintech platform, not from the motor-insurance domain. It was likely transplanted here as part of a cross-service feature experiment or an accidental copy and was never completed.

## When this module runs / is used

**It never runs.** `app.js` mounts only `routes/insurance-products.js` and `routes/insurance-types.js` for paths containing "insurance" — `controllers/insurance.js` is never imported by any route or by `app.js`. `routes/insurance copy.js` (a legacy snapshot noted in `CLAUDE.md`) routes to the insurers/insurance-types/insurance-products/insurer-products controllers, not to this one. There is no active HTTP path that reaches `authLogin` or `redirection`.

## How it fits in

**Depends on:**
- `models/mysqldb/api-aeps-agent-registration` — not present in this repo's `models/` folder; would need to come from the shared library or a sibling service
- `models/mysqldb/user` — also not in this repo's `models/` folder
- `models/mysqldb/transaction-type` — also not in this repo's `models/` folder
- `services/third-party.js` — thin proxy that delegates to `shared-library/services/third-party`
- `utils/response-handler.js` — standard response envelope
- `locales/en.json` — i18n key `SERVICE_NOT_fOUND` (note: typo in key name)

**Depended on by:** Nothing — no file in this repo imports or calls `controllers/insurance.js`.

## Key files

| File | Purpose |
|------|---------|
| `controllers/insurance.js` | The entire module: exports `authLogin` (entry point) and defines the private `redirection` helper that performs the AEPS vendor call |
| `routes/insurance copy.js` | Legacy snapshot (reference-only per `CLAUDE.md`); does **not** import `controllers/insurance.js` despite what `CLAUDE.md` implies — it routes to insurance-types, insurers, insurance-products, and insurer-products controllers instead |

## Optimization opportunities

- **What**: Remove `controllers/insurance.js` entirely (or move it to a branch until the AEPS/CMS feature is properly scoped for this service).
  **Why**: The file is unreachable, imports three models that do not exist in this repo, and contains two crash-level bugs (see below) — it adds confusion and dead-weight startup risk if it is ever mistakenly wired up.
  **When**: Now
  **Where**: `controllers/insurance.js` (entire file)

- **What**: Fix the `ReferenceError` crash in the success path at line 238.
  **Why**: `error` and `status` are used as values in `new ResponseHandler(res).success({ error: error, status: status, ... })` but neither variable is defined anywhere in `redirection()`'s scope. The function would throw `ReferenceError: error is not defined` on every successful vendor response, meaning the endpoint can never return a 200.
  **When**: Now (before the endpoint is wired up)
  **Where**: `controllers/insurance.js:238`

- **What**: Fix the double-parse bug on the `userdata` header at line 79.
  **Why**: `decodeUserData` (in `middlewares/headers.js`) already Base64-decodes and JSON-parses `userdata`, replacing the header value with a plain JavaScript object. Calling `JSON.parse(userdata)` again on line 79 will throw `SyntaxError: Unexpected token o in JSON at position 0` because `JSON.parse` cannot accept an object as input.
  **When**: Now (before the endpoint is wired up)
  **Where**: `controllers/insurance.js:79`

- **What**: Replace the hardcoded `user_id: 1` in the merchant lookup query with the authenticated user's actual ID.
  **Why**: The query `{ user_id: 1, agent_id: userDetails.id }` always looks up merchant records owned by user ID 1, regardless of who is calling. Every other user will either get user-1's merchant record or get a "not found" error.
  **When**: Now (before the endpoint is wired up)
  **Where**: `controllers/insurance.js:183-187`

- **What**: Remove the six `console.log` debug statements scattered through `authLogin` and `redirection`.
  **Why**: They dump `userDetails` (contains AEPS KYC status), `vendorApiResp` (contains session tokens/URLs), and `transactionType` (service status) to stdout on every call, bypassing Winston and log-level controls. Any production log aggregator would ingest this data in plaintext.
  **When**: Now (before the endpoint is wired up)
  **Where**: `controllers/insurance.js:76, 94, 115, 141, 145, 154, 163, 211`

- **What**: Add the three missing model files (`models/mysqldb/api-aeps-agent-registration.js`, `models/mysqldb/user.js`, `models/mysqldb/transaction-type.js`) or confirm they should be imported from the shared library.
  **Why**: The controller `require()`s all three at module load time. If `app.js` ever imports this controller (e.g. when wiring up a route), Node will throw `MODULE_NOT_FOUND` at startup, taking the entire application down.
  **When**: Next quarter (if the feature is intended to ship)
  **Where**: `controllers/insurance.js:3-12`

## Open questions

1. **Is this endpoint intended for this service?** The entire file concerns AEPS/CMS payment authentication — terminology, tables, and env vars (`INSURANCE_SUPER_MERCHANT_ID`, `INSURANCE_SUPER_MERCHANT_USERNAME`, etc.) that have no connection to motor insurance. Was this added by mistake, or is there a plan to run AEPS flows through the a2z-insurance service?

2. **Which sibling service owns the three missing models?** `api-aeps-agent-registration`, `user`, and `transaction-type` are not in `models/mysqldb/`. Are they expected to come from `shared-library`, or do they belong to a separate AEPS microservice?

3. **What is the intended URL path for this endpoint?** The OpenAPI JSDoc documents it as `POST /aeps-api/insurance/auth-login`, but no matching `app.use('/aeps-api/...')` mount exists in `app.js`. The path prefix and mount point need to be agreed before a route is registered.

4. **Why does `CLAUDE.md` say "only the copy.js route references it"?** `routes/insurance copy.js` actually routes to four other controllers (insurance-types, insurers, insurance-products, insurer-products) and does not import `controllers/insurance.js` at all. The CLAUDE.md note may be outdated or refer to an even older version of the copy.js file.
