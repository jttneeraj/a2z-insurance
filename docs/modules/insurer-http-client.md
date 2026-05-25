# Insurer HTTP Client

## What this module does
This module is the single outbound HTTP layer for all real insurer API calls in the application. It exposes one function — `postJson` — that sends a JSON POST request to an HTTPS endpoint and returns a normalized result object containing a success flag, HTTP status code, response headers, and a parsed body.

## Why this module exists
Centralising all outbound insurer calls into one place ensures every HTTP interaction goes through a consistent request-building path (content-type header, JSON serialisation, response buffering, JSON-parse attempt). Having a single function also makes it easy to add cross-cutting behaviour — timeouts, retries, logging — without changing each insurer adapter separately.

## When this module runs / is used
`postJson` is called every time the application communicates with a real insurer over the network:
- During **authentication** — `digit.auth.service.js` calls it to exchange credentials for an access token before each Digit API flow.
- During **every Digit API operation** — `digit.executor.service.js` calls it to dispatch quote, proposal, KYC, payment, and policy requests to the Digit executor endpoint.
- Directly from `digit.quote.service.js` and `digit.proposal.service.js` for any additional calls those services make outside the executor pattern.

The mock adapter does **not** use this module — mock services return hard-coded data and never hit the network.

## How it fits in
| Dependency | Direction | Notes |
|---|---|---|
| Node.js built-in `https` | depends on | No third-party HTTP library is used |
| `digit.auth.service.js` | depended on by | Token generation POST |
| `digit.executor.service.js` | depended on by | All Digit insurer API calls |
| `digit.quote.service.js` | depended on by | Quote-specific calls |
| `digit.proposal.service.js` | depended on by | Proposal-specific calls |

## Key files
| File | Purpose |
|---|---|
| `services/insurers/common/insurer-http-client.js` | The entire module — exports the single `postJson(url, payload, headers)` function |

## Optimization opportunities

- **What**: Remove the three `console.log` statements (lines 5–7 and 43) that print the full URL, headers, and payload on every call.
  **Why**: Security — these logs expose the `Authorization: Bearer <token>` header and the complete request body (including credentials) to stdout in every environment, including production. The token is printed in plain text.
  **When**: Now
  **Where**: `services/insurers/common/insurer-http-client.js`, lines 5–7, 43

- **What**: Add a configurable request timeout (e.g. via an `options` parameter or an environment variable such as `INSURER_HTTP_TIMEOUT_MS`).
  **Why**: Reliability — without a timeout the `https.request` call will hang indefinitely if the insurer's server stops responding, eventually exhausting Node's event loop and blocking all in-flight quote/payment requests.
  **When**: Now
  **Where**: `services/insurers/common/insurer-http-client.js`, around line 14 (`options` object)

- **What**: Replace the bare `console.log` on the catch path (line 43) with the Winston logger used everywhere else in the application.
  **Why**: Maintainability and observability — error events from this module will be invisible to the daily-rotated file transports and the production HTTP transport unless they go through Winston.
  **When**: Next quarter
  **Where**: `services/insurers/common/insurer-http-client.js`, line 43

- **What**: Remove the hardcoded `"content-type": "application/json"` from the `options.headers` object (line 19) since the spread `...headers` on line 21 will overwrite it anyway when callers pass their own content-type.
  **Why**: Readability — the duplicate key is confusing; readers may not notice that the spread takes precedence and may incorrectly assume the hardcoded value is the effective one.
  **When**: Nice to have
  **Where**: `services/insurers/common/insurer-http-client.js`, line 19

- **What**: Add a `getJson` (or generic `request`) export alongside `postJson` to support HTTP GET calls.
  **Why**: Extensibility — future insurer integrations may require GET endpoints; adding a companion function now avoids each adapter having to re-implement the same buffering and error-handling logic.
  **When**: Nice to have
  **Where**: `services/insurers/common/insurer-http-client.js`

## Open questions
- Is there an intentional decision to always re-fetch a fresh access token on every Digit call (done in `digit.executor.service.js` before calling `postJson`), or is token caching planned? The HTTP client itself is stateless, but the calling pattern affects how often this module hits the Digit auth endpoint under load.
- Should retry logic (e.g. one automatic retry on a network error or 5xx) live here in the shared client, or in each individual adapter? The current architecture leaves callers to handle retries themselves, but none currently do.
