# TPL-02.3 / TPL-02.4 / TPL-02.5 — live proof (2026-08-02)

Branch `feat/gallery-tpl-345`, deployed image tag `2ad85147af`.

Scope: the Replit-parity **Import hub (12 sources)**, the explicit **empty project**
path, and re-confirming the **starters requalified as demo apps** (no Python/Go/Rust).

## What was built (code)

- `app/routes/import._index.tsx` — `/import` hub: all 12 documented sources as
  tiles, grouped by category, honest per-provider status. Responsive grid.
- `app/lib/import-hub.ts` (+ `import-hub.spec.ts`, 5 tests) — shared registry
  mirroring the backend `IMPORT_HUB_PROVIDERS` contract. 12 providers,
  `screenshot` excluded.
- `app/routes/import.empty.tsx` — TPL-02.4: explicit blank project (no agent,
  framework or scaffolding) → creates via `POST /orgs/:id/projects` → IDE.
- `app/routes/import.spreadsheet.tsx` + `app/lib/import-spreadsheet.ts`
  (+ `import-spreadsheet.spec.ts`, 7 tests) — CSV/TSV → a real, sortable,
  dependency-light data app, imported through the proven `import/zip` pipeline.
- `app/routes/import.$provider.tsx` — honest credential-gated pages for
  Vercel / Figma / Claude (no fake success).
- `app/routes/import-zip.tsx` — `?source=` reframes copy for Bolt / Lovable /
  Base44 / Previous-Agent exports (same proven zip pipeline).
- Surfaced from `/dashboard/templates` and `/projects/new`.

Local gates (worktree, symlinked node_modules):
- `tsc -p tsconfig.web.json` → **0 errors**.
- `eslint` on all changed files → **0 errors**.
- `vitest import-hub.spec + import-spreadsheet.spec` → **12/12 passed**.

## Functional proof — LIVE prod API (before UI deploy)

A throwaway QA account was registered through the public `POST /auth/register`
(org `cmsbi5luh000i0ndw0u14muk8`). The exact endpoints the new routes call were
exercised against **api.e-code.ai**:

- **TPL-02.4 empty project** — `POST /orgs/:org/projects {name:"QA Empty Project"}`
  → `201`, project `cmsbi68up000q0ndwf4v71jfo`, **`sourceType:"blank"`**, real PVC.
  This is the identical call made by `import.empty.tsx`.
- **Spreadsheet connector** — a zip built exactly like `buildSpreadsheetProject`
  (index.html + data.json + package.json) POSTed to
  `POST /orgs/:org/projects/import/zip` → `201`, project
  `cmsbi71ii00040nev5rm6acsg`, **`sourceType:"zip"`**, files committed:
  `data.json` (236 B), `index.html` (428 B), `package.json` (137 B).

(These prove the backend paths are real end-to-end in prod; the UI screenshots
below drive the same routes in a browser.)

## Responsive proof — TPL-02.5 (public, already live)

`shots/gallery-*.png` and `shots/languages-*.png` — captured on live prod at
390 / 768 / 1024 / 1440 px × light + dark (16 shots). Gallery shows 15 real
E-Code Studio demo apps with categories; `/templates/languages` shows only
TypeScript + JavaScript — **no Python/Go/Rust card**.

## Deploy

`gh workflow run deploy-main.yml --ref feat/gallery-tpl-345 -f short_sha=2ad85147af`
→ Cloud Build (web + workspace-agent) + helm upgrade **succeeded**. Live check:
`kubectl` reports `web:2ad85147af`; anon `/import` → `302 /login?returnTo=/import`,
`/import/figma` → `200`, `/import/unknownprovider` → `404`.

## Responsive proof — TPL-02.3 / TPL-02.4 (authenticated UI, LIVE prod)

A session cookie (`vc_session`) for the QA account was injected via Playwright
`addCookies` (no password typed into any form). All shots are live prod at
390 / 768 / 1024 / 1440 px × light + dark:

- `shots/import-hub-*.png` (8) — the `/import` hub: 12 tiles grouped GIT
  REPOSITORIES / AGENT & BUILDER EXPORTS / DATA / DESIGN / AI / START FRESH,
  honest per-provider status (arrow = ready; "Connect token/source" badge on
  Vercel/Figma/Claude). Single-column stack at 390, up to 4-col at 1440.
- `shots/empty-*.png` (8) — `/import/empty` (TPL-02.4).
- `shots/spreadsheet-*.png` (8) — `/import/spreadsheet` (TPL-02.3 data).
- `shots/figma-cred-*.png` (8) — `/import/figma` honest credential page.

## End-to-end UI proof — TPL-02.4 (form → real project → IDE)

`shots/empty-e2e-ide.png` — the `/import/empty` **form was filled and submitted
in the browser**; it created project `qa-ui-empty-msbjj506` and navigated to the
**live IDE** (`/@qa-tpl345-org/qa-ui-empty-msbjj506`) with the editor, file tree
(minimal blank Vite scaffold: App.tsx / main.tsx / index.html / package.json /
vite.config.ts / README.md), Project assistant and Webview, "Connected".

## Honest limits

- **Empty project** is not zero-file: the platform's `sourceType:"blank"` path
  writes a minimal runtime scaffold (7 files) so the IDE/preview is immediately
  usable. It carries **no agent output and no framework choice** — the power-user
  direct-creation path. A literally-empty (0-file) project would need a backend
  change and would leave the preview broken.
- **Vercel / Figma / Claude** are honestly credential-gated (external-API tokens
  not held). Their tiles render a "Connect token/source" state and their pages
  state the exact blocker — no fake import.
- GitHub / Bitbucket / ZIP route to the pre-existing proven import flows; the
  Bolt / Lovable / Base44 / Previous-Agent tiles reuse the proven zip pipeline
  with provider-framed copy.
