# Sanitize

## What this module does
This module exposes a single helper function, `removeScriptTags`, that strips HTML `<script>...</script>` tag pairs from a string using a regular expression. The intent is to prevent cross-site scripting (XSS) — a class of attack where malicious JavaScript is injected into user-facing output and executed in a browser.

## Why this module exists
The codebase accepts free-text input in several places (lead capture, proposal fields, KYC details) that could theoretically reach a browser. A dedicated sanitization helper was created so that any controller could call it before writing or returning user-supplied text. It lives as its own service file to keep the sanitization logic centralized and reusable rather than scattered across controllers.

## When this module runs / is used
**It does not run anywhere today.** A thorough search of the entire codebase (controllers, middlewares, routes, models) found zero `require` statements or function calls that reference this module. The function was written but never wired up.

## How it fits in

**Depends on:** Nothing — no imports.

**Used by:** Nothing — `removeScriptTags` is never imported or invoked anywhere in the codebase as of this review.

## Key files

| File | Purpose |
|---|---|
| `services/sanitize.js` | Defines and exports `removeScriptTags(input)` — the only function in this module. |

## Optimization opportunities

- **What**: Delete the dead `const SanitizeService = module.exports;` reference on line 1.
  - **Why**: `module.exports` is immediately overwritten by `module.exports.removeScriptTags = ...`, making the `SanitizeService` variable a no-op. It adds noise and may confuse readers expecting a class-style export.
  - **When**: Now (trivial one-line cleanup).
  - **Where**: `services/sanitize.js:1`

- **What**: Replace the regex-only `<script>` tag stripper with a proper encoding approach using `express-validator`'s `.escape()` or the already-installed `he` package (`he.encode(input)`) for any user-supplied text that is rendered in a browser.
  - **Why**: The current regex only removes `<script>...</script>` pairs. It is bypassed trivially by dozens of XSS vectors: inline event handlers (`<img onerror="...">`), `javascript:` URIs, CSS injection, partial/malformed tags, and case variations the regex may miss. The `he` package (already in `package.json`) encodes all HTML special characters into safe entities; `express-validator`'s `.escape()` (already used in `validations/user.js`) does the same at the validation layer.
  - **When**: Now — the current function gives a false sense of security if it is ever wired in.
  - **Where**: `services/sanitize.js:2–8`

- **What**: Wire the sanitization helper (or its replacement) into the request lifecycle — either as an Express middleware applied globally or as field-level `.escape()` calls added to the `express-validator` chains for all free-text quote and proposal inputs.
  - **Why**: The module currently has no effect on runtime behaviour. If XSS protection is a product requirement, it must actually be called. Free-text fields in `motor-quote-request`, `motor-proposal`, and `customer-lead` are the highest-risk entry points since their values are persisted to the database and may later be displayed in a partner portal or admin UI.
  - **When**: Next quarter — coordinate with the team to identify which fields reach a browser before applying blindly.
  - **Where**: `middlewares/`, `controllers/motor-quote-request.js`, `controllers/motor-proposal.js`, `controllers/customer-lead.js`

- **What**: Add unit tests for `removeScriptTags` (or its replacement).
  - **Why**: There are zero tests for this module. A test takes five minutes to write and would immediately expose the regex's blind spots (event-handler injection, `javascript:` URIs, etc.), which is exactly the kind of security gap a test suite should catch.
  - **When**: Next quarter (alongside the fix above).
  - **Where**: New file `tests/services/sanitize.spec.js`

## Open questions

- Is XSS protection an active product requirement, or is the assumption that API consumers (partner apps) handle output encoding on their side? The answer determines whether the wiring work in the third optimization above should be prioritized.
- Are there any rendered views (`views/` EJS templates) that display raw user-submitted strings? If so, they should escape output at the template level regardless of what the service layer does.
- Should `helmet.js` (sets `Content-Security-Policy` and other security response headers) be added to `app.js` as a defence-in-depth measure? No such package is currently installed.
