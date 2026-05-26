# Motor Policy Document Model

## What this module does

This module is the data-access layer for the `motor_policy_document` table. It provides four operations — insert, update, look up by primary key, and look up by an arbitrary filter — that allow other parts of the application to persist and retrieve policy status snapshots and policy PDF metadata returned by insurers. The underlying database binding (Sequelize model, connection pool, table definition) is provided by the shared library; this file adds the specific query methods the application actually uses.

## Why this module exists

After the insurer issues a policy and returns a status or a PDF document link, the platform needs a durable record of that response so customer support staff can retrieve it and so audit trails are preserved. Rather than scattering raw insurer responses inside the proposal or payment tables, they are stored in a dedicated `motor_policy_document` table with structured fields (policy number, policy status, payment status, KYC status, document URL, document type) alongside the full raw response blob. This separation makes the table queryable and keeps the proposal/payment tables focused on their own concerns.

## When this module runs / is used

The model is written to at two points in the customer-facing motor flow, both triggered by POST requests:

- **Policy status check** — `POST /api/customer/motor/policy/status`: after the insurer's policy-status API is called, a new row is inserted with the normalized status fields (`policy_number`, `policy_status`, `payment_status`, `kyc_status`) and the raw insurer response.
- **Policy PDF generation** — `POST /api/customer/motor/policy/pdf`: after the insurer returns a document URL, a new row is inserted with `document_type = "POLICY_SCHEDULE"`, `document_code`, `document_url`, and the raw PDF response.

In both cases the insert fires unconditionally — every call creates a new row even if one already exists for the same proposal.

## How it fits in

- **Depends on**: `shared-library` — supplies `MysqlMotorPolicyDocumentsModel` (Sequelize model class, table schema, DB connection) and the `mysqldb` connection instance.
- **Depended on by**: `controllers/motor-policy.js` — the only consumer; it imports the exported singleton and calls `add()` after each insurer interaction.
- **Indirectly used by**: `routes/motor-policy.js` (mounts the `/status` and `/pdf` routes) and `app.js` (registers those routes under `/api/customer/motor/policy`).

## Key files

| File | Purpose |
|------|---------|
| `models/mysqldb/motor-policy-document.js` | Defines `MotorPolicyDocumentsModel`, wires it to the shared-library base class, and exports the singleton used everywhere in the app. |
| `controllers/motor-policy.js` | The only consumer; calls `MysqlMotorPolicyDocumentsModel.add()` to persist results from the policy-status and PDF endpoints. |
| `routes/motor-policy.js` | Registers `POST /status` and `POST /pdf` and delegates to the controller. |

## Optimization opportunities

- **What**: Replace the unconditional `add()` call with an upsert keyed on `(proposal_id, document_type)` (or a similar unique key).
  **Why**: Every call to `/status` or `/pdf` inserts a brand-new row, so repeated polling — which is common while waiting for an insurer to finalize a policy — fills the table with duplicate rows for the same proposal. An upsert (`ON DUPLICATE KEY UPDATE` / Sequelize `upsert`) would keep only the latest snapshot per proposal/document-type combination and avoid unbounded row growth.
  **When**: Next quarter.
  **Where**: `controllers/motor-policy.js` lines 31–43 (status) and 93–106 (generatePdf); also needs a unique index on the table in shared-library.

- **What**: Add a `findAllByQuery` (or `findAll`) method to the model.
  **Why**: `findByQuery` wraps Sequelize `findOne`, so it silently returns only the first matching row. If any future feature needs to list all documents for a proposal (e.g., a customer support view showing multiple status snapshots or multiple PDF versions), the method will silently truncate results. Exposing `findAll` now prevents subtle bugs later.
  **When**: Next quarter.
  **Where**: `models/mysqldb/motor-policy-document.js` line 8.

- **What**: Move large raw-response blobs (`raw_policy_status`, `raw_pdf_response`) to S3 and store only the S3 key in the database row.
  **Why**: The full insurer response JSON can be several kilobytes per call. Storing it inline in MySQL increases row size, slows table scans, and complicates backups. The codebase already has `lib/aws.js` for S3 access, so the infrastructure is in place.
  **When**: Nice to have.
  **Where**: `controllers/motor-policy.js` lines 42 and 105 (where the raw response is assigned to the insert payload).

- **What**: Add test coverage for the model and the motor-policy controller.
  **Why**: No tests exist for this module. The controller contains meaningful branching logic (insurer error vs generic error, different field sets for status vs PDF), and the model's behaviour when `findById` returns null is untested. A regression in this code would be invisible to CI.
  **When**: Next quarter.
  **Where**: New file at `tests/api/routes/motor-policy.spec.js`.

- **What**: Remove the unused `update()` method from the model or document its intended use.
  **Why**: `update()` is defined on the model (line 6) but is never called anywhere in the codebase. Dead code creates confusion about the table's mutation surface and misleads future maintainers into thinking updates are a supported operation.
  **When**: Nice to have.
  **Where**: `models/mysqldb/motor-policy-document.js` line 6.

## Open questions

- What is the exact schema of `motor_policy_document` in the shared library? Specifically: are there unique indexes that would support an upsert on `(proposal_id, document_type)`, and what is the column type / size limit for `raw_policy_status` and `raw_pdf_response`?
- Is there a planned "retrieve policy documents for a proposal" endpoint? If so, `findByQuery` (which uses `findOne`) will need to be replaced with a `findAll` variant before that endpoint is built.
- The `update()` method is never called in the current codebase — is it intentional (reserved for a future admin correction flow) or an oversight?
