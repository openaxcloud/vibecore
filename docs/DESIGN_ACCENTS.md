# E-Code accent colors — who owns which accent

E-Code deliberately runs **two accent systems**. They are not interchangeable, and
mixing them is a design regression. This split mirrors Replit's product design
(brand orange on the marketing site, a blue "action" accent inside the workspace).

## 1. Orange `#F26207` — the brand accent

Token: `--ecode-accent` (fills), `--ecode-accent-text` (AA-contrast text/links:
`#c74e00` light / `#ff8a3d` dark), plus the `--ecode-orange*` / `--ecode-secondary*`
family defined in `packages/ecode-theme/src/tokens.css`.

Where it is used:

- **Marketing site** (`app/components/marketing/**`, `e-code.ai`): hero, CTAs,
  links, badges, NavPills, footer — the whole public surface is orange-branded.
- **Brand marks everywhere**: the E-Code logo, loading marks and other brand
  imagery keep the orange even inside the app and IDE.
- **Auth surfaces** (login/signup) which are brand-first.

Rules:
- Solid fills (primary buttons, badges) use `--ecode-accent` (`#f26207`).
- Orange **text and links** use `--ecode-accent-text` (AA on both themes) — never
  raw `#f26207` as a text color on light backgrounds.
- Borders may use `--ecode-accent`.

## 2. Blue — the app/IDE **action** accent

Token: `--vc-ide-accent-action` (`#006fd6` light / `#0099ff` dark), defined in
`app/styles/index.scss`.

Where it is used:

- **Dashboard / user app** (`app/components/dashboard/**`, `app.e-code.ai`).
- **IDE / workbench** (`app/components/workbench/**`, `app/components/chat/**`,
  `app/components/project-ide/**`): run/actions, active toggles, selected states,
  focus accents, links inside panes.
- **Admin console** (`/admin/*`, `apps/admin`): `--accent` maps to
  `--vc-ide-accent-action`.
- The **bluish hover** on dark surfaces (`--ecode-surface-hover:
  rgba(59, 130, 246, 0.16)` in dark) is part of this system and intentional.

Rules:
- Interactive/action states in app, IDE and admin (active toggles, checked
  radios/switches, primary in-pane actions, selection highlights) use
  `var(--vc-ide-accent-action)`.
- Do **not** re-introduce orange for interactive states inside the app/IDE; the
  orange there is reserved for brand marks (logo, plan/brand badges).
- Do **not** use the blue action accent on the marketing site.

## Why both exist (Replit parity)

Replit's workspace uses a blue action accent while its brand stays orange; users
read blue as "this does something" and orange as "this is the brand". E-Code
keeps the same contract so the IDE feels like a workspace, not a landing page.

## Known deliberate exceptions

- `app/components/dashboard/ImpersonationBanner.tsx`: the full-width orange
  banner is an **attention/brand alert**, not an interactive action accent — it
  stays orange on purpose.
- Plan / upgrade highlights that are marketing-adjacent (pricing upsells) may
  stay orange even inside the app.

## Quick audit

```bash
# Interactive orange inside app/IDE surfaces (should stay ~empty):
grep -rn "ecode-accent" app/components/{dashboard,workbench,chat,project-ide} \
  --include="*.tsx" | grep -v spec
```
