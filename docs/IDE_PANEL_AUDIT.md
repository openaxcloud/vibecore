# IDE Panel Audit

Generated from a live local audit against:

- Web: `http://localhost:5173`
- API: `http://127.0.0.1:3001`
- Command: `PLAYWRIGHT_BASE_URL=http://localhost:5173 SAAS_API_URL=http://127.0.0.1:3001 pnpm run ide:panel-audit`
- Report validator: `pnpm run ide:panel-audit:validate`
- Latest raw report: `tmp/ide-panel-audit.json`

## Summary

The IDE shell, panels, backend loader routes, safe panel actions, critical UI form interactions, and responsive IDE layouts are wired and render in the browser without `Application Error`.

This audit does **not** certify Fortune 500 production readiness. Several panels are real and backend-connected, but still product-partial compared with a mature Cursor-class IDE.

## Live Audit Result

| Area | Result |
| --- | --- |
| Total audited checks | PASS, 81/81 |
| Backend panel GET endpoints | PASS, 18/18 |
| Browser panel render checks | PASS, 24/24 |
| Safe panel actions | PASS or expected quota guard, 12/12 |
| Critical UI interactions | PASS, 14/14 |
| UI backend method evidence | PASS, 14/14 service interactions observed expected backend methods |
| Workspace UI interactions | PASS, 6/6 |
| Responsive viewport audit | PASS, 6/6 |
| Secret reveal guard | PASS |
| Application error overlays | PASS, none detected |
| Browser console/page errors | PASS, fail the audit if any collected page error exists |

## Critical UI Interactions Covered

The live audit opens the browser against a real generated project and performs these actions through the UI:

- Environment: create a variable and verify it appears after backend reload.
- Secrets: create a secret, confirm reveal, and verify the backend returns the value only after explicit confirmation.
- Snapshots: create a manual checkpoint and verify it appears.
- Database: save `DATABASE_URL` and verify it appears in the database panel.
- Packages: add a package to the install plan, save it, and verify the persisted plan appears.
- Settings: update the project name/description and verify the persisted values reload into the form.
- Object Storage: save storage configuration and verify it appears after backend reload.
- Extensions: persist an extension and verify it appears after backend reload.
- Integrations: connect a provider, persist the integration token in project secrets, create a webhook, and verify both appear after backend reload.
- Workflows: create a workflow, run a short shell command through the runtime API, add a shell task, and verify the run/task appear after backend reload.
- Monitoring: switch the metrics window and refresh the backend panel.
- Logs: split and clear the log viewer.
- Collaborators: create a comment, create a share link, and toggle shared AI policy.
- Domains: add a custom domain and verify it appears after backend reload.

For every service-panel UI interaction above, the audit also observes the network calls from the browser and fails if
the expected backend method is missing. Mutating flows require a successful `POST`; read/refresh-only flows require a
successful `GET`.

Collected browser `pageerror` and non-aborted console errors are converted into failing `page_error` report entries, so
the audit cannot pass with hidden client-side exceptions.

## CI Usage

Run the live audit only after both the web app and API are available:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 SAAS_API_URL=http://127.0.0.1:3001 pnpm run ide:panel-audit
pnpm run ide:panel-audit:validate
```

The validator fails if the JSON report has failed checks, missing backend-method evidence, collected browser errors, or
counts that drift from the documented matrix.

This audit is wired into `.github/workflows/e2e.yml` after the local web/API stack is running. The workflow uploads
`tmp/ide-panel-audit.json` with the Playwright artifacts for failure analysis.

The workspace panel audit also performs these browser interactions:

- Editor: save the active document when available, otherwise open the files tool from the editor welcome state.
- Files: create a file through the panel prompt, refresh the tree, and collapse the tree.
- Search: run a search query and verify the empty-results state.
- Locks: filter locked files and verify the empty state.
- Preview: switch to mobile preview and open webview logs.
- Terminal: reset the terminal panel without client errors.

The responsive audit opens the real IDE route across these viewport classes and fails on visible horizontal overflow,
client-side exceptions, missing mobile navigation, or missing panel content:

- Desktop: `1440x900`
- Laptop: `1280x800`
- Tablet landscape: `1024x768`
- Tablet portrait: `820x1180`
- Mobile: `390x844`
- Small mobile: `360x740`

On phone and tablet portrait, the audit drives the mobile tab bar through Chat, Files, Editor, Terminal, Preview and
Deploy. Deploy must render the real backend-connected deployments service panel, not an informational placeholder. The
editor path uses `MobileCodeEditor` instead of Monaco on constrained touch layouts.

## Panel Matrix

| Panel | UI renders | Backend connected | Real action tested | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Editor | PASS | Runtime/store | Workspace save/open-files interaction checked | Complete | Uses responsive editor fallback path where applicable. |
| Files | PASS | Runtime file store | File create, refresh and collapse checked | Complete | File tree renders from runtime/project file state. |
| Search | PASS | Client/workspace files | Search empty-state interaction checked | Partial | Needs deeper search result audit for large repos. |
| Locks | PASS | Runtime/store memory | Filter empty-state interaction checked | Partial | Lock UI exists; enterprise lock enforcement must remain covered by backend/RBAC tests. |
| Preview | PASS | Runtime preview/ports | Device switch and log panel checked | Complete | Preview panel renders; app-specific build validity is still per-project. |
| Terminal | PASS | Workbench terminal/runtime | Reset interaction checked | Complete | Terminal is a first-class panel and no longer topbar-only. |
| Overview | PASS | `/projects/:id/dashboard` | GET checked | Complete | Shows project, workspace, files, branch, activity. |
| Database | PASS | Dashboard/env endpoints | `DATABASE_URL` save checked | Partial | Backend-connected config panel, not a managed SQL console. |
| Object Storage | PASS | Dashboard/env/export endpoints | storage env save checked through API and UI | Partial | Backend-connected config/export panel, not a full S3/R2 browser. |
| Packages | PASS | Dashboard/env endpoint | package plan save checked through API and UI | Partial | Captures install plan; not yet a full dependency install executor UI. |
| Monitoring | PASS | Dashboard endpoint | GET and UI refresh checked | Partial | Shows backend metrics/activity; not full APM/tracing. |
| Extensions | PASS | Dashboard/env endpoint | extension save checked through API and UI | Partial | Stores enabled extensions; marketplace install lifecycle is limited. |
| Integrations | PASS | dashboard/env/secrets/activity endpoints | provider connect + webhook create checked through API and UI | Partial | Real project-scoped persistence for integrations, webhooks, API key metadata and event streams; third-party OAuth handshakes still require provider credentials. |
| Workflows | PASS | dashboard/env/runtime command endpoints | workflow create + runtime run + task add checked through API and UI | Partial | Real project-scoped workflow persistence and runtime command dispatch; complex DAGs, long-running streamed logs and provider-level scheduler controls need deeper tests. |
| Deployments | PASS | `/projects/:id/deployments` | Quota guard checked | Partial | Free audit org hit `deployments.count` quota. Paid/provider production dispatch still requires provider env validation. |
| Env | PASS | `/projects/:id/env-vars` | upsert checked through API and UI | Complete | Real backend persistence. |
| Secrets | PASS | `/projects/:id/secrets` | upsert + reveal guard + confirmed reveal checked | Complete | Reveal requires explicit confirmation; secret value is not exposed by default. |
| Git | PASS | `/projects/:id/git/status` | GET checked | Partial | Status renders; commit/push/pull require repository/provider setup. |
| Activity | PASS | `/projects/:id/activity` | GET checked | Complete | Backend activity feed. |
| Logs | PASS | Dashboard/deployment logs | GET checked | Partial | Runtime/deployment log aggregation exists; not a full structured log explorer. |
| Collaborators | PASS | `/projects/:id/collaboration` | comment, share link and AI sharing checked through API and UI | Complete | Realtime client, comments, share links and terminal permissions are wired. |
| Snapshots | PASS | `/projects/:id/snapshots` | create checked through API and UI | Complete | Restore action exists and is backend-routed. |
| Settings | PASS | `/projects/:id/settings` | update checked through API and UI | Complete | Real backend settings update. |
| Domains | PASS | `/orgs/:id/domains` | add checked through UI | Partial | Add/verify routes exist; live DNS verification depends on DNS/provider setup. |

## Fortune 500 Gaps

These are not placeholders, but they are not yet at a Fortune 500 IDE standard:

- Database panel is configuration-oriented, not a real managed SQL browser with query execution, schema explorer, migrations and audit trails.
- Object Storage panel is configuration/export-oriented, not a full bucket/object browser with upload/download/delete policies.
- Packages panel stores an install plan but does not yet provide a complete dependency graph, vulnerability view, lockfile diff and install execution UX.
- Monitoring panel is basic project telemetry, not full logs/metrics/traces with alerting and retention controls.
- Extensions panel stores requested extensions, but does not yet implement a complete extension marketplace lifecycle.
- Integrations panel persists real project integration state and secrets, but provider-specific OAuth installations, webhook delivery retries and external event streaming workers need provider-backed tests.
- Workflows panel persists project automation and dispatches commands through the runtime API, but streamed process control and complete DAG scheduling still need dedicated runtime tests.
- Deployments are real backend records and provider hooks exist, but the audit free org is quota-blocked; production provider dispatch needs configured provider secrets and paid quota.
- Git actions require a configured repository/provider; the panel renders status but is not a full GitHub/GitLab PR review workspace.

## Acceptance Status

Current status for the IDE panel layer: **backend-connected and functional, with enterprise-grade gaps documented**.

Do not market the full IDE as “Fortune 500 complete” until the partial panels above are upgraded and covered by live provider-backed tests.
