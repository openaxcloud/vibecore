# Focus autoscroll dismisses full-help keyboard entry

Local synthetic Secrets fixture, native Chromium200%, physical820×400 -> CSS410×200, parent-owned21999. Product source untouched. Browser closed after one instrumented recipe.

`before/receipt.json` shows both `f1AfterFirstFocus=0` and `f1AfterNativeTab=0`. Its final pass flag covers a later fourth focus without new autoscroll and must not be interpreted as fixing these failures.

Sequence from instrumented native events:
-1419ms focus on `.bolt-secrets-chip--key`.
-1431ms automatic scroll in the real content scroller; compact help offer already visible, same anchor still focused.
-2209ms F1: offer gone, no dialog.
-2238ms focus after native Tab from filter;2246ms automatic scroll, offer visible;3008ms F1 again has no offer/dialog.

Source: window capture scroll listener invokes hide(), clearing tip state. F1 requires tipStateRef.current?.oversized. Scroll-dismiss behavior existed before the full-help feature; feature77368f3a6/PR844 added this dependency, so the short-height Secrets correction exposes an existing full-help weakness rather than creating the dismiss handler.

Proposed narrow fix pending parent coordination: retain a focus-scoped receipt of actually measured clipped help for explicit F1 even after ordinary scroll dismissal. Validate active/connected same anchor, current pathname/text and nonhidden/nonRadix before consuming; invalidate on focus departure. Keep pointer/scroll dismissal and short-help F1 unchanged. Tests: focus->scroll->F1 red/green, invalidation on focus/route/text/hidden/Radix, real keyboard handling. No product edits yet.

## Authorized narrow correction, stable before parent build

GlobalTooltip keeps an ephemeral receipt only after help is measured as clipped while its anchor is focused. Existing pointer and scroll dismissal remain unchanged. Explicit F1 can consume the receipt after scroll if the same connected anchor is active, pathname/text still match, and hidden/Radix exclusions pass. Receipt clears on focus departure, pointer activation, Enter/Space/Escape, opening help, or invalid eligibility on keydown. Short help and F1 outside its anchor remain unconsumed.

Independent review exposed a second case: focused A receipt must win over unrelated later hover tooltip B. Added fake-timer red (1failed/40passed), then one-line selection prefers current tooltip only when valid for focus, otherwise the receipt. Original autoscroll red3failures includes both real keyboard-listener orders.

Final55/55 tests in5 files pass (41Tooltip,6real keybinding,3anchor CSS,3touch,2Secrets CSS); lint/prettier/diff-check pass. Actual disconnected standalone DOM anchor is removed while renderer remains mounted; F1 does not reopen or restore stale focus. Initial fake blur-only detached case was removed, not counted as DOM-removal evidence.

Evidence: unit-red.log, hover-priority-red.log, unit-green-final.log. Source stable for independent review and parent build; compiled after-fix browser proof still pending. No build/commit/push by this agent.

## Final compiled proof

Parent's final bundle on21999, one exact scenario with strengthened acceptance: `final/receipt.json`. Native200% physical820×400FR -> CSS410×200,DPR2,CSSzoom1. First focus F1=1 and native Tab-from-filter F1=1, both explicitly asserted; baseline same fields were0/0. The offer itself may still dismiss on scroll by design; explicit F1 remains available.

Complete reading-region text exactly equals the synthetic anchor help, End reaches bottom (scroll636,client133,top503), screenshot `final/820-fr-200-last-line.png` opened and visually inspected; Escape closes and restores anchor focus. Secrets geometry remains valid: anchor top92/bottom124 inside scroller48..128, bottom navigation starts128. Zero JS errors. No CSS injection, source edit, server restart or customer/secret operation. Browser/profile context closed; parent server unchanged.

This final pass covers the two original F1 failures, not merely the old fourth-focus success. Pointer dismissal and short-help F1 remain protected by the existing unit suite; no redundant full-browser rerun claimed.
