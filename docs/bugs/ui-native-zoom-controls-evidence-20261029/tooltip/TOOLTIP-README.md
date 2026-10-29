# Tooltip / Secrets — zoom emulation audit

Compiled server http://127.0.0.1:21999 supplied by parent, unchanged. Chromium headless, synthetic Secrets key names only; no secret value, reveal/copy, backend mutation or external call.

## Method

`Control++` four times was measured and did not apply native browser zoom: innerWidth 1280, DPR 1, visualViewport.width 1280 and scale 1, CSS zoom 1 remained unchanged. Evidence: `tooltip-zoom-method.json`.

Consequently the recipe explicitly uses `document.documentElement.style.zoom = '2'`. This is CSS magnification, **not native browser zoom, pinch zoom or Safari validation**. Before/after metrics are recorded per case. CSS zoom became 2 while viewport width, DPR and visual scale remained unchanged; viewport media queries therefore do not reproduce native zoom behavior.

## Results (first run, no retries)

Command: `PANEL=secrets MODE=long EXPECT_RENDERER=1 node /workspace/ui843-zoom/tooltip-secrets.cjs`

- 390: one actual tooltip, full synthetic key text, pseudo none; Escape and scroll dismiss, focus retained. Menu exceeds viewport (x16, width440, right456 versus390); tooltip bottom1400 exceeds viewport844. Case fails strict horizontal menu assertion.
- 820: same unique-tooltip/text/dismissal/focus checks pass. Menu x744 width440 right1184 exceeds820. Tooltip x1064/right1115.95/bottom1422.72 exceeds820×1180. Case fails strict horizontal menu assertion.
- 1280: panel width precondition (>100 CSS px) fails before tooltip checks. This case does not validate tooltip or menu.

0/3 cases green; zero browser JavaScript errors. Do not claim these failures are native browser zoom defects: coordinate scaling and unchanged media breakpoints under CSS zoom are material limitations. Menu focus/closure assertions following the overflow failure were not reached. The 390/820 tooltip Escape/refocus/scroll checks were reached and passed.

Evidence: `tooltip-secrets/receipt.json`, screenshots `390-tooltip.png`, `820-tooltip.png`, and per-case `*-en-failure.png`; raw log `tooltip-secrets.log`. The script preserves failures but exits zero after writing receipts, so receipt pass flags are authoritative.

All browser instances closed via finally. No source edits, rebuild or server restart. WebKit unavailable per parent; no installation attempted.

## Native Chromium zoom 200% — subsequent authoritative recipe

Parent proved a working method: an isolated persistent test profile, `chrome://settings/appearance`, `#zoomLevel` select `2`. This recipe uses `/workspace/ui843-zoom/tooltip-native-profile`, no CSS zoom injection. Actual measurements in all cases: DPR2, CSSzoom1, visualViewport.scale1; innerWidth halves to195/410/640 for physical390/820/1280. Coordinate assertions compare against actual CSS innerWidth. The earlier CSS-only failures remain methodological evidence, not product defects.

Command: `PANEL=secrets MODE=long EXPECT_RENDERER=1 node /workspace/ui843-zoom/tooltip-native.cjs`

Results: **2/3 pass**, no retries and no JavaScript errors.

- 390 physical /195 CSS: **fail**. One tooltip with full text and pseudo none; Escape, scroll dismissal and focus retention pass. Tooltip width280, x−93, right187; menu x8,width220,right228 exceeds195. Menu focus/close checks after geometry failure not reached. These are now genuine native-zoom geometry findings, unlike the CSS emulation observations.
- 820 physical /410 CSS: **pass**. One tooltip, full text, pseudo none, Escape/scroll/focus pass. Menu is keyboard-accessible, first item focused, Escape returns focus. Panel scrollWidth/clientWidth377/377, pageWidth410.
- 1280 physical /640 CSS: **pass**, same checks, panel589/589, pageWidth640.

Tooltip bounding boxes were recorded; strict menu bounds caught the390 defect. Screenshots and receipt under `tooltip-native/`; source recipe `tooltip-native.cjs`; log `tooltip-native.log`. Browser closed via finally; parent server unchanged. No production/Safari claim and no real secrets inspected. Source changes are outside this recipe task.

## Corrected build: horizontal green, vertical defect confirmed

On parent's stable corrected build, separate first-run receipts (no retry): `tooltip-native-corrected/receipt.json` and `tooltip-native-vertical-corrected/receipt.json`.

The three standard formats now pass horizontal/menu accessibility, unique tooltip, full text, Escape/scroll/focus checks. At195 CSS px the menu and tooltip are179px wide with8px gutters. **This is not full geometry validation:** the standard recipe lacked tooltip height assertions, and its390 screenshot/metrics show tooltip bottom447.258 beyond viewport422.

A targeted French case adds strict vertical bounds and fails: physical820×600 -> CSS410×300, DPR2/CSSzoom1. Actual unmodified anchor y154..186; tooltip top194, height258.875, bottom452.875 exceeds permitted292. The synthetic French key remains full text. Natural scrollIntoViewIfNeeded was used, no DOM repositioning; scrollY0. No JavaScript errors. Screenshot preserves the failure. This establishes a real vertical product defect, independent of the earlier invalid SSR attempt during rebuild.

All browsers closed. No source edits or restart during these runs. Parent informed of proposed measured-height positioning fix; implementation requires coordinated next source window.

## Vertical source correction prepared

GlobalTooltip now measures its rendered height in useLayoutEffect and clamps top to `max(8, min(top, innerHeight - measuredHeight - 8))`. State is updated only when top differs; the next measurement is stable. No tooltip role/tabstop or text change. Regression tests use the two measured browser geometries and one oversized-content case; assert stable rerender, bounded measurement calls, full text, no tabindex and Escape dismissal.

Before patch:3 new failures/17 existing passes (`vertical-unit-red.log`). After:34/34 tests across5 files (`vertical-unit-green.log`), targeted lint and diff-check pass. Source stable for parent's build; compiled browser recipe after this vertical patch still pending.

Known limit: when the tooltip itself is taller than viewport minus16px, it is anchored at top8 and retains all text but cannot fit entirely. This patch does not claim that oversized content is completely visible or keyboard-scrollable. No interactive popup conversion or text truncation was introduced.

## Final compiled vertical fix — 4/4 strict native zoom cases pass

Parent's final vertical build on21999 tested without CSS injection or retries. Receipts: `tooltip-native-vertical-final/receipt.json` (French820×600 physical) and `tooltip-native-final/receipt.json` (English390/820/1280). All four now explicitly assert tooltip left/top >=8 and right/bottom <= actual CSS viewport minus8, full exact text, one tooltip, pseudo none, Escape/scroll dismissal, retained focus, menu geometry and keyboard menu focus/closure. Zero JS errors, all browsers closed in finally.

- French CSS410×300: tooltip y33.125,height258.875,bottom292 (previously452.875); menu y16,height134.
- English CSS195×422: tooltip x8,width179,y201.9765625,height212.0234375,bottom414 (previously447.2578125); menu x8,width179, accessible.
- English CSS410×590: tooltip right402,bottom327.9375, passes.
- English CSS640×450: tooltip right632,bottom335.6953125, passes.

DPR2/CSSzoom1/visualViewport.scale1 verified throughout. Earlier red evidence retained. These results validate the reproduced native zoom failures with synthetic local fixtures; oversized tooltip content taller than the viewport remains the documented limitation. No Safari/device/production claim, no secret values, no source edits/restart during recipes.
