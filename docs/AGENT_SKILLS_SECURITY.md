# Agent Skills: compatibility and security operations

E-Code implements the open [Agent Skills specification](https://agentskills.io/specification). Project skills live at:

```text
.agents/skills/<skill-name>/SKILL.md
```

`SKILL.md` must contain YAML frontmatter with `name` and `description`. The optional standard fields are `license`, `compatibility`, `metadata`, and `allowed-tools`. `allowed-tools` is descriptive and experimental; E-Code never treats it as permission to bypass normal tool approval, RBAC, sandboxing, or organization policy.

## Progressive disclosure

The model-visible context is intentionally split into three tiers:

1. Discovery loads only each approved skill's name, description, and location.
2. Activation loads the selected `SKILL.md` body only after the model calls the bounded `activate_skill` tool.
3. Resources under `scripts/`, `references/`, and `assets/` are read individually through a path-confined resource tool.

The server still parses and scans source bytes to enforce the specification and security policy, but skill bodies and resources are never concatenated into every conversation's initial system prompt. Disabled, quarantined, rejected, revoked, stale, and byte-mismatched managed skills are excluded even at the metadata tier.

## Threat model

A skill is untrusted executable guidance. Treat prompt text, scripts, references, assets, repository metadata, and update mechanisms as a software supply-chain boundary. Relevant attacks include:

- instructions to ignore system or user policy;
- secret, token, source-code, or connector-data exfiltration;
- destructive shell, persistence, malware download, and reverse-shell instructions;
- fake role, tool-call, XML, or Markdown boundary injection;
- obfuscated payloads, bidirectional Unicode controls, and encoded commands;
- symlink and path traversal outside the skill root;
- repository compromise or mutable-branch replacement after review;
- name collision, shadowing, typosquatting, oversized archives, and decompression bombs;
- using `allowed-tools` as an implicit privilege grant.

No static or model-based scan can prove a skill safe. Approval means the reviewed immutable artifact passed the configured controls; it does not weaken runtime guardrails.

## Audit lifecycle

External artifacts follow this implemented state machine:

```text
IMPORT -> IMMUTABLE FETCH -> SPEC VALIDATION -> STATIC SCAN
       -> QUARANTINED -> HUMAN REVIEW -> APPROVED <-> DISABLED
       -> BLOCKED/REJECTED                    |
                                              +-> REVOKED
```

An artifact is identified by source URL, immutable commit SHA, skill subpath, and SHA-256 digest. A digest change creates a new quarantined artifact; approval never follows a moving branch automatically.

High/critical injection, exfiltration, destructive-action, obfuscation, invalid-specification, incomplete-scan, binary-content, activation-budget, and unsafe-path results cannot be manually overridden. Eligible artifacts remain quarantined until an organization security administrator reviews every UTF-8 text file in the immutable bundle, the findings, inventory, source commit, and digest; checks the explicit untrusted-content acknowledgement; and records a reason.

The persisted audit report records:

- parsed manifest and specification diagnostics;
- source, commit, subpath, digest, file inventory, and license;
- requested tools/capabilities without granting them;
- prompt-injection, exfiltration, destructive-action, network-access, obfuscation, and bidirectional-control findings;
- scanner name/schema, timestamps, and reviewers;
- approval, rejection, or revocation reason.

Only approved artifacts may be materialized from the catalogue. Each artifact, decision, listing, detail read, and runtime approval is bound to one exact workspace; omitting the workspace scope is rejected. At chat time the server reloads the Skills subtree from the authorized workspace agent and ignores the browser-supplied `FileMap` for security decisions. This snapshot uses the workspace agent's no-follow contract: any symbolic-link entry rejects the complete enumeration; every user-controlled path component is checked with `lstat`; the final regular file is opened with `O_NOFOLLOW`; device/inode identity is checked before and after opening; bytes are read through that bounded descriptor; and any path or file mutation fails the whole Skills context closed. Consequently neither `SKILL.md` nor a resource can alias another workspace file through a final or ancestor symlink, including during a path-swap race, and an added link cannot disappear from the exact-manifest comparison.

The runtime accepts a reviewed medium-risk skill only while every installed file and its reserved ownership marker match the server-provided project/workspace approval manifest. Runtime policy materialization is canonical by exact skill name and returns at most one policy per name. Quarantined, blocked, disabled, and revoked history is represented by compact metadata-only tombstones; those states never load immutable bundles. Only the unique `approved + enabled` artifact loads one bundle to produce a minimal path/length/SHA-256 manifest. Bundle reads are sequential and stop as soon as an aggregate limit is reached, so many active artifacts cannot accumulate decoded bodies in memory. Materialization is explicitly bounded to 4,096 policy-history records, 512 distinct names, 512 manifest files total across active skills, and 10 MiB total active skill plus marker bytes; truncation, duplicate active rows, scope drift, corrupt stored lengths, and excess volume fail closed. The LLM consumer independently re-validates the same aggregate manifest limits. Persisted tombstones ensure deleting a marker cannot reclassify a previously managed skill as local. A changed, added, or removed byte, a missing marker, an API outage, or an approval from another workspace excludes that managed skill. A fresh high/critical scan always wins over a persisted decision.

## Import controls

- Fetch only HTTPS sources from an explicit host allowlist.
- Resolve the requested ref to an immutable commit before download.
- Reject redirects to a different host, credentials in URLs, traversal, symlinks (at import and again on every runtime path component), devices, and files outside the selected skill root.
- Enforce bounded file count, depth, individual size, and total expanded size.
- Enforce one 30-second import deadline, request-disconnect cancellation, and at most four concurrent GitHub file reads.
- Require a file named exactly `SKILL.md`; never substitute `README.md` or `AGENTS.md`.
- Require the frontmatter `name` to match the parent directory.
- Block external instruction bodies above the open standard's recommended ~5,000-token activation budget.
- Block every binary external resource unless a future malware-analysis and human-review pipeline can inspect it safely.
- Store and display provenance before approval.
- Install the exact audited folder under `.agents/skills/<name>/`.
- Write the deterministic `.agents/.vibecore/managed-skills/<name>.json` ownership marker first, resources next, and `SKILL.md` last; remove only bytes owned by that same artifact.
- Rate-limit remote imports per bearer/IP bucket (five per minute by default) to bound GitHub and audit cost.

Custom GitHub-folder imports are public-only and are always fetched anonymously. The platform never falls back to a broad `GITHUB_TOKEN`, so a project writer cannot use the import endpoint as an oracle for private repositories. The fixed reference catalogue may use the dedicated `GITHUB_SKILLS_AUDIT_TOKEN`; that credential must be restricted to public read access and must not be shared with unrelated GitHub integrations. Private repository import is intentionally unsupported until a repository-specific connector and consent boundary are implemented.

## Execution boundary

Import and audit never execute a skill's scripts, dependencies, or commands. Binary files are inventoried and hashed for evidence, but every binary makes an external artifact ineligible for approval; a text reviewer cannot establish what executable behavior it contains. After approval, text scripts and assets remain ordinary project resources: using them still goes through the existing agent tool authorization, sandbox, network, secret, RBAC, and user-confirmation controls. `allowed-tools` never grants a permission.

## Runtime and audit logging

The append-only artifact trail records import, approval, rejection, enable/disable, and revocation with actor, project, exact artifact digest, state transition, reason, and timestamp. It is exposed with immutable `(createdAt, id)` keyset pagination so an old event cannot disappear behind a fixed result cap. The platform audit log records the same administrative actions. Reports may retain only short, bounded, secret-redacted excerpts that explain a finding; neither log stores complete `SKILL.md` bodies, resource contents, credentials, or project files.

Import requires project and workspace write access. Approval, rejection, enable/disable, and revocation additionally require organization `security:manage` and workspace write access. Listing and inspecting require the exact workspace plus read access. Disabling or revoking removes only the exact managed folder and marker without deleting the immutable audit artifact.

## Incident response

For a suspected malicious skill:

1. Revoke the artifact digest so its installed folder is removed from the selected workspace.
2. Identify projects, administrative decisions, and actors from the artifact and platform audit logs; correlate with normal agent/tool telemetry when available.
3. Rotate any credential that the skill could have reached; do not rely on finding a confirmed exfiltration event.
4. Preserve the immutable artifact and audit report as incident evidence.
5. Remove or replace the project folder, then re-run project security and dependency scans.
6. Publish a new artifact only after a fresh audit; never re-approve the old digest.
