# BUG-AGENT-EDIT-TRUNCATION — live proof after deploy

Fix commit 0e0017ae (`withoutTrailingCloseTagPrefix`) is LIVE in prod: the web tier
runs SHA 6d57a401 and `app/lib/runtime/message-parser.ts` is **byte-identical**
between that deployed SHA and HEAD:

```
git show 6d57a401:app/lib/runtime/message-parser.ts | shasum -a256  -> 36b3ec18752bd945…
git show HEAD:app/lib/runtime/message-parser.ts       | shasum -a256  -> 36b3ec18752bd945…
git diff 6d57a401 -- app/lib/runtime/message-parser.ts                -> 0 lines
```

So the parser exercised below is exactly the code running in production.

## Deterministic repro against the deployed parser
`app/lib/runtime/message-parser.truncation-live.spec.ts` streams an agent in-place
edit whose model output is TRUNCATED mid-tag (stops right after `});\n</bo`, a
partial `</boltAction>`), so `onActionClose` never fires — the exact 2/2 scenario.

Result (vitest, 2/2 PASS):
- The last streamed/autosaved content is **valid JavaScript** (`new Function(saved)`
  does not throw), with `});` and `setup(server);` preserved and **no `</bo`**.
- Control: the pre-fix value (`fileBody + '</bo'`) throws `Unexpected token '<'` —
  the exact data-loss failure the fix prevents.
- The body includes accents/CJK/emoji (`café ☕ 日本語 🚀`) to prove the ASCII close
  tag is trimmed without splitting a multi-byte UTF-8 character.

```
 ✓ app/lib/runtime/message-parser.truncation-live.spec.ts (2 tests)
   ✓ never persists a stray "</bo" and keeps the file valid JS
   ✓ control: WITHOUT the hold-back, the same truncation yields invalid JS
```

Conclusion: an in-place agent edit whose model output truncates mid-tag no longer
corrupts the file in the deployed build.
