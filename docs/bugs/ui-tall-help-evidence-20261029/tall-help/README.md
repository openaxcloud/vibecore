# Oversized help — native Chromium 200% diagnosis

Synthetic local Secrets key only, existing compiled build on21999. Native page zoom via isolated persistent profile: physical820×400 -> CSS410×200, DPR2, CSSzoom1. No client secret values, runtime mutation or AI calls.

`before/receipt.json` passes the previous geometry assertions but does NOT prove complete visibility. Screenshot inspected: final text lines are absent. Existing global rule at index.scss roletooltip caps height to viewport−24 and sets overflow:hidden.

Targeted `overflow-diagnosis/receipt.json` establishes a real red: clientHeight174, scrollHeight257, overflowYhidden. PageDown dismisses the tooltip entirely while focus remains on the original Secrets menu button, so keyboard cannot scroll to the missing text. No geometry/DOM relocation/CSS injection. Both browsers closed; root server untouched.

Proposed next UX, pending parent approval: ordinary short tooltip unchanged; oversized help identified by scrollHeight>clientHeight (not only rendered height). Explicit “Read full help (F1)” action opens named nonmodal dialog with complete scrollable text, focusable reading region and Close. Keyboard access F1 only from the matching anchor, discoverable in visible hint; no hijacking Enter/Tab or Ctrl+S, Escape restores opener, no focus trap. Use existing Radix nonmodal primitives and useDialogLanguage; avoid making roletooltip interactive. No source modifications made yet.

## Implementation stable before parent build

GlobalTooltip/spec only. Oversized means measured clipping (scrollHeight>clientHeight) or rendered height exceeding viewport. Compact explicit action, F1 only while its anchor is active, FR/EN labels via useDialogLanguage. Full help is a named nonmodal `role=dialog data-state=open aria-modal=false` portal with focusable scrollable reading region and Close. No auto-open/focus on hover, no tooltip interaction added to ordinary short help.

Radix Dialog nonmodal was evaluated but its internal FocusScope loops Tab; the parent approved a plain nonmodal surface to preserve native Tab. The surface retains its text and reflows on resize, closes without restoring focus if focus exits, its anchor disconnects or project pathname changes. Escape inside restores the opener, Ctrl+S remains owned by the real keyboard hook. Pointer gap does not dismiss the long-help action before click. Native title restoration tested.

Baseline actual source:7 new tests fail,21 pass (`unit-red-baseline.log`). Latest5-file suite44/44 pass (`unit-green-final.log`); lint/diff-check pass. Includes real keyboard hook in both listener orders, FR/EN, pointer gap, outside focus, stale project, resize/scroll/hover and preserved short help. Browser PageDown/End and mouse movement with intermediate steps are still pending the new compiled build; jsdom event tests do not certify scrolling.

Closed child-owned test profiles cleaned to recover disk; receipts/screenshots retained. No build/push/restart performed.

## Independent review correction to tests

The initial keyboard test installed only Ctrl+S despite its title. It now installs both actual `overlay.close` Escape and `file.save` bindings in both listener orders and requires exactly one action total (save), with help dismissed by Escape. The F1-other-anchor test now actually focuses Next, verifies the F1 event is not prevented and no dialog opens, then refocuses the original anchor.36/36 across Tooltip and real keyboard hook pass (`review-keybindings.log`), lint/diff-check pass. Product source unchanged during parent build.

Keyboard entry is explicitly F1 from the focused anchor. Do not claim the transient Read button is reachable by normal Tab from that anchor: current dismissal on keydown/focusout removes that offer; this path awaits compiled observation. Tab within/away from the nonmodal reading surface remains separately tested.

## Compiled recipe results

First suite `compiled/receipt.json`, native200%, physical820×400 FR /390×600 EN /1280×400 EN:
- All3: explicit F1 opens, PageDown scrolls, End reaches the last full `FIN_SYNTHETIQUE` marker, exact complete text preserved, dialog within viewport, resize retains reading, Escape returns focus. Last-line screenshots all opened and visually inspected.
-390: entire scenario green, including12-step real pointer path and mouse down/up activation, Shift+Tab exit, Escape outside does not reclaim focus.
-820/1280: scenario fails before pointer-gap traversal because the real Secrets row anchor is behind the fixed bottom navigation at200CSSpx height. Screenshot shows mouse over navigation “Plus d’options”, not the row. Preserve these2 failures; do not count this suite as3/3 green or claim the row-occlusion defect fixed.

Distinct pointer scenarios `compiled-pointer/receipt.json`: physical820×800 FR and1280×800 EN, text doubled to30segments so it remains clipped above320px at the taller window. An extra elementFromPoint assertion proves the row anchor reachable before movement.2/2 green:12-step mouse move across the gap, real down/up, full end-of-text reading, resize, Escape, Shift+Tab exit and outside Escape without focus theft. No retries of identical failing setup; no assertions weakened. Short-height reading and reachable-anchor pointer interaction are separately demonstrated.

Ordinary tooltip regression `ordinary-regression/receipt.json`:3/3 native200% formats390/820/1280 green, four edges, full exact text, one tooltip, no pseudo, Escape/scroll/focus and menus preserved. Zero JavaScript errors across all recipes. All browsers closed; server unchanged; no runtime/customer mutation.

Keyboard offer entry is F1; no claim of reaching the transient offer with Tab from its anchor. Within the explicit reading surface, real Shift+Tab exits without trapping or restoring stale focus. Safari/physical-device/production coverage absent. The separate fixed-nav occlusion at200CSSpx remains outside this tooltip change.

## Independent timer race correction

Independent review reproduced hoverA(long)->hoverB(short delayed)->click ReadA->B timer expires during help->project route changes->stale B tooltip appears. Exact local regression red:1failed/30passed (`timer-unit-red.log`), with OTHER SHORT HELP visible after popstate. Minimal product delta: move showTimer ref before openHelp; clearTimeout and reset ref to undefined before setHelp. No unrelated source changes.

After correction45/45 across5 files pass (`timer-unit-green.log`), lint/prettier/diff-check pass. The regression asserts full A text while reading, no dialog/tooltip/offer after route change, and no focus returned to either stale anchor. Sources stable for parent rebuild. Earlier compiled recipes predate this last timer correction; no claim they validate its rebuilt bundle yet.

## Final rebuilt timer fix: targeted compiled smoke

Parent server `ui844-tall-help-final`, one new scenario only: native200%, physical820×800FR -> CSS410×400,DPR2,CSSzoom1. `final-timer-build/receipt.json` pass=true, no JS errors. Exact full text, F1, PageDown/End to last FIN_SYNTHETIQUE (scrollTop203.5, client333, scroll537), resize preserved, Escape opener focus, real mouse12-step gap/down/up, Shift+Tab exit and outside Escape all pass. A subsequent project pathname change closes dialog with no tooltip/offer and no focus returned to old anchor. Last-line screenshot opened and visually inspected; marker fully visible.

This compiled smoke verifies reading/pointer/route behavior on the final bundle. It does not claim to inject/reproduce the exact competing-hover timer sequence in browser; that race has its exact fake-timer red/green test and independent review evidence. No identical suite reruns or assertion weakening. Browser closed in finally; no product edits, server restart or build by this agent.
