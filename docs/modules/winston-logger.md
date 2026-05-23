# Winston Logger

## What this module does

`winston.js` is the single, shared logging instance for the entire application. It creates a Winston logger (a popular Node.js logging library) and exports it so every other module — controllers, services, error handlers — can write structured log entries without configuring their own logger. The logger writes to three destinations: the terminal (console), an info-level file under `logs/combined/`, and an error-level file under `logs/error/`. In production it is also intended to ship logs to a remote HTTP endpoint, though a bug currently prevents this from working (see Optimization opportunities).

## Why this module exists

Centralising log configuration in one file means every part of the application uses the same format, the same log levels, and the same output destinations. Without it, developers would configure Winston (or different libraries) independently in each file, producing inconsistent log output that is hard to search or aggregate. The file is also the right place to swap in a log aggregator (e.g. Datadog, Logtail) for the whole application by changing one transport, not dozens of files.

## When this module runs / is used

`winston.js` is `require()`-d at application startup. Node.js evaluates and caches it the first time any file calls `require('./winston.js')`; after that every caller gets the same cached logger instance. In practice this happens before the first HTTP request is served. Callers that use it:

- `app.js` — logs 404 and unhandled errors via the global error handlers.
- `controllers/index.js` — imported, but all logger calls inside are commented out.
- `services/common.js` — logs errors in the shared service helper.
- `services/insurers/digit/digit.mapper.js` — imports `{ log }` directly from the `winston` package (not from this module — see Open questions).

## How it fits in

- **Depends on**: `winston` (npm), `winston-daily-rotate-file` (npm, installed but unused — see Optimization opportunities), `moment` (npm).
- **Used by**: `app.js`, `controllers/index.js`, `services/common.js`. Any future module that needs structured logging should import this module, not configure its own logger.

## Key files

| File | Role |
|---|---|
| `winston.js` | The entire module — configures formats, transport options, and exports the `logger` singleton. |
| `entrypoint.sh` | Pre-creates `logs/combined`, `logs/error`, and all `logs/services/*` subdirectories before the app starts, so Winston can write files immediately without failing on missing dirs. |

## Optimization opportunities

### 1. HTTP transport is silently discarded in production
- **What**: Line 83 calls `new transports.Http(options.httpError)` but never assigns the result to a variable or pushes it into `transportsList`. The object is created and immediately garbage-collected.
- **Why**: Production logs never reach the remote HTTP endpoint (`LOG_HOST`/`LOG_PORT`/`LOG_PATH`). Errors that reach production are invisible unless someone reads the on-disk log files directly — a serious observability gap.
- **When**: Now
- **Where**: `winston.js` lines 82–84. Fix: `transportsList.push(new transports.Http(options.httpError))` inside the `if (currentEnv == 'production')` block.

### 2. `logTime` is frozen at server-start time
- **What**: `const logTime = moment()` is evaluated once when the module is first `require()`-d. Every subsequent log entry prints the same timestamp — the moment the server booted, not the moment the log was written.
- **Why**: Log timestamps are wrong for every entry except the very first one, making it impossible to correlate log lines with events by time.
- **When**: Now
- **Where**: `winston.js` line 12 and line 34. Fix: move the `moment()` call inside the `printf` callback so it is evaluated at log-call time: `` `logTime: ${moment()}` ``.

### 3. `winston-daily-rotate-file` is installed but never used
- **What**: The package `winston-daily-rotate-file` is listed as a dependency in `package.json` (line 66) and the `options.info` object contains a `datePattern` field, but the transport constructed is `new transports.File()` — the built-in Winston file transport — which ignores `datePattern` entirely. Log files never rotate; they grow until the disk fills.
- **Why**: The intent (daily rotation with a max of 10 files) is clear from the options, but the wrong transport is used. Without rotation, a long-running server accumulates unbounded log files.
- **When**: Now
- **Where**: `winston.js` lines 78–79. Fix: `require('winston-daily-rotate-file')` at the top and use `new transports.DailyRotateFile(options.info)` and `new transports.DailyRotateFile(options.error)`.

### 4. `customLog` format produces unparseable strings
- **What**: The `printf` callback returns a template literal that looks like JSON but is not valid JSON: object keys are unquoted, string values use a mix of single and double quotes, and the `meta` field is interpolated with `${meta}` which stringifies an object as `[object Object]`.
- **Why**: Log files cannot be parsed programmatically (e.g. with `jq` or a log aggregator) because the output is neither valid JSON nor a consistent plain-text format. The `meta` field always shows `[object Object]`, hiding structured metadata that controllers carefully construct (the `url`, `function`, `operation`, `relativeDetail`, `errorObj` fields).
- **When**: Next quarter
- **Where**: `winston.js` lines 30–35. Fix: replace with `format.json()` (built-in) or a `printf` that calls `JSON.stringify({ level, message, ...meta })`.

### 5. Month is 0-indexed in log filenames
- **What**: `date.getMonth()` returns 0 for January, 11 for December. The filenames generated are `combined-1-0-2026.log` for January 2026 instead of `combined-1-1-2026.log`.
- **Why**: Misleading filenames make it harder to find logs for a given calendar month — a minor but persistent operational annoyance.
- **When**: Nice to have (moot once daily-rotate-file is used and filenames are derived from `datePattern`)
- **Where**: `winston.js` line 39. Fix: `date.getMonth() + 1` or switch to `moment().format('D-M-YYYY')`.

### 6. Commented-out code should be removed
- **What**: Roughly half of the file is commented-out code: an old timestamp constant, an old `printf` implementation, and all logger calls in `controllers/index.js`.
- **Why**: Commented-out code adds noise, obscures intent, and is already tracked in git history if ever needed again.
- **When**: Nice to have
- **Where**: `winston.js` lines 9–11, 15–29, 31, 87, 90; `controllers/index.js` lines 86–95, 123, 162.

## Open questions

1. `services/insurers/digit/digit.mapper.js` imports `{ log }` directly from the `winston` package (`require('winston')`), not from this module's exported logger. Is this intentional, or should it also use the shared `winston.js` logger so its output goes through the same transports and format?
2. `logs/services/*` directories are pre-created by `entrypoint.sh` for many services (levin, axis, airtel, ICICi, etc.) that have no corresponding transport configured in `winston.js`. Are these directories used by a different logging mechanism, or are they left over from a previous version of the app?
3. The HTTP transport options include `ssl` but the Winston HTTP transport option for SSL is `tls`, not `ssl`. Was this ever tested in production?
