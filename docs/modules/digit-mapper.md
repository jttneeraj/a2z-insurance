# Digit Mapper

## What this module does

The Digit Mapper is the translation layer between this application's internal data model and the Digit Insurance API's JSON format. It reads quote-request records from the database (vehicle, owner, and policy detail tables), assembles them into the exact request shape that Digit expects, and converts Digit's API responses back into the normalized fields this system stores and displays. Every field sent to or received from Digit passes through this file.

## Why this module exists

Digit's API has its own naming conventions, enum values, and nested object structure that differ completely from this application's flat database schema. Centralizing all that translation here means the five Digit service files (quote, proposal, KYC, payment, policy) stay focused on orchestration — they never contain field-mapping logic. It also means a field rename on either side only requires one change in one file.

## When this module runs / is used

The mapper is invoked synchronously inside every Digit API call:

- **Quote** — `digit.quote.service.js` calls `buildQuickQuotePayload()` before sending a premium quote request, and `normalizeQuickQuoteResponse()` after receiving the response.
- **Proposal** — `digit.proposal.service.js` calls `buildCreateQuotePayload()` to assemble the full proposal body (persons, KYC, vehicle, coverages, nominee), and `normalizeCreateQuoteResponse()` to extract the application ID and policy number.
- **KYC** — `digit.kyc.service.js` calls `buildKycStatusPayload()` and `normalizeKycStatusResponse()`.
- **Payment** — `digit.payment.service.js` calls `buildPaymentPayload()` and `normalizePaymentResponse()`.
- **Policy** — `digit.policy.service.js` calls `buildPolicyStatusPayload()`, `buildPdfPayload()`, `normalizePolicyStatusResponse()`, and `normalizePdfResponse()`.

## How it fits in

**Depends on:**
- `models/mysqldb/quote-request-vehicle-detail` — reads vehicle data (registration number, engine, chassis, RTO code, manufacturing year, etc.)
- `models/mysqldb/quote-request-owner-detail` — reads owner data (name, address, pincode, mobile, email, DOB)
- `models/mysqldb/quote-request-policy-detail` — reads policy data (previous insurer, NCB, claim history, policy dates)

**Used by:**
- `services/insurers/digit/digit.quote.service.js`
- `services/insurers/digit/digit.proposal.service.js`
- `services/insurers/digit/digit.kyc.service.js`
- `services/insurers/digit/digit.payment.service.js`
- `services/insurers/digit/digit.policy.service.js`

## Key files

| File | Purpose |
|---|---|
| `services/insurers/digit/digit.mapper.js` | The entire module — 592 lines, exports a singleton `DigitMapper` instance |

### Public methods

| Method | Direction | Description |
|---|---|---|
| `buildQuickQuotePayload()` | → Digit | Assembles the quick-quote (premium) request |
| `buildCreateQuotePayload()` | → Digit | Assembles the full proposal request (persons, KYC, vehicle, nominee, coverages) |
| `buildPaymentPayload()` | → Digit | Assembles the payment-initiation request |
| `buildKycStatusPayload()` | → Digit | Assembles the KYC status query |
| `buildPolicyStatusPayload()` | → Digit | Assembles the policy status query |
| `buildPdfPayload()` | → Digit | Assembles the policy PDF download request |
| `normalizeQuickQuoteResponse()` | ← Digit | Flattens the quote response into this system's `quote_result` shape |
| `normalizeCreateQuoteResponse()` | ← Digit | Extracts application ID, policy number, KYC/payment status |
| `normalizePaymentResponse()` | ← Digit | Extracts payment link and status |
| `normalizeKycStatusResponse()` | ← Digit | Extracts KYC verification status and reason |
| `normalizePolicyStatusResponse()` | ← Digit | Extracts policy status and premium amount |
| `normalizePdfResponse()` | ← Digit | Extracts document URL and DMS doc ID |

### Private helpers

| Helper | What it does |
|---|---|
| `toDateOnly(value)` | Truncates any date value to `YYYY-MM-DD` |
| `addOneYearMinusOneDay(startDate)` | Computes a one-year policy end date |
| `getToday()` | Returns today as `YYYY-MM-DD` |
| `getManufactureDate()` | Builds manufacture date from year field, defaults to `2022-01-01` |
| `mapNcbToDigit(value)` | Converts an NCB percentage number to Digit's named enum |
| `splitName(fullName)` | Splits a full name string into `firstName` / `lastName` |
| `parseAmount(value)` | Strips non-numeric characters and returns a number |
| `normalizeBoolean(value, fallback)` | Coerces `1/0/"true"/"false"` to a real boolean |
| `normalizeGender(value)` | Normalizes gender strings to `"MALE"` / `"FEMALE"` |
| `normalizeDigitQuickQuoteResponse()` | Module-level function doing the actual quick-quote normalization |

## Optimization opportunities

### 1. PII leaking through debug `console.log` statements
- **What**: Remove or replace the four `console.log` calls in `buildPolicyHolderPerson()` (lines 269–272) that dump the full `ownerDetail`, `proposal`, and `payload` objects to stdout.
- **Why**: These objects contain personally identifiable information (full name, date of birth, mobile number, address, email). In a production environment, stdout is typically ingested by log aggregation systems, making PII broadly accessible. The emoji-prefixed format (`🚀`) is a development debugging artifact that should never reach production logs.
- **When**: **Now**
- **Where**: `services/insurers/digit/digit.mapper.js` lines 269–272

### 2. Hardcoded `state: "8"` overrides dynamic state resolution
- **What**: Restore dynamic state code mapping instead of the unconditional `state: "8"` literal (Rajasthan).
- **Why**: The line immediately above (line 292) shows the correct dynamic expression was intentionally commented out: `// state: payload.state || payload.state_code || ownerDetail?.state_code || "8"`. With the hardcoded value, every proposal sent to Digit regardless of the vehicle owner's actual state will carry Rajasthan's state code, causing incorrect policy data and potential claim disputes for policyholders outside Rajasthan. This is a data correctness bug, not just a style issue.
- **When**: **Now**
- **Where**: `services/insurers/digit/digit.mapper.js` line 293–294

### 3. `_debugMappedFrom` object is sent in the live API payload
- **What**: Remove the `_debugMappedFrom` key from `buildQuickQuotePayload()` return value, or move it to a separate debug log entry.
- **Why**: This object (lines 155–160) containing owner name, mobile, and email is included in the JSON body posted to Digit's API. Sending extra undocumented keys to an external insurer API is unpredictable — the Digit API may reject the request in a future schema validation change, and it unnecessarily shares internal field-mapping debug info with a third party.
- **When**: **Now**
- **Where**: `services/insurers/digit/digit.mapper.js` lines 155–160

### 4. Dead `winston` import
- **What**: Remove `const { log } = require("winston")` from line 4.
- **Why**: `log` is imported but never called anywhere in the file. Dead imports add noise and may confuse future maintainers into thinking structured logging is in use here when it isn't.
- **When**: **Next quarter**
- **Where**: `services/insurers/digit/digit.mapper.js` line 4

### 5. Hardcoded placeholder fallbacks for critical vehicle fields
- **What**: Replace hardcoded vehicle field fallbacks (`"KA01ED4289"`, `"ENGINE12345"`, `"CHASSIS12345"`) with explicit `null` values or validation errors.
- **Why**: If a quote request reaches the mapper without a registration number, engine number, or chassis number (e.g. for a new vehicle), Digit will receive a Karnataka test plate or a literal `"ENGINE12345"` string. This corrupts the proposal record at Digit's end and can cause policy issuance failures that are hard to trace. A thrown validation error is better than silently substituting test data in production. The `vehicleMaincode` field already does this correctly — it throws `new Error(...)` if missing (lines 386–388).
- **When**: **Next quarter**
- **Where**: `services/insurers/digit/digit.mapper.js` lines 400–422

### 6. Commented-out IDV logic leaves IDV permanently at 0 for renewal policies
- **What**: Decide whether to restore the commented-out `quoteResult?.idv` and `policyDetail?.selected_idv` lookups in `buildVehicle()`, or document the intentional choice.
- **Why**: Lines 435–438 show three IDV sources that were commented out: `payload.selected_idv`, `quoteResult?.idv`, and `policyDetail?.selected_idv`. The resulting fallback is `0`, which sends IDV = 0 to Digit for any case where the front-end does not explicitly pass `payload.idv`. An IDV of 0 typically causes Digit to reject the request or auto-select the minimum IDV, making the premium unpredictable.
- **When**: **Next quarter**
- **Where**: `services/insurers/digit/digit.mapper.js` lines 431–440

### 7. Dual camelCase / snake_case field lookup pattern is repeated ~50 times
- **What**: Extract a small `pick(payload, 'fieldName', 'field_name')` helper and replace repetitive `payload.fieldName || payload.field_name` expressions.
- **Why**: The current pattern appears ~50 times across the file. A single helper would make the intent explicit, eliminate typos where one variant is misspelled, and reduce file size by roughly 30–40 lines.
- **When**: **Nice to have**
- **Where**: Throughout `services/insurers/digit/digit.mapper.js`

### 8. No unit tests
- **What**: Add a unit-test file for `digit.mapper.js` covering at least the mapping helpers and all `build*` / `normalize*` methods with representative input fixtures.
- **Why**: This is the most-edited file in the Digit integration (noted in `CLAUDE.md`) and the one most likely to cause silent regressions when field names change on either side. None of its logic is covered by the current test suite.
- **When**: **Nice to have**
- **Where**: `tests/` directory, new file `tests/services/insurers/digit/digit.mapper.spec.js`

## Open questions

1. **NCB 30% gap**: `mapNcbToDigit` has thresholds at 20, 25, 35, 45, and 50 — there is no `THIRTY` value. An input of 30% maps to `TWENTY_FIVE`. Is this intentional (Digit does not offer 30% NCB as a discrete bucket) or an oversight?
2. **State code "8"**: What is the correct approach for mapping an owner's state to Digit's numeric state code? Is there a lookup table that should be used, or does Digit accept the state abbreviation directly?
3. **`insuranceProductCode: "20101"`**: This is hardcoded as the fallback product code. Is this always the right value for private cars, or does it vary by vehicle category or product type?
4. **`previousInsurerCode: "113"`**: This default previous-insurer code needs confirmation — does "113" correspond to a real Digit-recognized insurer code or is it a placeholder that should be removed?
5. **New vehicle flow**: Several fields (registration number, engine number, chassis) are not applicable for brand-new vehicles. How should the mapper handle the new-vehicle case — are these fields expected to be blank/null in Digit's schema, or are placeholder values acceptable?
