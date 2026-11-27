# Reseed orphan-directory preservation

Base: `3f5e32caffb7327200f45dd50152dc15863c676f`.

## Defect and policy

An orphan directory used to be deleted recursively without examining its children.
This also deleted nested preserved lockfiles and descendants omitted from runtime
listings, including `node_modules` and `.git`. The old nested preservation test
covered only a parent that also contained an archive entry.

Reseeding now deletes obsolete visible **files**, never directories. Orphan and
empty directory shells intentionally remain. This preserves hidden descendants
without pretending the listing proves their absence. Visible stale source files
still disappear, so ordinary source-file renames do not leave ghost files.

An archive file replacing an existing directory is refused during read-only
planning, before preview stop, deletion or import. A preserved lockfile cannot be
replaced by an archive directory either. An ordinary obsolete file can still be
removed to make room for an archive directory. Preservation checks also cover
protected ancestor names in flattened listings.

This changes deletion policy, not archive contents: an explicitly archived file
can still be overwritten by the normal import. Concurrent writers, symlink races,
API durable deletion effects and partial failures during a valid import remain
outside this fix. There is no atomic-import guarantee or Aster recovery claim.

## Validation

The exact-base existing Vitest suite plus regressions failed 8 of 39 cases before
the fix and passes all 39 after it. The real disposable-filesystem test runs the
actual reseed orchestration with ZIP input and a filesystem adapter. It verifies
unchanged bytes of nested lockfiles and hidden dependency/VCS sentinels, deletion
of the obsolete source leaf, and replacement of the canonical file. The adapter
uses recursive Node `rm`, matching the workspace-agent deletion primitive. This
is not an HTTP workspace-agent, Kubernetes or production browser test.

A focused strict TypeScript check uses the repository's actual runtime contract.
The test harness uses Vitest 3.2.6 and JSZip 3.10.1 with a minimal Node-only config;
it does not run global app setup or the full monorepo build. Full repository CI,
service-path and disposable-pod browser checks are required before delivery.
