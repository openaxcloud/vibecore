# Restore takeover / durable acknowledgement serialization

Base: main `45890244b92996e8bfa94cf321e4444285905922` (PR914).

## Fault and correction

`resume()` previously read `pendingFenceTokens` before acquiring its write lock.
An acknowledgement may remove A while B-to-C takeover waits. The takeover CAS
checks owner and phase, neither of which an acknowledgement changes, and could
therefore persist its stale snapshot and resurrect A's already-cleared debt.
This is a recovery/liveness failure, not permission to bypass exclusion.

Takeover now locks the journal row before reading the debt, using the same row
lock as `acknowledgeFence()`. The existing owner/phase CAS remains. No lease or
timeout permits recovery, and outstanding debt still blocks cutover.

Two real PostgreSQL tests use independent backend connections and observed
lock waits, not timers as correctness assertions: ACK-before-takeover preserves
the ACK; takeover-before-ACK rejects the obsolete owner's ACK and retains debt.
The existing required disposable PostgreSQL CI suite includes these tests.

## Verification

- Independent static review: no blockers, no reverse lock ordering identified.
- Local coordinator + route suites: 43 tests passed.
- Local API strict TypeScript build passed.
- PostgreSQL concurrency execution: pending required CI; no local PG/Docker here.
- Repository lint and focused strict test typecheck recorded in PR validation.

## Deliberate limits

This fixes the durable journal; it does not provide production `fenceAttempt`.
The existing participating consumer closes only its own pools. PostgreSQL
backends can outlive a dead client process. Exhaustive membership/admission for
API SQL, runtime processes and deployed application consumers, plus database-side
drain and external-effect fencing, remain required before live cutover.
The production restore coordinator is still absent and the 503 safety guard is
unchanged. No cloud/production action or migration is part of this patch.
