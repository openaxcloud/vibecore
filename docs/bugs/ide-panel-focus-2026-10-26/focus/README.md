# Mobile overlay keyboard focus through loading-shell replacement

Baseline main `798fa0f251dec690f81ebd11f0c43eae76c98ba6`: eight ordinary instrumented executions passed. Holding and releasing the real isolated GET ide-state then reproduced both defects without retries (2/2 failures): an open sheet lost its return target; closing before replacement focused the old button, which was then removed. Sanitized focus events and before screenshots are included.

The corrected compiled product passes all eight browser cases on the first attempt: four deterministic handoff cases at390/820 and the four existing Escape cases at390/1180. No original assertion was removed. Product and build hashes, exact results and limits are in `final-receipt.json`. After screenshots show the new live trigger receiving focus.

The fix retains only transient focus within project/workspace/window scope. It does not migrate menu query text. The provider drops focus on route scope changes, avoids stealing it from another connected control, and does not defer desktop focus into a later mobile resize. Nine focused unit tests include StrictMode, +N identity, one-shot restoration, scope isolation and clearing a stale opener. Independent review approved the final implementation.

The matrix and native Chromium zoom200% recipe are documented separately in `../qa`. These are isolated local browser tests, not authenticated production or hardware Safari validation. No DNS, client project, remote Git repository or provider deployment was changed.

## Frozen JSX guard compatibility

The initial PR head `a67a0fd46` failed the unchanged AST guard because composing the root ref changed the literal JSX ref attribute. The follow-up keeps the original JSX byte-for-byte and composes `ref` from `forwardedRef` outside the frozen section. No guard or expected hash changed. The final rebuilt product again passes 8/8 browser cases without retries in27.4s;7AST guards+9focus tests pass and independent review approves the reference lifecycle. See `ast-compatibility-receipt.json` for the current product/build hashes; `final-receipt.json` retains the earlier validation stage.
