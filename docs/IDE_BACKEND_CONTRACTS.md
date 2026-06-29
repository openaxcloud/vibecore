# IDE Backend Contracts (hand-off to the IDE session)

> Audit date: 2026-06-29. Source of truth verified against live prod + code at
> `680529bc`. "EXPOSED" = a real backend endpoint exists today. "GAP" = not yet
> implemented; spec is provided so the IDE session can build UI against a frozen
> contract while the backend lands.
>
> Two layers per panel:
> - **IDE proxy** (what the IDE actually calls): Remix route
>   `POST /api/projects/:projectId/ide-panel/:panel` — form-encoded body with an
>   `intent` field. Returns JSON. File:
>   `app/routes/api.projects.$projectId.ide-panel.$panel.ts`.
> - **Internal API** (source of truth): `services/api/src/app.ts`.

---

## 0. SQL Read/Write runner — EXPOSED ✅ (live-proven)

Replit-parity SQL pane: full read **and** write (SELECT + INSERT/UPDATE/DELETE + DDL),
wrapped in a single `BEGIN…COMMIT` (ROLLBACK on any error).

- **IDE proxy:** `POST /api/projects/:projectId/ide-panel/database`
  - Request (form): `{ intent: "query", connectionKey: string, query: string }`
  - `connectionKey` = the project env/secret key holding the DB URL (e.g. `DATABASE_URL`).
- **Internal API:** `POST /projects/:projectId/databases/query`
  (`services/api/src/app.ts` `runDatabaseQuery()`), guarded by `requireProject(…, 'projects:write')`.
- **Response:**
  ```json
  { "result": { "columns": ["id","note"], "rows": [{"id":1,"note":"x"}], "rowCount": 1 } }
  ```
  BigInts serialized as strings. Errors → `{ "error": "<pg message>" }`.
- **Proof:** api image deployed at `a0a34eb6`. Live project Postgres
  `db-cmqunmv1b…` verified read/write (CREATE/INSERT/UPDATE/DELETE/DROP in one txn,
  `RW_PROOF_OK`) on 2026-06-29.

---

## 1. Workflows runner — EXPOSED ✅ (frontend-orchestrated, real execution)

Define / launch / observe workflows; logs are captured per run. Execution dispatches
real shell commands into the workspace via
`POST /api/runtime/workspaces/:workspaceId/commands`. State persisted as the project
env key `VIBECORE_WORKFLOWS_STATE`.

- **IDE proxy:** `POST /api/projects/:projectId/ide-panel/workflows`
- **Intents & requests:**
  | intent | body |
  |---|---|
  | `create-workflow` | `{ name, executionMode: "sequential"|"parallel", isRunButton?, isGenerated?, command? }` |
  | `update-workflow` | `{ workflowId, name?, executionMode?, enabled? }` |
  | `delete-workflow` | `{ workflowId }` |
  | `add-task` | `{ workflowId, taskType: "shell"|"packages"|"workflow", command, targetWorkflowId? }` |
  | `update-task` | `{ workflowId, taskId, taskType?, command?, targetWorkflowId? }` |
  | `delete-task` | `{ workflowId, taskId }` |
  | `move-task` | `{ workflowId, taskId, direction: "up"|"down" }` |
  | `run-workflow` | `{ workflowId }` |
- **Workflow shape:**
  ```json
  { "id": 0, "projectId": null, "name": "", "executionMode": "sequential",
    "isRunButton": false, "isGenerated": false, "isSystem": false, "enabled": true,
    "createdAt": "ISO", "updatedAt": "ISO", "lastRunAt": "ISO?", "lastRunStatus": "?",
    "tasks": [{ "id": 0, "orderIndex": 0, "taskType": "shell", "command": "", "targetWorkflowId": null }] }
  ```
- **Run shape (logs streamed inline as an array):**
  ```json
  { "id": "uuid", "workflowId": 0, "workflowName": "", "status": "running|skipped|failed|succeeded",
    "startedAt": "ISO", "finishedAt": "ISO?",
    "logs": [{ "level": "info|error", "message": "", "timestamp": "ISO" }] }
  ```
  `runs` retains the last 25.
- **Note for IDE:** logs are returned with the run object (poll the run), not a long-lived
  SSE stream. If true server-push streaming is needed, that is a backend enhancement (GAP-S1).

---

## 2. Security scanner — EXPOSED ✅ (real scans via workspace runtime)

Runs `npm audit --json` (SCA), grep-based secret detection, and grep-based SAST inside
the workspace. State persisted as project env key `VIBECORE_SECURITY_STATE`.

- **IDE proxy:** `POST /api/projects/:projectId/ide-panel/security`
- **Intents:**
  | intent | body |
  |---|---|
  | `scan` | `{}` (runs an immediate scan) |
  | `settings` | `{ scheduleEnabled, scheduleFrequency: "daily"|"weekly", privacyDetectionEnabled, dependencyAuditEnabled, secretScanEnabled, sastEnabled, scannerProfile: "workspace-runtime"|"sca"|"secrets"|"sast", githubSecuritySyncEnabled }` |
  | `hide-vulnerability` / `unhide-vulnerability` | `{ vulnerabilityId }` |
- **Scan record:**
  ```json
  { "id": "uuid", "scanType": "full", "scanner": "<profile>", "status": "completed|failed",
    "startedAt": "ISO", "completedAt": "ISO", "summary": "N finding(s)", "exitCode": 0,
    "counts": { "critical":0,"high":0,"moderate":0,"low":0,"info":0 },
    "sources": { "npm-audit": true, "sast": true, "secrets": true } }
  ```
- **Vulnerability:**
  ```json
  { "id": "npm:…|sast:…", "packageName": "", "title": "", "severity": "critical|high|moderate|low|info",
    "status": "open|fixed|ignored", "hidden": false, "source": "npm-audit|sast|secrets|workspace-runtime",
    "details": "", "recommendation": "?", "createdAt": "ISO", "updatedAt": "ISO" }
  ```
- Scans retain last 20; scheduled scans auto-fire when due.

---

## 3. SSH / Remote — EXPOSED (store + test + keygen) ✅

Stores SSH connection definitions; private key encrypted in project secrets
(`TERMINAL_SSH_PRIVATE_KEY_<connectionId>`); tests reachability via a real
`ssh -o BatchMode=yes … 'echo vibecore-ssh-connected'`. State key `VIBECORE_TERMINAL_STATE`.

- **IDE proxy:** `POST /api/projects/:projectId/ide-panel/terminal`
- **Intents:** `add-ssh { name, host, port, username, privateKey? }`,
  `delete-ssh { connectionId }`, `connect-ssh { connectionId }`, `disconnect-ssh { connectionId }`,
  `generate-keypair { name?, host?, port?, username?, type?: "ed25519"|"rsa", comment? }`.
- **Connection shape** (keygen adds `publicKey`, `fingerprint`, `keyType`):
  ```json
  { "id": "uuid", "name": "", "host": "", "port": 22, "username": "",
    "status": "connected|connecting|disconnected", "createdAt": "ISO",
    "updatedAt": "ISO?", "lastCheckedAt": "ISO?", "lastError": "?",
    "publicKey": "ssh-ed25519 AAAA… comment", "fingerprint": "SHA256:…", "keyType": "ed25519|rsa" }
  ```
- **`generate-keypair` (IMPLEMENTED):** server mints the pair with `node:crypto` (no external
  dep), defaults to ed25519 (3072-bit for rsa). Private key stored encrypted and **never
  returned again**; only the public key + fingerprint are surfaced (on the connection and in
  the action response). Response: `{ ok, connectionId, publicKey, fingerprint, keyType, createdAt }`.
  ed25519 private key is the native `openssh-key-v1` container; rsa is PKCS#1 PEM — both proven
  to round-trip through stock `ssh-keygen -y/-l` (6 tests incl. real OpenSSH interop).

---

## 4. Object Storage (GCS) — IMPLEMENTED ✅ (flag-gated; live-enable pending)

Real `@google-cloud/storage` backend, bucket-per-project, V4 signed URLs, lifecycle.
Shipped on branch `feat/object-storage-gcs` @`2ded58b3` (`services/api/src/object-storage.ts`
+ routes in `app.ts`; 21 unit tests). **Dormant** until `OBJECT_STORAGE_ENABLED=true`
(every route 404s while off). Auth = api pod Workload Identity (ADC).

**Live-proven 2026-06-29** (real GCS, project `vibecore-495216`): bucket create in `EU`
with uniform bucket-level access + `tmp/` lifecycle rule (age 7), object upload, list
with `/` delimiter (folders), move (copy+delete), download bytes, single delete,
delete-prefix — all green. Unit tests (21) + api typecheck clean.

**Live-enable (needs Avi — prod IAM/security, blocked from automation):**
1. Grant GSA `vibecore-prod-platform@…` `roles/storage.admin` (today it has only
   `secretmanager.secretAccessor`).
2. Give the api pod that identity — pick one:
   - **Path A (WI, matches "no key files"):** annotate KSA `vibecore-vibecore-platform-api`
     with `iam.gke.io/gcp-service-account`, add the `roles/iam.workloadIdentityUser`
     binding, grant the GSA `roles/iam.serviceAccountTokenCreator` **on itself** (V4
     signing via IAM `signBlob`), **and** punch a NetworkPolicy egress hole so api pods
     can reach the metadata server (`169.254.169.254:80`) — it is deliberately denied
     today (`allow-platform-required-egress` excludes `169.254.169.254/32`).
   - **Path B (key Secret, no netpol change):** mount a GSA JSON key as a k8s Secret +
     `GOOGLE_APPLICATION_CREDENTIALS`; signing is local (no metadata, no `signBlob`).
3. Deploy an api image carrying this code and set `OBJECT_STORAGE_ENABLED=true`.

- **Internal API** (all gated; `requireProject` read on GETs, write on mutations):
  | method | route | body / query | response |
  |---|---|---|---|
  | POST | `/projects/:id/object-storage/bucket` | `{}` (ensures the project bucket) | `{ bucket, created, location }` |
  | GET | `/projects/:id/object-storage/objects` | `?prefix=&delimiter=/` | `{ objects: [StoredObject], folders: ["a/"] }` |
  | POST | `/projects/:id/object-storage/objects/upload-url` | `{ key, contentType? }` | `{ url, method:"PUT", headers:{"Content-Type"}, expiresAt }` (V4) |
  | GET | `/projects/:id/object-storage/objects/download-url` | `?key=` | `{ url, expiresAt }` (V4) |
  | POST | `/projects/:id/object-storage/objects/move` | `{ from, to }` | `{ moved:true, key }` |
  | DELETE | `/projects/:id/object-storage/objects` | `{ key }` **xor** `{ prefix }` (folder) | `{ deleted:true, count }` |
- **StoredObject:** `{ key, size, updated:"ISO"|null, contentType:string|null, etag:string|null }`.
- Errors: `{ error, code }` — `INVALID_KEY` (400, traversal/leading-slash guarded),
  `FEATURE_NOT_ENABLED` (404 when flag off).
- Bucket name deterministic `vc-<projectId>`; uniform bucket-level access; lifecycle
  auto-deletes the `tmp/` prefix after `OBJECT_STORAGE_TMP_TTL_DAYS` (default 7);
  signed URLs V4, 15-min TTL.

---

## 5. Skills registry — IMPLEMENTED ✅ (builtin catalog + per-project toggles)

Real, additive backend. The catalog is a static code-owned list
(`services/api/src/skills-catalog.ts`, 10 builtin skills); per-project state is a
sparse `ProjectSkill` override table (migration `0048_project_skills`). The list
endpoint is a pure merge of catalog defaults with the project's overrides. No
feature flag — inert until the IDE calls it (no existing behaviour touched).

- **IDE proxy:** `GET/POST /api/projects/:projectId/ide-panel/skills`
- **Internal API** (`requireProject` read on GET, write on toggles):
  | method | route | body | response |
  |---|---|---|---|
  | GET | `/projects/:id/skills` | — | `{ skills: [Skill] }` (full catalog, resolved) |
  | POST | `/projects/:id/skills/:skillId/enable` | `{}` | `{ skill: Skill }` |
  | POST | `/projects/:id/skills/:skillId/disable` | `{}` | `{ skill: Skill }` |
- **Skill shape:**
  ```json
  { "id": "code-review", "name": "Code Review", "description": "…", "category": "quality",
    "enabled": true, "source": "builtin", "updatedAt": "ISO"|null }
  ```
  `updatedAt` is `null` while the skill sits at its catalog default (no override row).
- Unknown `skillId` → `404 { code: "SKILL_NOT_FOUND" }`. Builtin slugs are stable
  identifiers (never rename once shipped).
- Proof: 6 catalog/resolver unit tests + 5 route tests (list/enable/disable/404/401),
  api production typecheck clean.

---

## Status summary

| # | Capability | Status | Proof / gap |
|---|---|---|---|
| 0 | SQL read/write | EXPOSED ✅ | live RW proof 2026-06-29; api@a0a34eb6 |
| 1 | Workflows | EXPOSED ✅ | real exec via runtime; logs per-run (no SSE) |
| 2 | Security scanner | EXPOSED ✅ | npm audit + secret/SAST grep in workspace |
| 3 | SSH store/test/keygen | EXPOSED ✅ | real ssh test + server keygen (`generate-keypair`); 6 tests incl. OpenSSH interop |
| 4 | Object Storage GCS | IMPLEMENTED ✅ | merged on `main`, flag-gated; GCS mechanism live-proven 2026-06-29; live-enable = GSA storage role + WI/key wiring + flag (see §4) |
| 5 | Skills registry | IMPLEMENTED ✅ | `ProjectSkill` table (`0048`) + builtin catalog; 11 tests; additive/unflagged |
| 6 | Free-tier DB (shared-pg-0) | CODE DONE ✅ | admin-SQL tenant provisioning (role+db+isolation) live-proven vs real Postgres; 22 tests; Helm template gated; activation needs Avi (cluster bootstrap + manager deploy + `DB_SHARED_TENANT_SECRET`) |
| 7 | Hibernation (workspace) | IMPLEMENTED ✅ | GC reconciler: sleep on idle + orphan-RUNNING reconcile + wake-on-reopen (`manager.ts`); needs ws-manager deploy to go live |
| 8 | Deploy publish (P2d) | IMPLEMENTED ✅ | `POST /deployments/:id/publish` promotes a READY preview → linked production deployment (`parentDeploymentId`, `0049`) **and** provisions a separate **production database** (env-scoped `db-<id>-prod` / `proj_<id>_prod`, `DatabaseInstance.environment`, migration `0050`); 35 tests + live dev/prod **DB isolation** proof on real Postgres. `GET/POST /database` accept `environment` → `PROD_DATABASE_URL`. Gated by `DB_ROLLBACK_ENABLED`; prod env dormant until publish |

**P2d dev/prod database split** (`database-provisioner.ts`): every project has a
`development` DB (its workspace DB, un-suffixed = backward compatible) and, once
published, a separate `production` DB (`-prod`/`_prod` suffix, distinct owner
role + HMAC password + REVOKE-CONNECT isolation). Publish provisions the prod DB
best-effort (dormant until `DB_ROLLBACK_ENABLED` + a backing cluster).
`GET /projects/:id/database?environment=production` reconciles the prod URL into
a `PROD_DATABASE_URL` project secret so dev + prod connections coexist in the IDE.
Publish also creates an **editable production workspace checkout**
(`Workspace.environment='production'`, migration `0051`): a separate git working
tree seeded — and refreshed on each publish — with the published source files via
`projectStorage.listFiles → writeFiles` (best-effort, non-fatal; reused, never
duplicated). 10 tests.

---

## 9. Agent self-repair history — IMPLEMENTED ✅ (durable; for the review UI)

Append-only audit log of the AST self-repair pipeline (distinct from the transient
`agent-patch-proposals` queue). Table `AgentRepairEvent` (migration `0051`).
Additive/unflagged — inert until the IDE records/reads it.

- **Internal API** (`requireProject` read on GET, write on POST):
  | method | route | body / query | response |
  |---|---|---|---|
  | GET | `/projects/:id/agent-repair-events` | `?limit=` (1–500, default 100) | `{ events: [RepairEvent] }` (newest first) |
  | POST | `/projects/:id/agent-repair-events` | `{ relativePath, outcome, attempt?, messageId?, artifactId?, actionId?, validationError?, repairError? }` | `{ event: RepairEvent }` |
- **RepairEvent:** `{ id, projectId, relativePath, attempt, outcome:"repaired"|"failed"|"gave_up", validationError?, repairError?, messageId?, artifactId?, actionId?, createdAt }`.
- IDE: the agent's self-repair loop (`app/lib/runtime/action-runner.ts`) POSTs one
  event per repair attempt/outcome; the review UI lists them via GET.

## 10. Admin wallet adjust — IMPLEMENTED ✅ (makes /admin/wallets editable)

- `POST /admin/wallets/:organizationId/adjust` — body `{ deltaCents: int≠0, reason: string }`.
  Positive = credit, negative = debit. Appends an `ADJUSTMENT` CreditLedger entry +
  updates the materialized balance atomically (same path as grants/usage).
- Auth: **platform-admin + recent re-auth** (`requirePlatformAdmin` + `requireRecentAdminReauth`);
  audited as `admin.wallet.adjust`. Response `{ wallet: { organizationId, balanceCents }, entry }`.
  Errors: 400 (zero delta / missing reason), 403 (not platform admin / re-auth stale).

## 11. Agent runtime wiring — VERIFIED ✅ (where each capability is consumed)

All IDE-testable runtime paths are wired backend-side:

| capability | wired at | how |
|---|---|---|
| Secrets/Env → runtime | `app.ts` `/api/runtime/workspaces` → `managerRequest('/workspaces/start', {allowedSecrets,allowedSecretKeys})` → `k8s-client workspacePod` `secretKeyRef` | secrets land in a k8s Secret, mounted as pod env |
| Packages installed | `/api/runtime/workspaces/:id/commands` → agent `/commands/run` | real `npm/pnpm/yarn install` runs in the pod |
| Workflows executed | `ide-panel.$panel.ts runWorkflowTasks` → `/commands` (`sh -lc`) | real commands, logs captured in `VIBECORE_WORKFLOWS_STATE` |
| Skills → agent | `app/lib/.server/llm/project-skills.ts retrieveSkillsForAgentContext` → `api.chat.ts streamText({ system: …skillsContext })` | enabled skills become a `<project_skills>` system-prompt block |
| MCP → agent | `app/lib/.server/mcp/load-config.server.ts` → `api.chat.ts mcpService.toolsWithoutExecute` | installed MCP servers become agent tools per chat request |
