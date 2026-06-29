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

## 3. SSH / Remote — EXPOSED (store + test only) ⚠️  ·  keypair-generation = GAP

Stores SSH connection definitions; private key encrypted in project secrets
(`TERMINAL_SSH_PRIVATE_KEY_<connectionId>`); tests reachability via a real
`ssh -o BatchMode=yes … 'echo vibecore-ssh-connected'`. State key `VIBECORE_TERMINAL_STATE`.

- **IDE proxy:** `POST /api/projects/:projectId/ide-panel/terminal`
- **Intents:** `add-ssh { name, host, port, username, privateKey? }`,
  `delete-ssh { connectionId }`, `connect-ssh { connectionId }`, `disconnect-ssh { connectionId }`.
- **Connection shape:**
  ```json
  { "id": "uuid", "name": "", "host": "", "port": 22, "username": "",
    "status": "connected|connecting|disconnected", "createdAt": "ISO",
    "updatedAt": "ISO?", "lastCheckedAt": "ISO?", "lastError": "?" }
  ```
- **GAP-SSH (keygen):** there is **no** server-side key-pair generation today (key is
  user-supplied). Proposed addition — frozen contract for the IDE:
  - `POST …/ide-panel/terminal` intent `generate-keypair` `{ name, type?: "ed25519"|"rsa", comment? }`
  - Response: `{ connectionId?, publicKey: "ssh-ed25519 AAAA… comment", fingerprint: "SHA256:…", createdAt: "ISO" }`
  - Private key stored encrypted (never returned after creation); public key + fingerprint displayed.

---

## 4. Object Storage (GCS) — IMPLEMENTED ✅ (flag-gated; live-enable pending)

Real `@google-cloud/storage` backend, bucket-per-project, V4 signed URLs, lifecycle.
Shipped on branch `feat/object-storage-gcs` @`2ded58b3` (`services/api/src/object-storage.ts`
+ routes in `app.ts`; 21 unit tests). **Dormant** until `OBJECT_STORAGE_ENABLED=true`
(every route 404s while off). Auth = api pod Workload Identity (ADC). Live-enable still
needs: deploy the api image + WI binding on the api KSA (see report).

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

## 5. Skills registry — GAP ❌ (does not exist; build-spec frozen for IDE)

No skills backend, package, or UI exists today. Frozen contract:

- **IDE proxy:** `GET/POST /api/projects/:projectId/ide-panel/skills`
- **Proposed internal API** (DB-backed, per project/agent):
  | method | route | body | response |
  |---|---|---|---|
  | GET | `/projects/:id/skills` | — | `{ skills: [Skill] }` |
  | POST | `/projects/:id/skills/:skillId/enable` | `{}` | `{ skill: Skill }` |
  | POST | `/projects/:id/skills/:skillId/disable` | `{}` | `{ skill: Skill }` |
- **Skill shape:**
  ```json
  { "id": "", "name": "", "description": "", "category": "", "enabled": false,
    "source": "builtin|custom", "updatedAt": "ISO" }
  ```
- Backed by a `ProjectSkill` table (projectId, skillId, enabled, updatedAt) seeded from a
  static builtin catalog.

---

## Status summary

| # | Capability | Status | Proof / gap |
|---|---|---|---|
| 0 | SQL read/write | EXPOSED ✅ | live RW proof 2026-06-29; api@a0a34eb6 |
| 1 | Workflows | EXPOSED ✅ | real exec via runtime; logs per-run (no SSE) |
| 2 | Security scanner | EXPOSED ✅ | npm audit + secret/SAST grep in workspace |
| 3 | SSH store/test | EXPOSED ⚠️ | real ssh test; **keygen = GAP-SSH** |
| 4 | Object Storage GCS | IMPLEMENTED ✅ | real GCS backend `feat/object-storage-gcs@2ded58b3`, flag-gated; live-enable = deploy + api-KSA WI binding |
| 5 | Skills registry | GAP ❌ | spec frozen; needs `ProjectSkill` table + catalog |
