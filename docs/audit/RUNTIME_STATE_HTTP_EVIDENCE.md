# Runtime state HTTP evidence

These observations supplement the live audit. They do not change its verdict,
filter console errors, retry requests, or modify application persistence.

## Missing runtime files

`browserHttpDiagnostics.events` retains fixed `fileTarget` categories and a
`workspaceReference` shape. Raw file paths, query values and workspace IDs are
not added. `canonical-shaped` is a syntactic observation, not proof that the
workspace exists or is ready. `multiple` means ambiguous repeated path inputs.
A missing root must not be waived as an optional package probe. Unknown targets
remain unknown.

## IDE state conflicts

`ideCasDiagnostics` observes existing GET/PUT responses in all four audit page
families. A conflict records whether numeric If-Match/ETag values were present.
It marks `acknowledged` only after the same page's successful PUT uses the
conflict version and receives a strictly newer ETag. Only requests begun after the conflict observation can acknowledge it. Only GETs begun after the acknowledgement can prove a subsequent read. Concurrent conflicts remain separate per writer. A matching GET is classified
relative to that acknowledged version. Navigation and a different page are
reported separately. A shared cohort is restricted to this audit's authenticated
project session. Another page cannot acknowledge the original writer's conflict.

No state bodies, header values, version values, tokens or identifiers are emitted.
The collector retains at most 64 conflict records and 64 corresponding private observations globally;
page handlers detach on close. Closed-page requests that cannot be observed remain
unconfirmed. Omitted records are counted.

A successful version acknowledgement does **not** prove that every local dirty
field survived merging. A later GET cannot acknowledge a PUT by itself. Missing
or weak ETags, absent retries, stale reads and later failures must not be promoted
to successful persistence. `laterRead` describes the last eligible observed GET, and
`laterFailure` remains true if a later failure from the same writer was observed.

## Snapshot upstream failures

`runtime-api-summary.json.snapshotFailures` projects existing Fastify error logs
before the raw log tail is truncated. It preserves only allowlisted manager error
categories and numeric upstream/manager HTTP statuses, plus completion status and
time. The list is capped at 60, keeping the first 30 and last 30 with total/omission counters. Missing error records are `unobserved`; arbitrary
codes are `other`. No error messages, stacks, headers, bodies or identities are
added. Existing failure counts remain unchanged.

A manager-request failure with upstream 404 is evidence of a missing manager
resource. Correlate its time with existing workspace lifecycle evidence before
attributing it to initial provisioning. Transport-unavailable, 401/403 and other
5xx responses are distinct; none is translated into an empty successful snapshot.

## Validation

The runtime workflow runs the CAS collector tests alongside browser-network
checks. Tests cover stale/missing versions, cross-page writers, subsequent reads,
closed pages, fixed classifications, caps, snapshot error priority, and the actual
audit/collector wiring. The snapshot source contract checks the existing API error
constructor/logger. No new user-facing strings or locale entries are introduced.
