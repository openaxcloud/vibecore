# E-Code Theme — Source of Truth

Extracted verbatim from the reference repo **`~/dev/e-code`** (E-Code-Old, Vite +
React + Tailwind 3.4). This is the canonical design system VibeCore replicates.
Every value below cites its provenance (`file:line`) in that repo. The reusable
in-repo implementation lives in **`packages/ecode-theme/`** (the single source the
rest of VibeCore consumes).

> Reconciliation note on the body font: `client/src/index.css:502` (inside
> `@layer base`) declares `font-family: "Inter", …` for `body`. That rule is
> **overridden** by the *unlayered* `body { font-family: 'IBM Plex Sans', … }` in
> `client/index.html:51` — unlayered CSS always beats `@layer base` regardless of
> order/specificity. So the **effective** e-code body font is **IBM Plex Sans**;
> the Inter line is a dead vestige. (Matches Avi's directive: IBM Plex everywhere.)

## 1. Fonts

| Role | Family stack | Weights | Loading |
|------|--------------|---------|---------|
| Sans (UI + body + headings) | `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif` | 400 500 600 700 | Google Fonts |
| Mono (code/terminal) | `'IBM Plex Mono', 'SF Mono', Monaco, Inconsolata, 'Fira Mono', 'Droid Sans Mono', 'Source Code Pro', monospace` | 400 500 600 | Google Fonts |

Provenance: `tailwind.config.ts:62-65` (`fontFamily.sans/mono`),
`client/src/styles/replit-theme.css:204-205` (`--ecode-font-mono/--ecode-font-sans`),
`client/index.html:21` (preload `IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap`),
`client/index.html:51` (effective body font).

## 2. Brand colors (the exact orange)

| Token | Value | Provenance |
|-------|-------|-----------|
| **E-Code Orange (accent/primary)** | **`#F26207`** | `replit-theme.css:24,112,124` |
| Orange hover / dimmer | `#D04E00` | `replit-theme.css:25,113` |
| Orange light / stronger | `#FF7A2B` | `replit-theme.css:27,125` |
| Orange tint (dimmest) | `#FFE4D3` (`#ffe4d3`) | `replit-theme.css:26,126` |
| Yellow (secondary accent) | `#F99D25` | `replit-theme.css:127,128` |
| Yellow dark / light | `#E88510` / `#FFB64D` | `index.css:458-459` |
| Orange as HSL (primary) | `24 96 49` | `replit-theme.css:74` |
| Yellow as HSL (secondary/accent) | `39 96 56` | `replit-theme.css:76,80` |

## 3. Semantic token system (light `:root`)

RUI + e-code + Tailwind-HSL vars. Verbatim from `replit-theme.css:3-238`.

**RUI foreground/background/accent/border/status** (`replit-theme.css:13-38`):
- fg default/dimmer/dimmest: `#1A1A1A` / `#666666` / `#999999`
- bg root/default/higher/highest: `#FFFFFF` / `#F8F9FA` / `#F0F1F3` / `#E5E7EB`
- accent default/dimmer/dimmest/stronger: `#F26207` / `#D04E00` / `#FFE4D3` / `#FF7A2B`
- border default/dimmer/stronger: `#E0E0E0` / `#F0F1F3` / `#C1C8CD`
- status success/warning/error/info: `#22C55E` / `#F59E0B` / `#EF4444` / `#3B82F6`

**Tailwind HSL channel vars** (`replit-theme.css:68-99`):
`--background:0 0% 99%`, `--foreground:222 47% 11%`, `--card:0 0% 100%`,
`--primary:24 96 49`, `--primary-foreground:0 0% 100%`, `--secondary:39 96 56`,
`--muted:210 17% 96%`, `--muted-foreground:215 16% 40%`, `--accent:39 96 56`,
`--destructive:0 84% 60%`, `--border:214 32% 88%`, `--input:214 32% 90%`,
`--ring:24 96 49`. Sidebar/chart vars at `replit-theme.css:87-99`.

**e-code surface/text/status** (`replit-theme.css:103-129`):
`--ecode-background/surface:#ffffff`, `--ecode-surface-tertiary:#f8f9fa`,
`--ecode-border:#e0e0e0`, `--ecode-border-strong:#c1c8cd`,
`--ecode-text:#1a1a1a`, `--ecode-text-secondary:#333333`,
`--ecode-text-muted:#666666`, `--ecode-accent:#F26207`,
`--ecode-accent-hover:#D04E00`. Status (HSL channels for opacity):
`--ecode-danger:354 70% 54%`, `--ecode-warning:37 92% 50%`,
`--ecode-info:219 91% 60%`, `--ecode-green:159 64% 39%`.

**Buttons** (`replit-theme.css:170-173`): primary `#F26207` / hover `#D04E00`;
secondary `#f7f8fa` / hover `#eef0f3`.

## 4. Dark mode (`.dark`)

Verbatim from `replit-theme.css:240-430`. fg `#F5F9FC`, bg root `#0E1525`,
default `#1C2333`, higher `#262C3B`, highest `#313744`; accent stays `#F26207`;
borders `#313744`/`#262C3B`/`#3A4358`. Tailwind vars: `--background:221.7 45.1% 10%`,
`--foreground:205.7 53.8% 97.5%`, `--card:221.7 29.1% 15.5%` (…).

## 5. Radius / spacing / shadows

- **Radius** (`replit-theme.css:55-59,208-210`): `4px` / `8px` / `12px` / full `9999px`.
  Tailwind maps `lg/md/sm` → `--ecode-radius-lg/md/sm`; plus `ecode-sm/md/lg`
  literals (`tailwind.config.ts:43-50`).
- **Spacing** (`replit-theme.css:48-53,193-201`, `tailwind.config.ts:51-61`):
  `ecode-1..12` = 4/8/12/16/20/24/32/40/48px.
- **Shadows** (`replit-theme.css:62-65,175-177`): color-mix on `--foreground-default`;
  `--ecode-shadow-sm/md/lg` = 0 1px 3px / 0 4px 8px -2px / 0 12px 24px -6px @10-12%.
  Premium shadow `index.css:467`: `0 30px 60px -15px rgba(242,98,7,.2)…`.
- **Accent shadow/gradient** (`replit-theme.css:1230-1250`):
  `shadow-ecode-accent` = `0 8px 32px -8px color-mix(accent 25%)`;
  `gradient-ecode-accent` = `linear-gradient(135deg, accent 0%, accent-hover 100%)`.

## 6. Typography scale (responsive — IMPORTANT)

The e-code type scale is **responsive** via `@apply` utilities
(`client/src/index.css:727-754`). (VibeCore's earlier port flattened
`text-responsive-2xl` to 36px — that was an approximation; the real values:)

| Class | `@apply` chain | px (xs→sm→lg→xl) |
|-------|----------------|------------------|
| `text-responsive-xs` | `text-[11px] sm:text-[13px]` | 11 → 13 |
| `text-responsive-sm` | `text-[13px] sm:text-base` | 13 → 16 |
| `text-responsive-base` | `text-base sm:text-[15px]` | 16 → 15 |
| `text-responsive-lg` | `text-[15px] sm:text-xl lg:text-2xl` | 15 → 20 → 24 |
| `text-responsive-xl` | `text-xl sm:text-2xl lg:text-3xl` | 20 → 24 → 30 |
| `text-responsive-2xl` | `text-2xl sm:text-3xl lg:text-4xl xl:text-5xl` | 24 → 30 → 36 → 48 |
| `text-responsive-3xl` | `text-3xl sm:text-4xl lg:text-5xl xl:text-6xl` | 30 → 36 → 48 → 60 |

Breakpoints (`tailwind.config.ts:19-41`): xs 480, sm 640, md 768, lg 1024,
xl 1280, 2xl 1536 (+ orientation/touch/desktop raw queries).
`xxs` fontSize `0.625rem/0.75rem` (`tailwind.config.ts:67`).
Touch/inputs (`index.css:756-766`): `touch-target` min 44→36px;
`button-responsive` h-12 sm:h-10; `input-responsive` h-12 sm:h-11.

## 7. Key component classes

- `btn-ecode-primary` (`replit-theme.css:1195-1203`): bg `--ecode-button-primary`
  (#F26207), white text, hover `#D04E00`, `transition all .2s`.
- `btn-ecode-secondary` (`replit-theme.css:1205-1215`): bg `#f7f8fa`,
  text `--ecode-text`, `1px solid --ecode-border`, hover bg `#eef0f3` + border strong.
- `border-ecode` / `border-ecode-strong` (`replit-theme.css:1182-1188`).
- `card` (`index.css:1092`), `btn-premium` (`index.css:955`), `btn-icon` (`index.css:267`).
- The light **pill badge** (`✨ … ✨`) = a `rounded-full` (9999px) surface badge with
  uppercase tracking; in VibeCore it is `EcodeExactUi.Badge` variant=secondary.

## 8. Tailwind config summary (`~/dev/e-code/tailwind.config.ts`)

`darkMode:['class']`; `tailwindcss-animate` + `@tailwindcss/typography` plugins;
colors all wired to the CSS vars above; keyframes/animation: accordion, shimmer,
wave, fade-in, slide-in-up/down, scale-in (`tailwind.config.ts:146-208`).

## 9. Animations (`tailwind.config.ts:199-208`)

`shimmer 1.5s infinite`, `wave 1.5s ease-in-out infinite`, `fade-in .2s`,
`slide-in-up .3s`, `slide-in-down .3s`, `scale-in .2s`, accordion `.2s`.
