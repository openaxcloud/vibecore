# Conventional Commits — reference

A level-3 disclosure resource for the `commit-helper` skill. The agent loads this
only when it needs the full detail behind the SKILL.md summary.

## Type table

| Type       | Use for                                                        |
|------------|---------------------------------------------------------------|
| `feat`     | A new user-facing feature                                      |
| `fix`      | A bug fix                                                      |
| `docs`     | Documentation only                                            |
| `refactor` | A code change that neither fixes a bug nor adds a feature     |
| `perf`     | A change that improves performance                            |
| `test`     | Adding or correcting tests                                    |
| `build`    | Build system or dependency changes                           |
| `ci`       | CI configuration and scripts                                  |
| `chore`    | Anything else that does not modify src or test files         |

## Breaking changes

Signal a breaking change with a `!` after the type/scope AND a footer:

```
feat(api)!: remove deprecated /v1 endpoint

BREAKING CHANGE: clients must migrate to /v2 before the next release.
```

## Scope

The scope is an optional noun describing the section of the codebase, e.g.
`fix(auth): …`. Match scopes already used in `git log`; do not invent new ones.

## Body and footer

- Wrap the body at 72 columns.
- Explain *why*, not just *what* — the diff already shows what.
- Reference issues in the footer: `Refs: #123`.
