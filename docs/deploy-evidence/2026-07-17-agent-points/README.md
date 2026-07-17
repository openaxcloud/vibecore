# Agent points (Part 2) — honest status 2026-07-17

Prove-for-real assessment of the 5 open AGM points. One closable via API is CLOSED
live; the other four require either the (currently throttled) authenticated
browser UI or an entitled account / a real agent generation — stated plainly, not
faked.

## AGM-9 — publish a v2 of the routing card  ✅ CLOSED LIVE
`POST /admin/agent-routing` (platform-admin + reauth) with a content-IDENTICAL
draft of the active card (so live routing behavior is unchanged):
```
→ {"published":true,"version":2,"effectiveFrom":"2026-07-17T11:40:42.909Z"}
GET /admin/agent-routing → active version now: 2
```
The monotonic-version publish path that "was never executed" is now executed and
verified live (v1 → v2). Content identical (lite→haiku, economy→opus-4-8,
power→fable-5, high-effort→fable-5, turbo→gpt-5.6-sol, classifier→haiku), so no
routing change — only the version/effectiveFrom advance, which is the proof.

## AGM-10 — real classifier call  ⬜ NOT CLOSED (needs a real agent generation)
`GET /admin/agent-routing/calls` shows 7 recorded calls (economy 6, lite 1) and
**0 classifier calls** — the `classifier` line has never been exercised in prod.
Triggering a REAL classifier call requires a full agent generation that routes
through the classifier line (the chat/agent-run path, real LLM cost), or the
authenticated IDE — both blocked here (see the browser-throttling note in the D5
README). `POST /admin/agent-routing/simulate` only replays PAST volume; it is not
a real classifier call, so it does not count. Open.

## AGM-4 — ⌘⇧I shortcut + Lite guardrail text  ⬜ NOT CLOSED (pure UI)
Requires driving the authenticated IDE (send the ⌘⇧I keystroke, capture the Lite
guardrail copy). Blocked by the same prod browser-automation throttling that D5
targets a dedicated/staging env to avoid. Closable on staging via the harness.

## AGM-5 — High-effort escalation + "+0 credit (no escalation needed)"  ⬜ NOT CLOSED (entitlement)
Explicitly unavailable on the free plan — needs an account with the High-effort
entitlement. The dedicated E2E user is free-tier; proving this needs an entitled
test account (or a fixture that grants the entitlement) plus the UI. Open.

## AGM-11 — nudge to Power when looping in Economy, ≤ once per project  ⬜ NOT CLOSED (client UI)
The nudge is client-side (`app/components/chat/Chat.client.tsx`, keyed on
`localStorage['vibecore:agent-mode-nudge:<projectId>']`, fired at most once per
project after several Economy sends). Proving it requires the authenticated IDE +
multiple Economy sends on one project — blocked by browser throttling; closable on
staging via the harness.

## Summary
- CLOSED: AGM-9 (v2 routing card published live).
- OPEN, with concrete blockers: AGM-4 (UI), AGM-5 (entitlement + UI), AGM-10 (real
  agent generation), AGM-11 (client UI). All four are closable via the D5 harness
  once it runs against a dedicated/staging env that doesn't throttle automation,
  plus an entitled account for AGM-5. Not faked.
