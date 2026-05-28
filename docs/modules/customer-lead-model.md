# Customer Lead Model

## What this module does
This module captures and stores the very first touch point a potential customer has with the platform — a "lead". When someone expresses interest in buying motor insurance (typically by submitting a form), a lead record is created with their contact details and a unique reference number. The lead record is later looked up when that person proceeds to request a quote.

## Why this module exists
The insurance sales funnel starts before a customer gets a quote. Capturing lead data separately allows the business to track conversion rates (how many leads become policies), run follow-up campaigns on unconverted leads, and tie every downstream quote, proposal, and policy back to a single originating contact. The dedicated model/controller/route keeps this concern isolated from the motor-flow tables.

## When this module runs / is used
- **On lead creation**: triggered when a client application (web or partner portal) calls `POST /api/customer/leads/add`. This typically happens as soon as a user submits their name, mobile number, and email on an interest/enquiry form.
- **On lead lookup**: triggered when a user then calls `POST /api/customer/motor/quote-request` — the motor-quote-request controller fetches the lead by `lead_id` to confirm the lead exists and to carry the `lead_id` through to all quote-request child tables.
- **On detail fetch**: triggered by `GET /api/customer/leads/:id`, used by admin or front-end screens to display lead details.

## How it fits in
- **Depends on**: `shared-library` (provides `MysqlCustomerLeadsModel` base class and Sequelize DB connection); `services/common` (error logging utility used in the `add` handler).
- **Depended on by**: `controllers/motor-quote-request` (calls `MysqlCustomerLeadsModel.findById` to validate `lead_id` before creating a quote request).

## Key files

| File | Purpose |
|---|---|
| `models/mysqldb/customer-lead.js` | Sequelize model wrapper; extends the shared-library base class; exposes `add`, `findAllCount`, and `findById` methods; exports a singleton. |
| `controllers/customer-lead.js` | HTTP handlers for creating a lead (`add`) and fetching one by ID (`detail`); contains reference-number generation logic. |
| `routes/customer-lead.js` | Express router; maps `POST /add` and `GET /:id` to their controller handlers; mounted at `/api/customer/leads` in `app.js`. |

## Optimization opportunities

- **What**: Replace the `findAllCount` + `padStart` reference-number sequence with an atomic alternative (e.g., a dedicated counter table with `SELECT ... FOR UPDATE`, or a Redis `INCR` keyed to `LD-{YYYYMMDD}`).
  **Why**: The current approach has a race condition — two concurrent requests on the same date both read the same count and generate identical `lead_reference_no` values. If the column has a unique constraint this causes a crash; if it does not, silent duplicates corrupt reporting.
  **When**: Now (if any concurrent traffic is expected on the lead-creation endpoint).
  **Where**: `controllers/customer-lead.js:91–97`

- **What**: Replace raw `res.status().json({...})` responses with `ResponseHandler` (`utils/response-handler.js`) calls and route error messages through `i18n.__()`.
  **Why**: Every other controller in the codebase uses `ResponseHandler`; bypassing it means lead endpoints won't benefit from centralised logging hooks, consistent envelope shape, or future i18n without another pass.
  **When**: Next quarter.
  **Where**: `controllers/customer-lead.js` throughout (lines 80–130, 191–218).

- **What**: Add `CommonService.errorHandler` (and structured log metadata) to the `catch` block in the `detail` handler.
  **Why**: The `add` handler logs errors through `CommonService.errorHandler`; `detail` swallows errors silently with only a `console.log`, making production failures invisible in the structured Winston log stream.
  **When**: Next quarter.
  **Where**: `controllers/customer-lead.js:209–215`

- **What**: Run `full_name`, `email`, and `source` through the project's `services/sanitize` helpers before persisting.
  **Why**: These fields arrive directly from user input and are stored without any sanitization, unlike fields in other controllers that pass through the sanitize service. Unsanitized strings risk storing malformed data and could interact badly with downstream renderers.
  **When**: Next quarter.
  **Where**: `controllers/customer-lead.js:99–107`

- **What**: Add format validation for `mobile_number` (e.g., 10-digit Indian mobile regex).
  **Why**: Currently only presence is checked; a value of `"0"` or `"abc"` passes validation and gets persisted. Poor-quality leads reduce campaign effectiveness.
  **When**: Nice to have.
  **Where**: `controllers/customer-lead.js:80–85`

- **What**: Remove the stale copy-paste comment `// Insurer API Field Validation Rule` at line 6.
  **Why**: Misleads maintainers into thinking this file is related to field-validation rules.
  **When**: Nice to have.
  **Where**: `routes/customer-lead.js:6`

## Open questions
- Does the `customer_leads` table have a unique index on `lead_reference_no`? If yes, the race condition causes runtime errors under concurrent load; if no, silent duplicates are possible. Either way the generation strategy needs to be hardened.
- Is there a planned endpoint to list or search leads (e.g., by mobile number or date range)? The model only supports `add`, `findAllCount` (used only for sequencing), and `findById`; a `findAll` with filter/pagination seems like an obvious gap for any admin or CRM view.
- The `source` field defaults to `"WEB"` but is a free-form string. Is there an agreed-upon set of values (e.g., `WEB`, `MOBILE`, `PARTNER`)? If so, a lookup against a constants array or a DB enum would guard data quality.
