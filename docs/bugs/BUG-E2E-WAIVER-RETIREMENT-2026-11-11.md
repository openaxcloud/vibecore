---
id: BUG-E2E-WAIVER-RETIREMENT-2026-11-11
---

# Retire the expired Production E2E failure exemptions

## Observed failure

[Production E2E run 43070324828](https://github.com/openaxcloud/vibecore/actions/runs/43070324828)
checked merge commit `39191c6cc93caf49f966b287add269937ca20fcf`, combining PR #893 head
`0f9b2ae8470412ddf243b249a06c49ab9cf2fee5` with main `af0ea860e8e7ca3c5cc6231143cec927f855ec97`.
All four shard reports arrived. The required `Playwright local stack` job failed on
the exemption policy's 2026-11-04 expiry before evaluating the actual test outcomes.

## Change and boundaries

The policy file and its exception mechanism are removed, not renewed. Every
unexpected failure is blocking, including every formerly exempt test. There is
no policy path or environment option that can restore an exemption.

This is not a change to Playwright's existing retry, expected-failure or skip
semantics: a successful retry is still reported as flaky and accepted, an explicit
expected skip remains accepted, and a declared expected failure remains accepted.
Involuntary skips, absent attempts, interrupted execution, global errors, missing
reports and missing non-runtime spec coverage remain blocking. A failure or an
incomplete execution cannot be erased by a later successful report.

No assertion in the browser suite is changed. Shards, selectors, the `@runtime`
filter, timeouts, the required job name and release-check requirements are unchanged.

## Independent spec-discovery correction

The coverage scanner previously mistook the URL regular expression's `.test(...)`
in `preview-runtime.spec.ts` for another Playwright test declaration. All five
actual preview tests are tagged `@runtime`, and the production invocation excludes
them with `--grep-invert @runtime`. Excluding immediate member `.test(...)` calls
from declaration discovery corrects this false positive. Among the 100 exact-head
spec sources, only `preview-runtime.spec.ts` changes classification, from required
to runtime-only. Genuine untagged tests and mixed runtime/non-runtime files remain
required. The existing heuristic is not replaced with a broader parser here.

## Reproduction and verification

Run `node --test tests/guards/e2e-waiver-retirement-contracts.mjs tests/guards/e2e-spec-discovery-contracts.mjs`.
The two adjacent `.spec.ts` wrappers run these same contracts in normal Vitest CI;
the native Node contract filenames deliberately do not match Vitest's test glob.
Existing report-completeness and shard guards remain in place. The former assertion
that an executed failure can be waived is replaced with an assertion that it cannot.

The 28 direct Node contracts cover passing reports, all retained failure conditions,
unchanged skip/retry behavior, legacy policy injection and the scanner regression.
Running the combined gate on the four untouched CI reports rejects exactly six
unexpected cases: Logs reload, terminal-menu keyboard hydration, and security-scan
timeout/completed/failed/cancelled hydration. Coverage is 98 of 98 expected files,
with 564 reported test keys and no flakes. The browser failures must still be fixed.

For a gate-only positive control, copies of those reports with exactly those six
outcomes replaced by synthetic passing outcomes are accepted. This counterfactual
is not evidence of a passing browser run. Full application build, typecheck, lint
and remote CI on the composed commit remain required before merge or deployment.

## 📤 Dispatché

☑ 11/11/2026 — correctif proposé pour validation.

## 💻 Codé

☐ Non fusionné dans main ; correctif présent sur la branche de validation.

## ✅ Testé live

☐ Non certifié live ; les vérifications locales ci-dessus ne valent pas recette en conditions réelles.
