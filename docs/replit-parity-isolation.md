# Replit-parity: workspace isolation roadmap

Goal: make vibecore's per-workspace isolation model match (and where possible exceed)
Replit's. This doc tracks the gaps found in the isolation audit and the concrete work
to close each one.

## Where we already match or beat Replit

| Dimension | Replit | vibecore | Status |
|---|---|---|---|
| Runtime sandbox | hardened container (runc) → migrating to microVM | Pod + **gVisor** (`runtimeClassName: gvisor`) | ✅ at/above |
| Hardening | seccomp-bpf | `runAsNonRoot`, `drop ALL` caps, `seccomp RuntimeDefault`, no SA token, Kyverno admission | ✅ at/above |
| Egress | TCP/UDP w/ some blocking | **DNS + HTTPS only**, metadata + RFC1918 blocked (`networkpolicies.yaml`) | ✅ stricter |
| Per-workspace storage | btrfs+margarine over GCS | 1 PVC (RWO) per workspace | ⚠️ see #4 |
| Secrets | env + redaction | AES-256-GCM at rest + per-workspace K8s Secret | ✅ stronger |
| FS containment | basic | lexical + symlink-aware (`workspace-agent`) | ✅ stronger |

## Gaps and work items

### ✅ #3 — Per-workspace agent-token key derivation (DONE)
**Problem:** a single global `WORKSPACE_AGENT_TOKEN_SECRET` was injected into every
workspace pod *and* used to sign every workspace's tokens. A tenant who exfiltrated
that secret from their own pod could forge a valid agent token for **any** workspace.

**Fix:** `deriveWorkspaceSecret(root, workspaceId)` (HKDF-SHA256) in
`@vibecore/workspace-sdk`. workspace-manager now injects only the *derived* per-workspace
key into each pod and signs that workspace's tokens with it. The root never leaves
workspace-manager and cannot be recovered from a derived key.

- Code: `packages/workspace-sdk/src/index.ts`, `services/workspace-manager/src/manager.ts`
- Tests: `packages/workspace-sdk/src/index.spec.ts`, `services/workspace-manager/src/manager.spec.ts`
- **Rollout note:** pods provisioned by the *previous* manager version hold the root
  secret and will reject tokens signed with the derived key until they are
  (re)provisioned. Workspaces restart frequently (idle GC stop ≤ 30m) and tokens are
  short-lived, so this self-heals; no data migration is required. Roll out manager +
  trigger a fleet pod refresh, or accept the ≤30m self-heal window.

### #1 — Enforce per-tenant preview auth by default (DECISION NEEDED)
**Problem:** preview routing (`<workspaceId>-<port>.preview.e-code.ai`) does **not**
require per-tenant auth unless `PREVIEW_PROXY_ENFORCE_TENANT=true`. Default is OFF
(backward-compat). Anyone who learns a `workspaceId` can reach that workspace's preview.

**Fix already present but dark-launched:** signed `vc_preview` cookie bound to `orgId`,
verified in `services/preview-proxy/src/app.ts`, ownership re-checked by workspace-manager.

**Blocking item:** `PREVIEW_TENANT_SECRET` is **not provisioned in any infra/helm/env
file today.** Flipping the default ON without wiring the secret crashes preview-proxy at
boot (`PREVIEW_TENANT_SECRET is required ...`). Steps to close:
1. Add `PREVIEW_TENANT_SECRET` to the secret manifests (helm `platform` + preview-proxy
   deployment env) and to `.env.example` / `.env.production.example`.
2. Ensure the web app sets the `vc_preview` cookie (HMAC over the user's `orgId`) on IDE
   load, with the same secret.
3. Flip default: `enforceTenant = process.env.PREVIEW_PROXY_ENFORCE_TENANT !== 'false'`.
4. Add a preview-proxy test: foreign/absent cookie → 403; valid cookie for org A cannot
   reach org B's workspace preview.

### #2 — Cross-org isolation test coverage (TODO)
Today `api.spec.ts` proves cross-org denial on a single endpoint (`GET /projects/:id`
→ 404). Add a table-driven test that boots two orgs and asserts 404/403 from the foreign
org on **every** project/workspace sub-resource: workspaces list/create, deployments,
files/IDE state, git ops, terminals, env/secrets, MCP, agent memory. Also add a
rendered-NetworkPolicy unit test (default-deny + metadata/RFC1918 block) so an accidental
loosening is caught in CI rather than in production.

### #4 — Decouple compute from storage (DESIGN — multi-week, cost decision)
**The core architectural difference from Replit.** Replit stores a Repl's filesystem in
**GCS** (btrfs → network block device → "margarine" servers translating 16 MB blocks
↔ GCS objects). Any conman VM can pick up any Repl → fast cold-start, **instant
fork/clone**, preemptible/ephemeral compute, scale to tens of thousands.

vibecore binds a workspace to a **ReadWriteOnce PVC**, so the workspace is pinned to
wherever the PVC mounts: slower cold-start, no instant fork, rigid scheduling/preemption.

**Options (need a cost + ops decision before building):**
- **A. Object-storage snapshot/restore:** on stop, snapshot `/workspace` → GCS tarball;
  on start, restore into an ephemeral volume. Simple; enables fork (copy snapshot) and
  ephemeral compute. Cold-start cost = restore time. Closest quick win.
- **B. Network-backed FS (margarine-equivalent):** GCS-backed block device with local
  cache. Highest fidelity to Replit, but a major infra build + operational burden.
- **C. CSI driver with RWX + snapshots** (e.g. cloud filestore): managed, less custom
  code, higher $/GB.

Recommendation: start with **A** (snapshot/restore) to unlock fork + ephemeral compute
with bounded effort, keep PVC as the hot path, and only pursue **B** if cold-start
latency at scale demands it.

## Suggested order
1. #1 preview enforcement (small; closes a real cross-tenant hole) — needs infra secret.
2. #2 isolation tests (safe; locks the invariants).
3. #4 option A snapshot/restore (unlocks Replit-style fork + ephemeral compute).
4. #4 option B only if scale requires it.
