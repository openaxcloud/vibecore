# Project management for E-Code

E-Code tracks long-term product direction, mid-term capabilities, and short-term improvements in the
[`openaxcloud/vibecore` issue tracker](https://github.com/openaxcloud/vibecore/issues). Pull requests provide the
implementation history for shipped features.

## Strategic epics (long-term)

Strategic epics define the durable areas in which E-Code evolves. They let maintainers communicate priorities, group
related work, and explain why the project invests in a capability.

Find active epics in the
[`epic` issue view](https://github.com/openaxcloud/vibecore/issues?q=is%3Aissue+label%3Aepic).

What's the benefit / purpose of epics?

1. Prioritization

Maintainers use epics to compare product needs, identify the work that advances each outcome, and keep the near-term
plan visible in the issue tracker.

2. Grouping of features

By linking features with epics, we can keep them together and document _why_ we invest work into a particular thing.

## Features (mid-term)

Feature issues describe the user outcome, constraints, and acceptance criteria. Contributors retain flexibility in the
implementation as long as it integrates with the existing architecture and satisfies the repository quality gates.

## PRs as materialized features (short-term)

Open a draft pull request early when architecture or product feedback would reduce rework. Link the relevant issue,
describe the approach and validation evidence, and coordinate before duplicating an active implementation.

## PRs as change log

Once a pull request is merged, its commit and description become part of the E-Code change history. Keep the summary,
test evidence, and contributor attribution accurate so the history remains useful.
