# E-Code pre-hydration splash — live evidence

- Production commit: `b1404989d5aec12f5a2cbbc2651c4a302db713c3`
- Deployment workflow: `29346264927` (`success`)
- Captured: 2026-07-14 after the verified production rollout
- Viewport: 1280 × 800
- Method: fresh Chromium context, cache bypassed, service workers disabled, application JavaScript blocked, and theme applied before first contentful paint

## Results

All four production cases passed the automated assertions and visual inspection:

| Surface | Theme | Screenshot |
|---|---|---|
| `https://app.e-code.ai/` | Light | `app-e-code-ai-light-prehydration-splash.png` |
| `https://app.e-code.ai/` | Dark | `app-e-code-ai-dark-prehydration-splash.png` |
| `https://e-code.ai/` | Light | `e-code-ai-light-prehydration-splash.png` |
| `https://e-code.ai/` | Dark | `e-code-ai-dark-prehydration-splash.png` |

For every case, the report confirms HTTP 200, a viewport-sized SSR splash, an inline SVG E-Code mark, both embedded theme variants with only the expected variant painted, no external image dependency, and no legacy orange square/class.

The complete machine-readable assertions are in `prehydration-splash-evidence.json`.
