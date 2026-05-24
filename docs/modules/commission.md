# Commission

## What this module does

`services/commission.js` calculates how a single premium amount is split across a four-tier distribution chain: the selling agent (retailer), a distributor, a master distributor (MD), and the admin (platform). For each tier it computes a commission amount, a TDS (tax deducted at source) deduction, and—for the retailer only—a service charge and GST. When a distributor or MD is absent (their ID is `0`), their share rolls up to admin.

## Why this module exists

Motor insurance distribution in India typically works through a layered agency network. Each party in the chain is owed a share of the premium revenue. This module centralises that arithmetic so controllers can call a single function rather than repeating the percentage/flat calculation logic in multiple places. `getTDS` and `getIncludingGstAmount` are delegated to the shared library so tax-rate changes in one place propagate everywhere.

## When this module runs / is used

**Currently never.** No file in the repository imports or calls `calculateCommission`, `agentCharge`, or `getCommission`. The module is exported but entirely unreferenced — it is dead code. Based on the four-tier hierarchy modelled (`user_id`, `distributor_id`, `md_id`, `admin`), it appears to have been written for a commission-payout flow that was not completed in this service.

## How it fits in

**Depends on:**
- `shared-library/services/common` — `getTDS` (computes TDS given amount + PAN status) and `getIncludingGstAmount` (computes GST on a charge amount). The shared library is a private GitHub-hosted package; it is not installed in the current working tree.

**Depended on by:**
- Nothing — no file in this repository requires `services/commission.js`.

## Key files

| File | Purpose |
|---|---|
| `services/commission.js` | The entire module — 96 lines covering `calculateCommission` (orchestrator), `agentCharge` (charge per flat or percent), and `getCommission` (commission per flat or percent), plus a commented-out local `getTDS` draft |

## Optimization opportunities

- **What**: Delete `services/commission.js` entirely (or park it behind a clearly marked `_unused/` folder).
  **Why**: The module is dead code — no file imports it. Keeping it creates maintenance overhead and misleads future readers into thinking commission distribution is live. The commented-out `getTDS` at lines 82–91 also references env vars (`PAN_WHITELIST_TDS_DEDUCTION_RATE`, `TDS_DEDUCTION_RATE`) that are not defined anywhere in `.env`, so even the fallback path would fail if the code were revived as-is.
  **When**: Now.
  **Where**: `services/commission.js` (entire file)

- **What**: Remove the implicit global variable `result_data` from `calculateCommission`.
  **Why**: `return result_data = { ... }` at line 27 assigns to an undeclared identifier. In non-strict mode this silently creates a property on the global object (`global.result_data` in Node). Any concurrent request would overwrite the previous call's result before the caller has a chance to use it. The fix is to remove the assignment and just `return { ... }`.
  **When**: Now (if the function is ever activated).
  **Where**: `services/commission.js:27`

- **What**: Remove the duplicate commission calculation helpers (`agentCharge`, `getCommission`) and reuse `calculateChargeCommission` from `services/common.js`.
  **Why**: `agentCharge(amount, charge, chargeType)` and `getCommission(amount, commission, commission_type)` are functionally identical to `services/common.js:375 calculateChargeCommission(amount, charge_commission_type, agent_charge)` — all three compute `FLAT → return rate` / `PERCENT → (amount × rate) / 100`. Two sources of truth for the same arithmetic increase the chance of a divergence bug if charge logic ever changes.
  **When**: Next quarter (contingent on activating the module).
  **Where**: `services/commission.js:61–80`, `services/common.js:375–381`

- **What**: Harden the `admin.id: 1` hardcode.
  **Why**: The `admin` entry in the result always uses `id: 1` (`services/commission.js:51`). If the admin user ID ever changes (multi-tenant deployment, DB re-seed), payouts to admin would silently target the wrong account. The caller already supplies `user_parents`; an `admin_id` field should be added to that structure.
  **When**: Next quarter (contingent on activating the module).
  **Where**: `services/commission.js:51`

## Open questions

- The `user_parents` structure references `distributor_id`, `md_id`, `user_pan_status`, `md_pan_status`, and `distributer_pan_status` (note the typo: "distributer" vs "distributor"). None of these fields appear in any model or controller in this repo. Are they read from a `member` or `profile` table in the shared library? Who is responsible for populating them before calling `calculateCommission`?
- The commented-out local `getTDS` (lines 82–91) reads `process.env.PAN_WHITELIST_TDS_DEDUCTION_RATE` and `process.env.TDS_DEDUCTION_RATE`. These env vars are absent from `.env`. Was the shared-library version of `getTDS` adopted to avoid the env-var dependency, or was this a work-in-progress that was abandoned? Are the two implementations numerically equivalent?
- Is commission distribution planned for the motor insurance flow in this service, or does payout calculation happen in a separate downstream service after policy issuance?
