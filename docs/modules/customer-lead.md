# Customer Lead

## What this module does
The customer-lead module creates and retrieves prospective customer records — the very first step in the motor insurance journey. When a customer expresses interest (e.g. fills in a web form), a lead record is created with their name, mobile number, email, and source channel. Each lead gets a system-generated reference number such as `LD-20260524-000001`. A lead must exist before a motor quote request can be started.

## Why this module exists
It acts as the top of the insurance funnel, capturing interest before any product-specific information is known. The `lead_id` is a required foreign key in `motor-quote-request`, making this the mandatory entry point for every customer journey. Keeping it as a separate module allows the front-end to register a prospect the moment contact details are collected, before the customer chooses a vehicle or policy type.

## When this module runs / is used
- `POST /api/customer/leads/add` — Called by the partner app or web front-end when a customer submits a lead-capture form. Validates that `mobile_number` is present, generates a reference number, and persists the record.
- `GET /api/customer/leads/:id` — Called by the front-end or other internal controllers to retrieve a lead record by its database ID.
- Internally by `motor-quote-request`: `controllers/motor-quote-request.js` calls `MysqlCustomerLeadsModel.findById(payload.lead_id)` to verify that the supplied lead exists before creating any quote rows.

Both routes sit under the standard auth middleware (`validateHeaders` + `decodeUserData`), so a valid `userdata` header is required.

## How it fits in
- **Depends on**: `shared-library` — `MysqlCustomerLeadsModel` base class provides the Sequelize model and table binding.
- **Depends on**: `services/common` (`CommonService.errorHandler`) — structured Winston logging on errors in the `add` handler.
- **Depended on by**: `motor-quote-request` — validates the lead exists before fan-out into vehicle/owner/policy detail tables.

## Key files

| File | Purpose |
|---|---|
| `routes/customer-lead.js` | Registers `POST /add` and `GET /:id`, wires them to the controller. |
| `controllers/customer-lead.js` | `add`: validates mobile number, generates reference number, inserts the record. `detail`: fetches by PK with a 404 guard. |
| `models/mysqldb/customer-lead.js` | Thin wrapper around the shared-library base: `add` (create), `findAllCount` (count by condition), `findById` (findByPk). |

## Optimization opportunities

- **Race condition in reference-number generation**
  - **What**: Replace the count-then-increment pattern with a database-level sequence or an atomic upsert on a daily counter table.
  - **Why**: Two concurrent requests on the same day call `findAllCount` at the same time, receive the same count, and derive the same reference number. If the `lead_reference_no` column has a unique constraint the second insert fails with an opaque DB error; if it does not, silent duplicates are created.
  - **When**: Now
  - **Where**: `controllers/customer-lead.js:91–97`

- **Dead import: `QueryTypes` in the model**
  - **What**: Remove `const { QueryTypes } = require("sequelize")` from the model file — it is never referenced anywhere in the file.
  - **Why**: Dead imports add noise and slow module load time slightly.
  - **When**: Now
  - **Where**: `models/mysqldb/customer-lead.js:1`

- **`console.log` in both error handlers**
  - **What**: Remove the `console.log(error)` calls; they duplicate the structured Winston call that `CommonService.errorHandler` already makes. In `detail`, `CommonService.errorHandler` is never called at all — replace `console.log` with a proper `CommonService.errorHandler` call there.
  - **Why**: Raw `console.log` bypasses Winston's log level, formatting, and transport chain; in production it pollutes stdout with unstructured stack traces.
  - **When**: Now
  - **Where**: `controllers/customer-lead.js:118, 210`

- **No mobile number format validation**
  - **What**: Validate that `mobile_number` is a 10-digit numeric string (Indian mobile format) before inserting.
  - **Why**: The current check (`if (!payload.mobile_number)`) accepts `"x"`, `"abc"`, or any truthy string, producing junk records that cannot receive SMS notifications. Invalid leads would then propagate into quote requests.
  - **When**: Next quarter
  - **Where**: `controllers/customer-lead.js:80–86`

- **Response format bypasses `ResponseHandler` and i18n**
  - **What**: Replace manual `res.status().json({ error, status, message, result })` calls with `ResponseHandler.success / failure / validationError` and i18n message keys.
  - **Why**: Every other module in the codebase uses the `ResponseHandler` envelope with `i18n.__()` keys; inconsistency makes the `add` and `detail` responses structurally different from all other endpoints and prevents translations.
  - **When**: Nice to have
  - **Where**: `controllers/customer-lead.js` throughout

- **Encapsulate `Op.like` inside the model layer**
  - **What**: Move the Sequelize `Op.like` condition into a `findCountByDatePrefix(ymd)` method on the model instead of building it in the controller.
  - **Why**: Leaking raw ORM operators (`Op`) into the controller layer couples the controller to Sequelize specifics; the model should own all query construction.
  - **When**: Nice to have
  - **Where**: `controllers/customer-lead.js:1, 91–95`; `models/mysqldb/customer-lead.js`

## Open questions

- **`lead_status` is always "NEW" and never updated**: There is no endpoint to advance a lead's status (e.g. to `QUOTE_REQUESTED`, `PROPOSAL_CREATED`, `CONVERTED`, `ABANDONED`). Is status tracking intentional not implemented, handled by a separate system, or an outstanding gap?
- **No `list` or `update` endpoint**: The module has only `add` and `detail`. Is the intention that only the CRM/admin tool manages lead lifecycle, or is a customer-facing update flow planned?
- **Duplicate mobile number policy**: There is no check for an existing lead with the same `mobile_number`. Multiple leads can be created for the same phone number. Is that intentional (support re-enquiry flows) or should returning visitors be detected and their existing lead returned?
