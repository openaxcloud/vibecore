# Automatic deployment target freshness

The continuous deployment workflow keeps every build and required check bound to
one exact commit. A queued push must not later overwrite a newer release merely
because its own older commit also has green checks.

Two checks compare the complete target-to-main tree diff with the exact
`paths-ignore` used by this workflow:

1. At the end of the release gate, before the job with cloud credentials.
2. Immediately before the first production mutation, the staged migration and
   manager upgrade. This covers a main advance during the long image builds.

A newer deployable change fails closed. Updates confined to the officially
ignored paths, including docs-only commits that trigger no deployment, are
allowed. The workflow never silently switches to a newer commit:
that would build or deploy a different commit from the one whose checks passed.
Git transport errors, invalid commits, lost ancestry and failed diff commands
also fail closed. The complete NUL-delimited Git diff avoids the 300-file REST
comparison limit and accounts for deletions and both sides of renames. The
credential added by this guard is scoped to one fetch command; the guard does
not persist it or change any credential already saved by checkout.
A command-scoped empty header resets any Authorization saved by checkout before
adding exactly one scoped header; real local HTTP tests cover this behavior. These checks do not change the required CI, image signatures,
vulnerability gates, readiness checks, rollout waits, or rollback conditions.

## Intentional redeploys

The existing `workflow_dispatch` path with a nonempty, exact `target_sha` remains
an explicit selection of that commit, even if main has since advanced. The
resolved SHA must equal the input. Each guard fetches main and checks fresh
ancestry even for an explicit target; a force-push removing that target or a
transport failure still refuses. Only the material diff check is bypassed.
The existing checks for commit existence,
ancestry on main, main's workflow graph, exact-SHA required checks, and image
provenance still apply. A default dispatch without a target has the same freshness
requirement as an automatic push. A push cannot claim the explicit override.

The freshness check is inline in the workflow, rather than loaded from the target
checkout. This preserves intentional redeploys of historical commits that predate
the guard. The separate manual and break-glass workflows are unchanged.

## Operational limits

- A failure before staging does not set `STAGED_UPGRADE_STARTED` or
  `UPGRADE_APPLIED`, so it does not trigger a production rollback by itself.
- Once staging starts, a newer push does not interrupt the rollout or its rollback.
  The existing concurrency group remains non-cancelling. Readiness and failure
  handling continue to completion.
- The Git read and Helm are not an atomic transaction. Main can advance after the
  final read. Serialization prevents two runs of this continuous workflow from
  mutating production concurrently; it is not a lock shared with every other
  deployment path.
- Path classification is pinned by regression tests to the actual workflow
  trigger. Changing the trigger requires reviewing the guard mapping. This is
  intentionally conservative for every path not officially ignored.
- New workflow code cannot change an already-created old run's graph. Any old
  queued deploy without this guard still requires a separate, targeted operational
  decision. Do not cancel a build or rollout blindly.
- Green checks and a candidate image manifest are not evidence of deployed code.
  Confirm migrations, manager readiness, observed image IDs, and health checks in
  the actual deployment evidence.

## Regression coverage

`scripts/release-gate/deployment-target-freshness.spec.mjs` executes the actual
workflow shell using Bash and real Git repositories with a locally redirected
GitHub fetch transport. It covers
materially stale/current pushes, docs-only updates, more than 300 changed files,
default and explicit dispatches, shallow checkout and transport/diff failures,
guard ordering, unchanged rollback flags, and a real local Git ancestry check.
The tests do not claim a live deployment or a successful production rollback.
