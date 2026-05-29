# Locales

## What this module does

This module holds the i18n (internationalisation) message catalogs that power all API response messages in the application. There are two JSON files — `en.json` (English, 151 keys) and `fr.json` (French, 28 keys) — which map short constant names like `SOMETHING_WENT_WRONG` to the human-readable strings that appear in API responses. The `i18n` npm package (v0.15.1) reads these files at startup and is configured in `app.js`; every response from `utils/response-handler.js` runs its message argument through `i18n.__()` to resolve the final text.

## Why this module exists

Centralising response messages in flat JSON files means the same wording can be kept consistent across every endpoint without scattering hard-coded strings throughout controllers. It also provides a hook for multi-language support: if the client sends a locale preference, `i18n` can resolve the same key to the appropriate language file automatically. The motor insurance app inherited this pattern from its parent fintech platform (a2z Suvidha), where multiple locales and product lines required a shared message dictionary.

## When this module runs / is used

- **At app startup** (`app.js:14–29`): `i18n.configure()` reads both JSON files from disk into memory and registers the `en` and `fr` locales with `en` as the default.
- **On every request** (`app.js:56`): `app.use(i18n.init)` attaches locale helpers to each Express `req`/`res` pair.
- **On every API response** (`utils/response-handler.js:14,23,33,40,48,55`): `i18n.__(message)` is called to translate the message key into its string value before the JSON payload is sent to the caller. All six response methods (`success`, `successList`, `failure`, `validationError`, `error`, `downloadExcel`) go through this path.

## How it fits in

- **Depends on**: Nothing — these are static JSON data files with no code dependencies.
- **Read by**: `i18n` npm package, configured in `app.js`.
- **Consumed indirectly by**: `utils/response-handler.js` (the only place `i18n.__()` is called), which is itself used by `services/sender-registration.js` and `controllers/insurance.js`.
- **Bypassed by**: All motor insurance controllers (`controllers/motor-*.js`) — they build response objects with inline English strings rather than going through `ResponseHandler` or looking up i18n keys.

## Key files

| File | Purpose |
|------|---------|
| `locales/en.json` | English message catalog — 151 keys; the authoritative source used at runtime since `en` is the default locale. |
| `locales/fr.json` | French locale file — 28 keys; values are currently in English (not translated), and the key set does not match `en.json`. |

## Optimization opportunities

### 1. Remove 139 unused message keys from `en.json`
- **What**: Delete the 139 keys in `en.json` that are never referenced anywhere in the JavaScript source (confirmed by grepping all `*.js` files outside `node_modules`).
- **Why**: These keys are inherited from the parent fintech platform (AEPS cash-out, UPI, remittance, beneficiary management, etc.) and have no corresponding code in this motor insurance application. They bloat the catalog and create confusion about which messages are live. Examples of dead keys include `AEPS_ONBOARD_COMPLETED`, `BENEFICIARY_ADDED`, `TRANSACTION_SUCCESS`, `UPI_BANK_DOWN`, and 135 more. Only 12 keys are actually used: `INVALID_OTP`, `NOT_FOUND`, `SENDER_NOT_FOUND`, `SENDER_NOT_VERIFIED`, `SENDER_OTP_RESEND`, `SENDER_PARTIAL_REGISTERD`, `SENDER_REGISTERD_VERIFICAITON_PENDING`, `SENDER_REGISTERED`, `SENDER_SUCCESSFULY_VERIFIED`, `SERVICE_NOT_fOUND`, `SOMETHING_WENT_WRONG`, `USER_NOT_FOUND`.
- **When**: Next quarter
- **Where**: `locales/en.json` (all 151 lines)

### 2. Fix key typos in `en.json`
- **What**: Rename four malformed keys to their correct spellings: `API_COMPLITED` → `API_COMPLETED`, `SENDER_SUCCESSFULY_VERIFIED` → `SENDER_SUCCESSFULLY_VERIFIED`, `SENDER_REGISTERD_VERIFICAITON_PENDING` → `SENDER_REGISTERED_VERIFICATION_PENDING`, `SERVICE_NOT_fOUND` → `SERVICE_NOT_FOUND` (lowercase `f` is a silent bug — if code passes `SERVICE_NOT_fOUND`, i18n returns the key itself as the message rather than the value).
- **Why**: Typos in keys are hard to spot and can cause i18n to silently fall back to returning the raw key name as the response message, which leaks internal identifiers to API callers. `SERVICE_NOT_fOUND` is the most dangerous because a case mismatch on the calling side means the wrong string is returned.
- **When**: Now (it is a silent correctness bug)
- **Where**: `locales/en.json:68` (`SERVICE_NOT_fOUND`) and lines covering `API_COMPLITED`, `SENDER_SUCCESSFULY_VERIFIED`, `SENDER_REGISTERD_VERIFICAITON_PENDING`; also update the matching call sites in `services/sender-registration.js`.

### 3. Align motor controllers to use i18n keys instead of inline strings
- **What**: Replace the inline English strings in `controllers/motor-*.js` (e.g. `"Something went wrong"`, `"Proposal not found"`, `"Quote request not found"`) with i18n key lookups via `ResponseHandler`.
- **Why**: Motor controllers currently bypass i18n entirely, writing messages directly into `res.status().json()`. This means those messages are invisible to the translation layer, cannot be changed from a single place, and vary slightly in wording across files (`"Something went wrong"` vs `"Whoops! something went wrong, Please try again"` in the catalog). Centralising them into `en.json` would restore consistency and make future translations possible.
- **When**: Next quarter
- **Where**: `controllers/motor-kyc.js`, `controllers/motor-payment.js`, `controllers/motor-policy.js`, `controllers/motor-proposal.js`, `controllers/motor-quote-request.js`, `controllers/motor-quotes.js`.

### 4. Either translate `fr.json` or remove the `fr` locale entirely
- **What**: Decide whether French locale support is a real product requirement. If yes, translate the 28 English-valued strings in `fr.json` to French and align its keys with `en.json`. If no, remove `"fr"` from the `locales` array in `app.js:15` and delete `locales/fr.json`.
- **Why**: `fr.json` currently contains English text, not French, so declaring `fr` as a supported locale is misleading. Additionally, `fr.json` has 19 keys (`IRCTC_*`, `HOLD_ACCOUNT_*`, `FUND_REQ_*`) that don't exist in `en.json`, indicating it was copied from a different product. Since `i18n.configure` has `updateFiles: false`, missing keys in `fr.json` silently fall back to `en`, making the locale boundary invisible.
- **When**: Next quarter
- **Where**: `locales/fr.json` (all 30 lines); `app.js:15` if the locale is removed.

### 5. Remove unused request-scoped alias configuration
- **What**: Remove or simplify the `api: { __: "t", __n: "tn" }` block in the `i18n.configure()` call in `app.js:22–25`.
- **Why**: This config maps `req.__` to `req.t` and `req.__n` to `req.tn` on every incoming Express request. No controller or middleware in this codebase calls `req.t()` or `req.tn()` — the only i18n call in production code is the static `i18n.__()` in `response-handler.js`, which does not use the request-scoped variant. The alias setup runs on every request for no benefit.
- **When**: Nice to have
- **Where**: `app.js:22–25`.

## Open questions

- **Motor insurance i18n plan**: Is there an intention to eventually adopt i18n keys in the motor controllers, or was the decision made to keep them as inline strings? This affects whether optimisation #3 is worth pursuing.
- **French locale requirement**: Is `fr.json` a real locale requirement for any user-facing product, or is it a vestige from the parent platform? No client-facing documentation mentions French language support for the motor insurance product.
- **SENDER_* keys in motor context**: Keys like `SENDER_REGISTERED`, `SENDER_NOT_FOUND`, etc. are used by `services/sender-registration.js`. Is sender registration part of the current motor insurance product scope, or is it shared-library / legacy code that will eventually be removed?
