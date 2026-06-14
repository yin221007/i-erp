# Twice-Daily Backup And MiniMax Integration Design

**Date:** 2026-06-15

**Status:** Approved

## Goals

- Run automatic backups at 06:30 and 18:30 Beijing time every day.
- Retain the latest six automatic backups, three upgrade backups, and three
  manual backups under the existing 500 GB global cap.
- Add the official China-region MiniMax API to the AI center.
- Preserve the existing DeepSeek integration, accounts, passwords, data,
  permissions, and rollback guarantees.
- Allow administrators to add future DeepSeek and MiniMax model IDs without
  rebuilding the application.

## Backup Scheduling

The backup scheduler uses the `Asia/Shanghai` calendar and two explicit daily
slots:

```text
06:30
18:30
```

The scheduler records completion per local date and slot instead of recording
only the date. A container restart cannot create a duplicate backup for an
already completed slot, and a completed morning backup does not suppress the
evening backup.

If the scheduler starts after a slot but before the next slot, it may run the
latest missed slot once. It does not create a backlog of backups for earlier
days. Backup creation remains protected by the existing single-job lock,
free-space checks, checksum generation, incomplete-generation cleanup, and
500 GB cap.

## Backup Retention

Successful unlocked backups are retained by kind:

```text
daily:   6
upgrade: 3
manual:  3
```

`pre-restore` snapshots and locked generations retain their existing safety
rules. Every backup kind still counts toward the 500 GB global limit. When the
limit is approached, the existing deletion policy removes only eligible
unlocked generations and never removes live business data.

The administrator backup center displays the new twice-daily schedule and
retention counts.

## AI Provider Architecture

The AI gateway uses a fixed provider registry instead of a DeepSeek-only
branch. Each provider definition contains:

- Provider ID.
- Official base URL.
- Secret name.
- Request adaptation rules.
- Response and reasoning extraction rules.

The initial registry contains:

```text
deepseek -> https://api.deepseek.com
minimax  -> https://api.minimaxi.com/v1
```

Administrators cannot enter an arbitrary provider URL. This keeps API keys
away from untrusted hosts and prevents server-side request forgery.

## Secrets And Settings

DeepSeek and MiniMax API keys are stored separately through the existing
encrypted system-secret service:

```text
deepseek_api_key
minimax_api_key
```

The system settings AI tab shows a separate masked input, configured status,
save action, and connection test for each provider. API responses never return
the stored key, and logs never contain complete keys or authorization headers.

An environment-provided key remains supported for operational recovery. An
environment key takes precedence over a database-stored key for its provider.

## Models

The model provider type becomes:

```text
deepseek | minimax
```

The migration seeds `MiniMax-M3` as an enabled MiniMax model without changing
existing DeepSeek model rows. Model IDs remain database records with display
name, reasoning support, context limit, output-token limit, enabled state, and
sort order.

Administrators may add future official MiniMax or DeepSeek model IDs through
the existing model management interface. No application rebuild is required.
Unknown provider IDs remain rejected.

## Request And Response Flow

1. The authenticated user selects an enabled model in the AI center.
2. The backend loads the model record and provider definition.
3. The backend resolves the provider-specific key without exposing it.
4. The backend sends an OpenAI-compatible Chat Completions request to the
   fixed official provider URL.
5. Streaming text and usage data are normalized to the existing frontend
   protocol.
6. Provider-specific reasoning fields are normalized without storing hidden
   reasoning content in logs.

MiniMax uses its official OpenAI-compatible endpoint. `MiniMax-M3` requests
use `max_completion_tokens`; when reasoning is requested they enable adaptive
thinking and split reasoning fields. Existing DeepSeek request behavior
remains unchanged.

## Error Handling

- A missing key disables calls for only that provider.
- Provider authentication, quota, timeout, malformed response, and upstream
  errors are returned as sanitized application errors.
- One provider failing does not disable models from the other provider.
- The connection test uses a bounded request and does not save a key unless
  the administrator explicitly saves it.
- Existing authentication, AI permission, concurrency, timeout, input-size,
  and usage-recording controls apply to both providers.

## Deployment And Rollback

The release is built as immutable frontend, backend, backup, and maintenance
images. Before production deployment:

1. Run unit, API, component, script, and release verification tests.
2. Run dependency audit and production build.
3. Create and verify an upgrade backup.
4. Qualify database migration and application startup against the clone.
5. Deploy with the previous release directory and images retained.

If readiness or smoke checks fail, the deployment switches back to the
previous release. The migration is additive and does not alter existing user,
business, or secret rows, so the prior release remains usable.

## Verification

Automated coverage includes:

- Morning and evening slot execution in `Asia/Shanghai`.
- No duplicate execution after scheduler restart.
- Latest missed slot behavior without multi-day backlog.
- Six-daily, three-upgrade, and three-manual retention.
- Existing lock, capacity, and incomplete-backup protections.
- MiniMax provider validation and fixed-host enforcement.
- Separate encrypted MiniMax secret save and configured status.
- Provider-specific connection testing.
- DeepSeek and MiniMax model routing.
- `MiniMax-M3` request parameter and streaming response normalization.
- Missing-key and upstream-error isolation.
- Existing DeepSeek behavior and permissions.

Production verification confirms public readiness, the two displayed backup
times, the retention policy, the MiniMax settings entry, and model-list
availability. A real MiniMax request is tested only after the administrator
provides a valid MiniMax API key.
