# Commission Engine

## What this module does

The commission engine resolves the applicable commission rate for a specific motor insurance quote. Given an insurer, a vehicle's RTO (Regional Transport Office) code, a policy type, and optional vehicle attributes (fuel type, make, engine CC, age, add-on flag), it performs a two-step database lookup: first mapping the RTO to a named cluster, then finding the best-matching commission grid row for that cluster. It returns the resolved commission rate together with diagnostic information about how the match was found.

## Why this module exists

Commission rates in Indian motor insurance are determined by multi-dimensional grids that insurers provide as Excel sheets. These grids tie commissions to geographic clusters (groups of RTOs), vehicle types, and policy attributes. A standalone engine is needed to encapsulate the priority-based lookup logic — "find the most specific matching row, fall back to the broadest" — in one place so that any part of the application can resolve a commission without re-implementing the DB query strategy.

## When this module runs / is used

Currently the engine is invoked only by the admin endpoint `POST /api/admin/commission-grid/lookup` (`controllers/commission-grid.js:2109`), which is an internal diagnostic tool used to verify that imported commission grids resolve correctly for a given set of inputs. **It is not called from any step in the customer-facing motor insurance flow** (quote generation, proposal, payment). Commission rates therefore have no effect on live quotes or proposals; the engine is admin-only at this stage.

## How it fits in

| Direction | Module |
|---|---|
| **Depends on** | `models/mysqldb/commission-grid.js` — three raw SQL methods: `getRtoCluster`, `lookupCommissionGrid`, `getAvailableClusters` |
| **Called by** | `controllers/commission-grid.js` — the `lookupCommissionGrid` handler, which is mounted at `POST /api/admin/commission-grid/lookup` |
| **Not called by** | Any motor-flow controller (`motor-quotes.js`, `motor-proposal.js`, etc.) |

Related services in the same domain that are **not** dependencies of this module:

- `services/commission-grid.js` — Excel parsing helpers used during import, not during resolution
- `services/commission.js` — Legacy per-user commission distribution helpers; not imported anywhere in the codebase

## Key files

| File | Purpose |
|---|---|
| `services/commission-engine.js` | The only file in this module. Contains `CommissionEngineService` with a single public method `resolveCommission(input)`. Exported as a singleton. |
| `models/mysqldb/commission-grid.js` | Provides `getRtoCluster`, `lookupCommissionGrid`, and `getAvailableClusters` — the three raw SQL queries the engine relies on. Also owns the insert/delete methods used during grid import (not part of the engine's concern). |

## Optimization opportunities

### 1. Missing guard on required `insurer_id` field

- **What**: Add an early-return check at the top of `resolveCommission` that returns `{ found: false, reason: "insurer_id is required" }` when `insurer_id` is falsy.
- **Why**: Without the guard, `getRtoCluster` and `lookupCommissionGrid` receive `undefined` for `insurer_id`. MySQL parameterized queries treat `undefined` as `NULL`, so the RTO-cluster query matches rows where `insurer_id IS NULL` (typically none), and the engine returns the misleading reason `"RTO cluster mapping not found"` instead of surfacing the missing-input error. A caller that accidentally omits the field gets no actionable feedback.
- **When**: Now
- **Where**: `services/commission-engine.js:4–19` (destructuring block, before the first DB call)

### 2. Unconditional third DB query on every commission miss

- **What**: Gate the `getAvailableClusters` call behind a caller-supplied `debug: true` flag (or move it to the controller), so it only fires when explicitly requested.
- **Why**: Every time a commission lookup fails to match a grid row, a third DB round-trip runs to fetch up to 100 cluster names for diagnostic purposes. In a production motor flow this is pure overhead — the available-clusters list is only useful when a developer is debugging a mis-mapped grid. Eliminating the unconditional call halves the DB load on misses.
- **When**: Next quarter
- **Where**: `services/commission-engine.js:68–86`

### 3. No caching of RTO → cluster mappings

- **What**: Cache the result of `getRtoCluster` in Redis (or a simple in-process Map with a TTL), keyed on `insurer_id + rto_code + sub_product_code`. Invalidate the cache when a new commission grid is imported.
- **Why**: RTO-to-cluster assignments are static between grid imports (which happen at most a few times per month). Every `resolveCommission` call currently pays a live DB round-trip for data that almost never changes. A cache would reduce the average resolution from 2–3 sequential queries to 1–2 for the common case.
- **When**: Next quarter
- **Where**: `services/commission-engine.js:29–33`

### 4. Redundant numeric normalization of `cc` and `vehicle_age`

- **What**: Remove the `normalizedCc` / `normalizedVehicleAge` conversion inside `resolveCommission` (lines 21–27), or document that callers must not pre-normalize.
- **Why**: `controllers/commission-grid.js:2126–2137` already converts `cc` and `vehicle_age` to numbers before calling `resolveCommission`. The engine then converts them again. The double pass is harmless but adds confusion about which layer is authoritative for numeric coercion.
- **When**: Nice to have
- **Where**: `services/commission-engine.js:21–27`, `controllers/commission-grid.js:2126–2137`

### 5. `SELECT *` in `getRtoCluster` over-fetches columns

- **What**: Replace `SELECT *` with an explicit column list — at minimum `cluster_name`, `rto_code`, `city_name`, `state_name` — in `getRtoCluster`.
- **Why**: The engine only reads `rtoClusterRows[0].cluster_name`; the remaining columns are passed through to the caller as-is. Selecting all columns prevents the database from using a covering index and transfers unnecessary data over the connection.
- **When**: Nice to have
- **Where**: `models/mysqldb/commission-grid.js:297`

### 6. `lookupCommissionGrid` fetches 20 rows when only the first is used

- **What**: Expose a `limit` parameter (defaulting to `1` for live resolution, higher for admin/debug calls) so the DB fetches only what is needed for the decision.
- **Why**: `LIMIT 20` is a compromise between debug visibility and performance. The engine uses only `commissionRows[0]` as `bestMatch`; the remaining 19 rows are returned in the response payload for diagnostics. For a future live-flow integration, a single-row fetch is enough and reduces result-set serialization cost.
- **When**: Nice to have
- **Where**: `models/mysqldb/commission-grid.js:414`, `services/commission-engine.js:50–63`

### 7. Commission engine is not connected to the motor quote flow

- **What**: Integrate `CommissionEngineService.resolveCommission` into the quote-generation step (`controllers/motor-quotes.js` or the Digit quote service) so that resolved commission values are stored against each `quote_result` row.
- **Why**: The commission grid infrastructure (import, parsing, storage) is fully implemented, but the resolved rate is never attached to any customer-facing quote or proposal. Every commission record written to `insurer_commission_grid` is currently inert from the customer's perspective.
- **When**: Next quarter (depends on product decision to surface or act on commission values)
- **Where**: `services/commission-engine.js` (no changes needed to the engine itself), `controllers/motor-quotes.js`

## Open questions

- **Is the LIMIT 20 in `lookupCommissionGrid` intentional?** The query returns the top 20 matching rows ordered by priority, but only the first is used for the actual commission decision. It is unclear whether the intent is to let callers inspect all near-misses, or whether this was a diagnostic addition that was never trimmed down for production use.
- **Should RTO-cluster mapping be policy-type-aware?** The `getRtoCluster` query filters by `insurer_id` and `rto_code` only; `policy_type_code` is part of the ORDER BY priority but is not used as a hard filter. If an insurer maps the same RTO to different clusters for Comprehensive vs TP policies, the current query would always return the `sub_product_code`-matched row, ignoring the policy type entirely.
- **What is the plan for connecting this engine to the live motor flow?** `work_info.md` notes the commission grid as a completed feature, but the engine is currently only reachable via the admin lookup endpoint. Clarification from the product team is needed on whether commission values should influence quote pricing, agent payouts, or just reporting.
