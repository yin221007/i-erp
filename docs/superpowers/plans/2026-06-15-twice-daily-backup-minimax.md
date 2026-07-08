# Twice-Daily Backup And MiniMax Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run automatic backups at 06:30 and 18:30 Beijing time with six daily generations retained, and add secure system-wide MiniMax support beside DeepSeek.

**Architecture:** Replace the scheduler's single date marker with a local-date and slot marker while retaining the existing backup lock and capacity controls. Refactor the DeepSeek-only AI gateway into a fixed provider registry that resolves provider-specific encrypted secrets and normalizes OpenAI-compatible streaming responses for DeepSeek and MiniMax.

**Tech Stack:** Bash, Docker Compose, Node.js 20, Express, MariaDB, React, TypeScript, Node test runner, Supertest, Vite.

---

## File Structure

- `scripts/backup-scheduler.sh`: Select the latest due Beijing-time backup slot and prevent duplicate slot execution.
- `scripts/apply-backup-retention.js`: Apply the six-daily retention policy.
- `docker-compose.yml`, `.env.example`: Provide the two configured schedule slots and MiniMax environment fallback.
- `server/services/ai-providers.js`: Define the fixed provider registry, official hosts, request payloads, and streaming delta normalization.
- `server/services/ai-gateway.js`: Route each model through its provider while preserving common limits, usage accounting, and SSE output.
- `server/routes/ai.js`: Manage provider-specific settings and encrypted keys.
- `server/services/ai-models.js`, `server/migrations.js`: Permit the supported providers and seed `MiniMax-M3`.
- `server/config.js`, `server/app.js`: Load provider configuration and wire it into the router.
- `components/SystemSettings.tsx`, `types.ts`: Display provider-specific settings and allow MiniMax model records.
- `tests/**`: Cover scheduling, retention, migrations, provider routing, settings authorization, and frontend behavior.

### Task 1: Twice-Daily Scheduler

**Files:**
- Modify: `tests/scripts/backup-scheduler.test.js`
- Modify: `scripts/backup-scheduler.sh`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Write failing scheduler structure and execution tests**

Add assertions that the scheduler accepts:

```text
BACKUP_SCHEDULE_MORNING=06:30
BACKUP_SCHEDULE_EVENING=18:30
```

and records markers in this form:

```text
2026-06-15|morning
2026-06-15|evening
```

Use fake `date`, `sleep`, and `backup.sh` commands to verify:

```text
06:29 -> no backup
06:30 -> morning once
12:00 after morning marker -> no duplicate
18:30 after morning marker -> evening once
container restart after evening marker -> no duplicate
next day 07:00 -> morning once, without replaying prior days
```

- [ ] **Step 2: Run scheduler tests and verify failure**

Run:

```bash
node --test tests/scripts/backup-scheduler.test.js
```

Expected: FAIL because the script supports only one hour/minute pair and one date marker.

- [ ] **Step 3: Implement slot parsing and selection**

In `scripts/backup-scheduler.sh`:

```bash
BACKUP_SCHEDULE_MORNING="${BACKUP_SCHEDULE_MORNING:-06:30}"
BACKUP_SCHEDULE_EVENING="${BACKUP_SCHEDULE_EVENING:-18:30}"
marker_file="${BACKUP_ROOT:?BACKUP_ROOT is required}/.last-daily-backup-slot"
```

Validate each slot with `HH:MM`, convert it to minutes, choose only the latest
slot due on the current `Asia/Shanghai` date, and atomically write
`<date>|<slot-name>` after a successful backup.

- [ ] **Step 4: Update Compose defaults**

Replace the single schedule variables with:

```yaml
BACKUP_SCHEDULE_MORNING: "${BACKUP_SCHEDULE_MORNING:-06:30}"
BACKUP_SCHEDULE_EVENING: "${BACKUP_SCHEDULE_EVENING:-18:30}"
TZ: Asia/Shanghai
```

and mirror those defaults in `.env.example`.

- [ ] **Step 5: Run scheduler tests**

Run:

```bash
node --test tests/scripts/backup-scheduler.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/backup-scheduler.sh docker-compose.yml .env.example tests/scripts/backup-scheduler.test.js
git commit -m "feat: run automatic backups twice daily"
```

### Task 2: Six-Generation Daily Retention

**Files:**
- Modify: `scripts/apply-backup-retention.js`
- Modify: `tests/unit/backup-retention.test.js`
- Modify: `components/SystemSettings.tsx`
- Modify: `tests/frontend/api-client.test.js`

- [ ] **Step 1: Write failing policy tests**

Add a retention case containing seven successful daily backups and assert that
the oldest unlocked daily generation is deleted while three upgrade and three
manual generations remain.

Add frontend source assertions for:

```text
每天 2 次
每日 6 份
升级 3 份
手动 3 份
06:30
18:30
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/unit/backup-retention.test.js tests/frontend/api-client.test.js
```

Expected: FAIL because retention is seven and the UI displays the old policy.

- [ ] **Step 3: Implement the policy**

Change `dailyRetention` in `scripts/apply-backup-retention.js` from `7` to `6`.
Update the backup-center policy copy without changing upgrade, manual,
pre-restore, locked-backup, or 500 GB behavior.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/unit/backup-retention.test.js tests/frontend/api-client.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/apply-backup-retention.js components/SystemSettings.tsx tests/unit/backup-retention.test.js tests/frontend/api-client.test.js
git commit -m "feat: retain six automatic backups"
```

### Task 3: Fixed AI Provider Registry

**Files:**
- Create: `server/services/ai-providers.js`
- Create: `tests/unit/ai-providers.test.js`
- Modify: `server/services/ai-models.js`
- Modify: `tests/api/ai-models.test.js`
- Modify: `types.ts`

- [ ] **Step 1: Write failing provider tests**

Test that:

```js
getAiProvider('deepseek').baseUrl === 'https://api.deepseek.com'
getAiProvider('minimax').baseUrl === 'https://api.minimaxi.com/v1'
getAiProvider('custom') === null
```

Test DeepSeek request adaptation retains `thinking.type` values
`enabled|disabled`, and MiniMax adaptation emits:

```js
{
  max_completion_tokens: 8192,
  thinking: { type: 'adaptive' },
  reasoning_split: true
}
```

Test MiniMax stream normalization reads text from `delta.content` and reasoning
from `delta.reasoning_content` plus `delta.reasoning_details[].text`.

Update model API tests to accept `provider: 'minimax'` and continue rejecting
unknown providers.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/unit/ai-providers.test.js tests/api/ai-models.test.js
```

Expected: FAIL because the registry does not exist and model validation is DeepSeek-only.

- [ ] **Step 3: Implement provider definitions**

Export:

```js
export const AI_PROVIDER_IDS = Object.freeze(['deepseek', 'minimax']);
export function getAiProvider(id) { /* fixed registry lookup */ }
```

Each provider definition supplies `baseUrl`, `secretName`, `buildRequestBody`,
and `extractDelta`. Do not accept a base URL from a model or HTTP request.

- [ ] **Step 4: Permit only registered providers**

Change `normalizeAiModel` to reject providers not in `AI_PROVIDER_IDS`. Change
the TypeScript provider type to:

```ts
provider: 'deepseek' | 'minimax';
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/unit/ai-providers.test.js tests/api/ai-models.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/services/ai-providers.js server/services/ai-models.js types.ts tests/unit/ai-providers.test.js tests/api/ai-models.test.js
git commit -m "refactor: add fixed AI provider registry"
```

### Task 4: Provider-Aware AI Gateway

**Files:**
- Modify: `server/services/ai-gateway.js`
- Modify: `tests/api/ai-chat.test.js`

- [ ] **Step 1: Write failing routing tests**

Create one enabled DeepSeek model and one enabled MiniMax model. Assert:

```text
DeepSeek -> https://api.deepseek.com/chat/completions
MiniMax  -> https://api.minimaxi.com/v1/chat/completions
```

Assert that key resolution receives the selected provider ID, MiniMax uses
`max_completion_tokens`, reasoning events are normalized, usage is stored,
and a missing MiniMax key returns 503 without affecting a subsequent DeepSeek
request.

- [ ] **Step 2: Run chat tests and verify failure**

Run:

```bash
node --test tests/api/ai-chat.test.js
```

Expected: FAIL because the gateway always uses the DeepSeek config and key.

- [ ] **Step 3: Refactor the gateway**

Rename `createDeepSeekGateway` to `createAiGateway`. Load the enabled model
before resolving a key, obtain its provider from `getAiProvider`, resolve the
key with:

```js
await resolveApiKey(model.provider)
```

and build the upstream URL and body only through the provider definition.
Keep common authentication, limits, abort handling, usage recording, SSE
events, and sanitized errors unchanged.

- [ ] **Step 4: Run chat tests**

Run:

```bash
node --test tests/api/ai-chat.test.js
```

Expected: PASS for both providers and all existing timeout/concurrency cases.

- [ ] **Step 5: Commit**

```bash
git add server/services/ai-gateway.js tests/api/ai-chat.test.js
git commit -m "feat: route AI requests by model provider"
```

### Task 5: Provider-Specific Encrypted Settings

**Files:**
- Modify: `server/routes/ai.js`
- Modify: `server/config.js`
- Modify: `server/app.js`
- Modify: `.env.example`
- Modify: `tests/api/ai-settings.test.js`
- Modify: `tests/unit/config.test.js`

- [ ] **Step 1: Write failing settings and config tests**

Change settings endpoints to:

```text
GET    /ai/settings
PUT    /ai/settings/:provider
DELETE /ai/settings/:provider
POST   /ai/settings/:provider/test
```

Assert `GET` returns separate sanitized statuses for `deepseek` and `minimax`,
normal users receive 403, provider IDs outside the registry receive 404,
MiniMax writes only `minimax_api_key`, and neither plaintext key appears in a
response.

Add config assertions for:

```text
MINIMAX_API_KEY
MINIMAX_REQUEST_TIMEOUT_MS
MINIMAX_MAX_CONCURRENT_PER_USER
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/api/ai-settings.test.js tests/unit/config.test.js
```

Expected: FAIL because only a single DeepSeek settings object exists.

- [ ] **Step 3: Implement provider configuration and secret resolution**

Expose `config.ai.providers.deepseek` and `config.ai.providers.minimax`. Resolve
keys in this order:

```text
encrypted database secret
provider environment key
none
```

Validate key length and whitespace without provider-specific key prefixes.
The test endpoint performs a bounded non-streaming request to the provider's
official host and returns only success or a sanitized error.

- [ ] **Step 4: Wire the generic router**

Pass the AI provider config into `createAiRouter`, construct
`createAiGateway`, and remove the DeepSeek-only application guard while keeping
AI routes available even when one provider has no key.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/api/ai-settings.test.js tests/unit/config.test.js tests/api/ai-chat.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/ai.js server/config.js server/app.js .env.example tests/api/ai-settings.test.js tests/unit/config.test.js
git commit -m "feat: manage AI provider keys separately"
```

### Task 6: Seed MiniMax-M3

**Files:**
- Modify: `server/migrations.js`
- Modify: `tests/integration/migrations.test.js`

- [ ] **Step 1: Write failing migration assertions**

Assert the seeded model row contains:

```js
{
  id: 'minimax-m3',
  provider: 'minimax',
  modelId: 'MiniMax-M3',
  displayName: 'MiniMax M3',
  enabled: true,
  reasoning: true,
  contextLimit: 1_000_000
}
```

Also assert repeated migrations do not duplicate or overwrite existing model
configuration.

- [ ] **Step 2: Run migration tests and verify failure**

Run:

```bash
node --test tests/integration/migrations.test.js
```

Expected: FAIL because MiniMax-M3 is not seeded.

- [ ] **Step 3: Add the idempotent seed**

Append `MiniMax-M3` to the existing `INSERT IGNORE` model seed list with a sort
order after the DeepSeek defaults and a conservative output-token limit not
exceeding its context limit.

- [ ] **Step 4: Run migration tests**

Run:

```bash
node --test tests/integration/migrations.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/migrations.js tests/integration/migrations.test.js
git commit -m "feat: seed MiniMax M3 model"
```

### Task 7: System Settings UI

**Files:**
- Modify: `components/SystemSettings.tsx`
- Modify: `tests/frontend/api-client.test.js`
- Modify: `tests/frontend/ai-client.test.js`

- [ ] **Step 1: Write failing frontend assertions**

Assert that the AI tab renders provider cards for:

```text
DeepSeek 官方 API
MiniMax 官方 API
```

and calls provider-scoped save, clear, and connection-test endpoints. Assert
the browser source contains neither official provider API hosts nor
authorization headers.

- [ ] **Step 2: Run frontend tests and verify failure**

Run:

```bash
node --test tests/frontend/api-client.test.js tests/frontend/ai-client.test.js
```

Expected: FAIL because the UI owns only DeepSeek state and endpoints.

- [ ] **Step 3: Implement reusable provider cards**

Represent provider UI state by provider ID:

```ts
type AiProviderId = 'deepseek' | 'minimax';
```

Render two cards from a fixed display configuration. Each card independently
loads configured status, accepts a replacement key, saves, clears, and tests
its connection. Never populate the input with a stored key.

- [ ] **Step 4: Run frontend tests and production type/build checks**

Run:

```bash
node --test tests/frontend/api-client.test.js tests/frontend/ai-client.test.js
npm run build
```

Expected: PASS and a successful Vite production build.

- [ ] **Step 5: Commit**

```bash
git add components/SystemSettings.tsx tests/frontend/api-client.test.js tests/frontend/ai-client.test.js
git commit -m "feat: add MiniMax system settings"
```

### Task 8: Full Verification And Release

**Files:**
- Modify: `.learnings/ERRORS.md`

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: every test passes.

- [ ] **Step 2: Run dependency and release verification**

Run:

```bash
npm audit --omit=dev --registry=https://registry.npmjs.org
npm run build
npm run verify:release
```

Expected: zero runtime vulnerabilities, successful build, successful release verification.

- [ ] **Step 3: Review the final diff**

Run:

```bash
git diff feafacd..HEAD --check
git status --short
```

Inspect authentication, authorization, secret handling, provider host
selection, scheduler time math, marker migration, retention, migration
idempotency, and rollback behavior. Fix any finding with a regression test.

- [ ] **Step 4: Build and qualify immutable Synology images**

Create a new release directory from the current stable release, apply the
committed patch, and build version-tagged frontend, backend, backup, and
maintenance images. Validate Compose configuration and run clone migration,
health, model-list, backup-manifest, and restore-drill checks.

- [ ] **Step 5: Create and verify the upgrade backup**

Run the versioned upgrade backup and verify its SHA-256 manifest before
changing production containers.

- [ ] **Step 6: Deploy with automatic rollback**

Recreate only the required services using the new immutable tags. Wait for
backend and frontend readiness through the Lucky public URL. If any check
fails, recreate the previous release services and verify readiness.

- [ ] **Step 7: Verify production behavior**

Confirm:

```text
existing admin and ordinary-user login still work
all existing business table counts are unchanged
all backup cards remain selectable
backup policy displays 06:30, 18:30, and six daily generations
AI settings display DeepSeek and MiniMax independently
MiniMax-M3 appears in the enabled model list
DeepSeek remains usable when MiniMax has no key
```

- [ ] **Step 8: Reinstall the maintenance executor for the final release**

Run the versioned installer so the root-owned maintenance wrapper points to
the final release, then execute one no-op queue poll and inspect the
`ierp-maintenance` syslog entry.

- [ ] **Step 9: Commit release documentation or learning updates**

```bash
git add .learnings/ERRORS.md
git commit -m "docs: record backup and MiniMax release verification"
```

Skip this commit when the learning log has no changes.
