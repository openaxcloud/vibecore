# BUG-SOL-002 — App Builder: wording fixed + REAL prompt→agent→files→Preview proof

## Part 1 — the fabricated-demo defect is fixed in code (on prod-bound main)
- `generate-app-builder-visuals.ts` (the standalone HTML/CSS/JS generator that
  rendered "salon" demos with no real run) is **deleted** — it exists only in git
  history, not in the tree.
- No `vitrine` / standalone-demo wording remains on the App Builder surfaces.
- The `/solutions/app-builder` page (commit 76c2a797 + f5ed243b) now uses **real
  E-Code product screenshots** (`${PRODUCT_BASE}/ide.png`) with honest copy
  ("AI-guided generation, real files and preview validation") and a real
  "Start building" → /signup CTA. Sections: "Prompt to project", "Runtime preview".

## Part 2 — REAL prompt → agent → files → Preview, executed live on prod (24/07)
Throwaway prod account (deleted afterwards), driven headless against app.e-code.ai:
- **Project**: `cms8ikwey000v0na09lhlmrc2` (Vite + React scaffold, workspace running).
- **Prompt** (screenshots 03/04): *"In src/App.tsx, replace the component so the
  page shows a centered card with the heading 'E-Code live proof', a live-updating
  digital clock underneath (updates every second), and a button labelled 'Change
  color' that randomizes the page background colour. Keep the existing Vite + React
  setup and styles.css."*
- **Agent** (shot 04 = "Agent running — Streaming response"; shot 07 = **"Agent ·
  Done 100%"** with `✓ Create src/App.tsx 1.6s`, `✓ Create src/styles.css 2.5s`,
  `Start Application — Running`).
- **Files** — verified via the prod API (`GET /projects/:id/export/zip`): the agent
  actually rewrote `src/App.tsx` (1600 bytes, updatedAt 05:45:54) to a real React
  component with a `useClock()` setInterval-every-1s hook, an HSL `randomReadableColor`
  helper, the "E-Code live proof" heading and the "Change color" button — NOT
  standalone HTML. Saved copy: `sol002/agent-written-App.tsx`.
- **Preview** — the E-Code Webview rendered the agent-generated app live from the
  running Vite dev server (port 5173). Captured iframe text:
  `"E-CODE PROJECT · E-Code live proof · CURRENT TIME 09:13:20 AM · Change color"`
  — the live clock is ticking and the styled card matches the generated code.
  Clean iframe screenshot: `sol002/09b-preview-iframe.png` (and `09-preview-rendered.png`).
  Note: the FIRST render attempts hit the fresh project's slow `npm install`; once
  the dev server finished building, the preview rendered the generated app within
  ~20s of opening the Webview.

Screenshots: `sol002/01-ide-open` … `04-agent-generating`, `07-preview-final`
(Agent Done + file creation), `08-webview`, **`09b-preview-iframe`** (rendered app),
plus `agent-written-App.tsx`, `preview-rendered.json`. The throwaway org+user were
hard-deleted after capture.

## Cleanup (hygiene)
Throwaway resources hard-deleted via raw SQL in the prod api pod (Prisma-in-pod
OOMs the 512Mi container, so `pg` was used directly):
`before {user:1, org:1, projects:1, workspaces:1} → after {user:0, org:0, projects:0}`.
Deleting the Organization cascaded the project + workspace record; deleting the
User cascaded its sessions (token revoked). The idle workspace pod is GC-swept.
