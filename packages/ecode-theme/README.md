# @vibecore/ecode-theme

The **single source of truth** for the E-Code design system in VibeCore — fonts,
color tokens, the responsive type scale, and a framework-agnostic Tailwind/UnoCSS
theme fragment. Extracted verbatim from the reference repo `~/dev/e-code`; full
provenance (every value → `file:line`) in **`docs/ECODE_THEME_SOURCE.md`**.

## What's inside

| File | Purpose |
|------|---------|
| `src/tokens.css` | All CSS-variable design tokens (light `:root`, `.dark`, `.light`). Pure CSS — no `@apply` — so it works in UnoCSS, Tailwind, or vanilla. |
| `src/fonts.css` | IBM Plex Sans (400–700) + IBM Plex Mono (400–600) Google-Fonts import + `--ecode-font-sans/mono`. |
| `src/typography.css` | The e-code responsive type scale (`text-responsive-xs … 3xl`) as plain CSS + media queries. |
| `src/index.css` | Aggregate import (`fonts → tokens → typography`). |
| `preset.ts` | `ecodeThemeExtend` (fontFamily/colors/radius/spacing/screens) for a Tailwind/Uno `theme.extend`. |

## Usage

**CSS (any pipeline):**

```css
@import '@vibecore/ecode-theme/src/index.css';

body {
  font-family: var(--ecode-font-sans);
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

**Tailwind / UnoCSS theme:**

```ts
import { ecodeThemeExtend } from '@vibecore/ecode-theme/preset';
// tailwind:  theme: { extend: ecodeThemeExtend }
// unocss:    theme: { ...ecodeThemeExtend }
```

## The brand essentials

- **Font:** IBM Plex Sans (body + headings), IBM Plex Mono (code).
- **Orange:** `#F26207` (hover `#D04E00`, light `#FF7A2B`, tint `#FFE4D3`).
- **Yellow:** `#F99D25`.
- **Radius:** 4 / 8 / 12px. **Type scale:** responsive, see `src/typography.css`.

Dark mode switches on the `.dark` class (`darkMode: ['class']` in the reference).

## Theme-consistency contract (REQUIRED)

**Total theme consistency — no surface may render in the opposite theme.**

When the active theme (`<html data-theme>` + `.dark` class) is **light, EVERY
app-rendered surface must be light**; when **dark, every surface must be dark**.
This applies uniformly across **all three areas**: the **marketing site**, the
**user area / dashboard**, **and the IDE** (every panel, toolbar, tab bar, dock,
panel header, status bar, modal, popover, dropdown and tooltip). Zero
opposite-theme surfaces. (Browser chrome — the address bar / OS nav bar — is out
of our control and exempt; only app-rendered surfaces count.)

How to comply:

- Style surfaces with the theme-reactive tokens (`--bolt-elements-*` /
  `bg-bolt-elements-background-depth-*`, `text-bolt-elements-textPrimary`,
  `border-bolt-elements-borderColor`, or the ecode `hsl(var(--…))` tokens). These
  resolve per `data-theme` automatically.
- **Never** hardcode a one-theme color on a surface: no raw dark hex
  (`#0a0f1c`, `#18181b`, …), no unconditional `bg-gray-900/950`, `bg-black`,
  `bg-slate-900`, `bg-zinc-900`, or unconditional `text-white` on a panel. If a
  literal is unavoidable, pair it: `bg-white dark:bg-…` / `text-gray-900
  dark:text-white`.
- Any `--bolt-elements-*` token used by app/IDE chrome MUST define BOTH a light
  value (`:root[data-theme='light']`) and a dark value (`:root` /
  `[data-theme='dark']`) in `app/styles/variables.scss`.
- Verify BOTH themes (light AND dark) on all three breakpoints (390 / 768 / 1440)
  before considering a theme change done.
