# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Run dev server (nodemon, NODE_ENV=development, reads .env)
npm start
# Windows variant
npm run startwindow

# Tests (mocha + nyc, attaches inspector on :9292, expects .env.test)
npm test                    # all specs under tests/api/routes/**
npm run testone             # only tests/api/routes/insurance/insurance-upi.spec.js
npm run testindex           # only tests/index.spec.js
npm run test:coverage       # full suite with nyc coverage report

# To run a single spec file ad hoc:
NODE_ENV=test DEBUG=true npx mocha ./tests/api/routes/<path>.spec.js --exit --timeout 120000

# Docker build (requires GITHUB_TOKEN to pull the private shared-library dep)
docker build --build-arg GITHUB_TOKEN=<token> --build-arg SHARED_LIB_BRANCH=develop -t a2z-insurance .
```

App listens on `process.env.APP_PORT` (default `4015`). Swagger UI is mounted at `/api-docs` (dev only, or when `CLIENT_APP_URL` contains `partners.atozsuvidhaa.com`).

## Environment Handling

- `app.js` **requires** `NODE_ENV` to be set and throws if missing.
- `NODE_ENV=test` loads `.env.test` explicitly; everything else falls back to `.env` (so dev, staging, and prod all read `.env` — the deployed `.env` is what differentiates them).
- DB credentials, AWS/S3, Redis, and Digit UAT/PROD API creds all live in env vars. The `.env` file is gitignored but currently checked into the working tree with real DigitalOcean MySQL and Digit UAT credentials — treat it as a secret.
- `entrypoint.sh` pre-creates a long list of `logs/services/*` subdirectories (including the intentional typo `logs/combibned`) before exec'ing the app. Don't "fix" the typo without also updating Winston transports that may write there.

## Architecture

This is an Express 4 monolith for motor insurance operations, structured as a thin **routes → controllers → services/models** stack.

### Request lifecycle
1. `app.js` mounts `/ping` (unauthenticated health check) before auth middleware.
2. All other routes go through `middlewares/headers.js`:
   - `validateHeaders` requires a `userdata` HTTP header (returns 401 otherwise).
   - `decodeUserData` Base64-decodes that header, JSON-parses it, and **replaces** `req.headers['userdata']` with the parsed object. Controllers read user identity from `req.headers['userdata']`, not `req.userData`.
3. Routes under `/api/admin/*` are admin/config endpoints; `/api/customer/motor/*` are the customer-facing motor flow.
4. Controllers return responses via `utils/response-handler.js` (`ResponseHandler#success`, `successList`, `failure`, `validationError`, `error`). Messages are run through `i18n.__()` — keep them as keys defined under `locales/`.
5. 404 + error handlers at the bottom of `app.js` log via Winston and return JSON.

### Shared library (critical)
Models extend base classes imported from a **GitHub-hosted private package** `shared-library` (`excela2zsuvidha/a2z-shared-library#develop`). Models do `require(process.env.SHARED_LIBRARY_PATH + "/services/models")` — `SHARED_LIBRARY_PATH` defaults to `"shared-library"` and resolves via node_modules. Schema changes (new tables, new columns) often have to land in the shared-library repo first; check `node_modules/shared-library/database-tables.sql` and `db-query-change.txt` to see what's available before adding model fields here. The Dockerfile injects a `GITHUB_TOKEN` build arg solely to clone this package.

### Motor insurance flow
The end-to-end customer journey is:
```
Lead → QuoteRequest → GenerateQuote → SelectPlan → Proposal → KYC → Payment → PolicyStatus → PolicyPDF
```
Each step has its own controller (`motor-*.js`), route (`routes/motor-*.js`), and one or more dedicated tables. A single `QuoteRequest` fans out into `quote_request_vehicle_detail`, `quote_request_owner_detail`, `quote_request_policy_detail` rows in one transaction. Outbound calls to insurers are persisted in `quote_insurer_request` / `quote_insurer_response`; normalized rows for the UI live in `quote_result`.

### Insurer integration (factory pattern)
- `services/insurers/insurer.factory.js` exports a singleton with `getMotor{Quote,Proposal,Payment,Kyc,Policy}Service(insurerCode)` methods.
- `insurerCode` is normalized uppercase. `MOCK` / `MOCK_DIGIT` → mock services (`services/insurers/mock/`); `DIGIT` / `DIGIT_ONE` → real Digit services (`services/insurers/digit/`). **Unknown codes fall through to Mock** — be aware when debugging "wrong adapter" issues.
- Digit adapter splits cleanly: `digit.config.js` (UAT URLs are hardcoded, PROD reads env), `digit.auth.service.js` (access token), `digit.executor.service.js` (generic call wrapper), `digit.<flow>.service.js` (per-flow orchestration), and `digit.mapper.js` (request/response field mapping — the biggest and most-edited file; recent commits all touch this).
- All insurer HTTP calls go through `services/insurers/common/insurer-http-client.js` and are logged via `insurer-api-log.service.js`.

When adding a new insurer (e.g. ICICI, HDFC ERGO), mirror the `digit/` folder layout and add code matching to the factory's `is*()` helpers.

### Commission engine
`services/commission-engine.js` resolves commission grids by walking RTO cluster → multi-criteria lookup (fuel type, make, CC, age, addon) with **priority-based fallback**. Grid data is imported via `controllers/commission-grid.js` from multi-sheet Excel files; the parsing helpers live in `services/commission-grid.js` (sheet-type detection, header normalization, percentage extraction, decline detection). Don't reimplement column parsing — extend those helpers.

### Master data import
`controllers/import-master.js` + `routes/master-import.js` accept a `masterType` and an Excel/TXT file. Mappings between `masterType` and target tables are documented in `information.md` at the repo root. Imports use chunked inserts with `ON DUPLICATE KEY UPDATE` and run inside a transaction (`models/mysqldb/master-import.js`).

### Logging
`winston.js` wires Console + daily-rotated file transports (info and error) and an HTTP transport in production. Logs are written to `logs/combined`, `logs/error`, and per-service folders under `logs/services/*` (pre-created by `entrypoint.sh`). Always include the structured metadata fields the existing controllers use: `{ url, function, operation, relativeDetail, err, errorObj }` — the 404/error handlers expect them.

## Conventions

- Models live in `models/mysqldb/` and follow the pattern: `class FooModel extends MysqlFooModel` (from shared-library), then export `{ mysqldb, MysqlFooModel: new FooModel() }`. Controllers consume the already-instantiated singleton.
- Files suffixed `copy.js` (e.g. `models/mysqldb/master-import copy.js`, `controllers/motor-payment copy.js`, `routes/insurance copy.js`) are legacy snapshots kept around as references — don't import them, but check them when you can't find why a behavior changed.
- Constants are split across `constants/common.js`, `constants/credential.js`, and re-exported from `constants/index.js`. Reuse `HTTP_STATUS` and the dropdown arrays (`STATUSES`, `PLAN_TYPES`, `COMMISSION_CHARGE_TYPE`, etc.) rather than re-defining literals.
- `information.md` and `work_info.md` at the repo root contain the human-maintained roadmap and master-import mapping table. `work_info.md` in particular is a near-complete inventory of what exists in the codebase — useful for orienting before a refactor.
- `windsurf.md` is a project-changes journal and is gitignored.
