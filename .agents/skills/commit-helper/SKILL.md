---
name: commit-helper
description: Write clear Conventional Commits messages and split unrelated changes into separate commits. Use when the user is about to commit, asks how to phrase a commit, or has a working tree mixing unrelated edits.
license: MIT
allowed-tools:
  - Bash
  - Read
metadata:
  version: "1.0.0"
  author: E-Code
  homepage: https://agentskills.io/specification
---

# Commit Helper

Help the user land small, well-described commits.

## When this applies

Reach for this skill when the user is about to commit, asks you to write a commit
message, or the working tree mixes unrelated changes.

## How to write the message

Use the Conventional Commits format:

```
<type>(<optional scope>): <summary in the imperative, ≤ 72 chars>

<body: what changed and why, wrapped at 72 columns>
```

Common `type` values: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`,
`build`, `ci`. Keep the summary in the imperative mood ("add", not "added").

For the full type table and breaking-change footer rules, read
`references/conventional-commits.md` — load it only when you actually need the
detail, not on every commit.

## Splitting unrelated changes

If `git status` shows edits that belong to different concerns, stage and commit
them separately (`git add -p` to pick hunks). One commit should tell one story.

## What NOT to do

- Never amend or force-push a branch you do not own without asking.
- Never invent a scope the codebase does not use — match existing history.
