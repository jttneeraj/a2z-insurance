# Motor Quote Request

## What this module does

This module is the first step in the motor insurance customer journey. A customer submits their vehicle details, personal information, and previous-policy history in a single API call; the module validates the data against master tables, generates a unique quote reference number, and saves everything across four database tables in one atomic transaction. The resulting `quote_request_id` is the key that every downstream step — quote generation, proposal, payment, and policy — uses to look up the customer's information.

## Why this module exists

Getting quotes from multiple insurers requires gathering a fixed set of vehicle and owner data upfront. By capturing and persisting it here in one transactional write, all later steps can simply read this data rather than asking the customer to re-submit it. The fan-out into separate `vehicle_detail`, `owner_detail`, and `policy_detail` tables reflects the data model's separation of concerns: each sub-record type can be extended or queried independently without modifying the parent `quote_request` row.

## When this module runs / is used

Runs when the customer (or the partner portal on the customer's behalf) submits the quote-request form — the very first action after a lead is created. The single entry point is:

```
POST /api/customer/motor/quote-request/add
```

The caller must have already created a lead (via the `customer-lead` module) and must supply the resulting `lead_id` in the request body. This endpoint is reached through the standard auth middleware, so a valid `userdata` header is required.

## How it fits in

**Depends on:**
- `customer-lead` — the lead record must already exist; `lead_id` is a required FK and the controller reads `full_name`, `mobile_number`, and `email` from the lead as fallback defaults for the owner record.
- `motor-quote-master-validation` service — validates `rto_code`, `vehicle_code`, `previous_policy_type`, `previous_insurer_code`, and `previous_ncb_percent` against master tables before any DB write.
- `models/mysqldb/quote-request` — parent header record.
- `models/mysqldb/quote-request-vehicle-detail` — vehicle sub-record.
- `models/mysqldb/quote-request-owner-detail` — owner sub-record.
- `models/mysqldb/quote-request-policy-detail` — previous-policy sub-record.
- `services/common` (`CommonService.errorHandler`) — structured error logging.

**Depended on by:**
- `motor-quotes` — reads the `quote_request` row (by `quote_request_id`) to fan out insurer quote calls.
- `motor-proposal` — carries `quote_request_id` through to proposal and KYC.
- `motor-kyc` — records the `quote_request_id` on the KYC entry.
- `motor-payment` — links payment records back to the quote request.
- `motor-policy` — uses `quote_request_id` to retrieve policy status and PDF.
- `digit.mapper.js` — reads all three sub-detail tables to build insurer-specific API payloads.

## Key files

| File | Purpose |
|---|---|
| `routes/motor-quote-request.js` | Registers `POST /add` and delegates to the controller. |
| `controllers/motor-quote-request.js` | Contains the entire `add` handler: validation, quote-number generation, transaction, and response. |
| `models/mysqldb/quote-request.js` | Sequelize model for the `quote_request` table; exposes `add`, `update`, `findById`, `findAllCount`, `find`. |
| `models/mysqldb/quote-request-vehicle-detail.js` | Model for the vehicle sub-record table; exposes `add`, `update`, `findById`, `findByQuery`, `find`. |
| `models/mysqldb/quote-request-owner-detail.js` | Model for the owner sub-record table; same interface as the vehicle model. |
| `models/mysqldb/quote-request-policy-detail.js` | Model for the previous-policy sub-record table; same interface as the vehicle model. |
| `services/motor-quote-master-validation.js` | Validates incoming field values (RTO, vehicle code, previous insurer, NCB %) against master tables before any write. |

## Optimization opportunities

### 1. Race condition in quote number generation

- **What**: Replace the `findAllCount` + `count + 1` pattern for generating `QT-YYYYMMDD-NNNNNN` with an atomic counter (e.g., a DB sequence table with `SELECT ... FOR UPDATE`, or a `LAST_INSERT_ID`-based counter).
- **Why**: Two concurrent requests on the same day both read the same count, produce the same reference number, and one of them hits a DB unique-constraint error — or, if no unique constraint exists, both silently commit the same number. The identical race condition was flagged for `customer-lead` reference numbers.
- **When**: Now
- **Where**: `controllers/motor-quote-request.js:305–311`

### 2. Dead function `validateMotorQuoteMasters_` references unimported models

- **What**: Delete the 60-line `validateMotorQuoteMasters_` function (note the trailing underscore) at the top of `services/motor-quote-master-validation.js`.
- **Why**: The function is never exported and can never be called. However, it references five models (`MysqlRtoMasterModel`, `MysqlVehicleMasterModel`, `MysqlPreviousPolicyTypeModel`, `MysqlMotorPreviousInsurerModel`, `MysqlNcbMasterModel`) that are not imported anywhere in the file — so if it were ever accidentally exported, it would crash on first call with `ReferenceError`. The active replacement (`validateMotorQuoteMasters`, without underscore) uses a different, newer set of master tables. The dead code obscures which validation path is actually in use.
- **When**: Now
- **Where**: `services/motor-quote-master-validation.js:7–66`

### 3. `console.log(error)` duplicates and bypasses structured logging

- **What**: Remove `console.log(error)` on line 424 of the controller.
- **Why**: `CommonService.errorHandler` on the next line already writes to Winston with structured metadata. The preceding `console.log` dumps a raw stack trace to stdout, bypassing log-level controls and leaking error details in production; it also results in every 500 error being logged twice.
- **When**: Now
- **Where**: `controllers/motor-quote-request.js:424`

### 4. Missing FK validation for `insurance_type_id` and `product_id`

- **What**: Before starting the DB transaction, add existence checks for `insurance_type_id` in `insurance_type` and `product_id` in `insurance_product` (consistent with how `lead_id` is already validated).
- **Why**: Invalid foreign-key values are silently passed into the `quote_request` row; if the DB has a FK constraint they produce an opaque 500 instead of a 400 with a meaningful message. If no FK constraint exists they silently store invalid IDs.
- **When**: Next quarter
- **Where**: `controllers/motor-quote-request.js` between lines 289 and 302

### 5. Response envelope bypasses `ResponseHandler`

- **What**: Route all responses through `ResponseHandler#success`, `#validationError`, and `#error` from `utils/response-handler.js` instead of inline `res.status(N).json({...})` calls.
- **Why**: Consistency with the documented convention (see `CLAUDE.md`); i18n-keyed messages allow future localization; `ResponseHandler` also provides standardised logging hooks.
- **When**: Next quarter
- **Where**: `controllers/motor-quote-request.js` throughout

### 6. Dead `QueryTypes` import in all four model files

- **What**: Remove `QueryTypes` from the destructured `require("sequelize")` import in all four model files (`quote-request.js`, `quote-request-vehicle-detail.js`, `quote-request-owner-detail.js`, `quote-request-policy-detail.js`).
- **Why**: `QueryTypes` is imported but never referenced in any of the four files — consistent copy-paste residue. Minor cleanup; reduces noise when reading the files.
- **When**: Nice to have
- **Where**: All four `models/mysqldb/quote-request*.js` files, line 1

### 7. Stray debug comment in route file

- **What**: Remove the `///test test` comment on line 10 of `routes/motor-quote-request.js` and the trailing whitespace on line 12.
- **Why**: Leftover development artifact with no informational value.
- **When**: Nice to have
- **Where**: `routes/motor-quote-request.js:10–12`

## Open questions

1. **Update path**: There is no `PUT /update` or `PATCH` endpoint for an existing quote request. Is the intended flow to always create a new quote request if the customer changes vehicle details, or is an update path planned?
2. **New-vehicle scenario**: Master validation of `rto_code` is skipped when the field is absent. Is a quote request without an RTO code valid (e.g., for brand-new, unregistered vehicles), and if so, how is that distinguished from a registration-type mismatch?
3. **`idv` alias**: The policy detail fan-out maps `payload.selected_idv || payload.idv` to the `selected_idv` column (line 393). Is `idv` a documented alternative field name for client compatibility, or is it undocumented legacy that can be removed?
