# OPERATIONS_DR — disaster-recovery & single-points-of-failure

Living doc. One section per SPOF: what breaks, blast radius, current state, the fix + cost.

## SPOF-1 — The Nix store PV is ZONAL (europe-west9-a). ⚠️ TIME BOMB.

**What.** The shared read-only Nix toolchain store (`nix-store-v2`, gen-2; and `nix-store-spike`, gen-1) is an **80 GB pd-standard disk pinned to a single zone, europe-west9-a**. Its PersistentVolume carries `nodeAffinity: topology.kubernetes.io/zone in [europe-west9-a]`. Any pod that RO-mounts `/nix` (every Python/Go/Rust workspace, and — once nix becomes the default toolchain — potentially every workspace) can therefore ONLY schedule on a zone-a node.

**Blast radius.** If europe-west9-a is in stockout (no capacity, scale-up fails — this happened this week: `FailedScaleUp: GCE quota exceeded` in zone-a on 2026-07-15), then **every workspace that needs the Nix toolchain cannot schedule at all** — the whole Python/Go product surface goes down, even though zone-b nodes are healthy and free. This is not friction; it is a correlated regional-partial outage that takes out an entire language family.

**Why it exists.** The store was provisioned as a single zonal disk for the candidate spike; the gen-2 v2 store inherited the same shape. gVisor sandbox nodes span europe-west9-a AND -b, but the store lives only in -a, so mounting it collapses the schedulable set to one zone. A workspace's own file-PVC is `WaitForFirstConsumer`, so it co-binds to zone-a — and a workspace whose file-PVC already bound zone-b DEADLOCKS (can never mount the zone-a store); it must be recreated. (Observed live 2026-07-16 while proving PY-PREVIEW-01.)

**Current state.** Mounting `/nix` is gated per-project by `WORKSPACE_NIX_PROJECTS` (small blast radius today), but the productization goal is to make the Nix toolchain automatic for all Python/Go/etc. projects — which makes this SPOF critical the moment it ships.

**Fixes + cost (pick before shipping nix-by-default):**

| Option | How | $/mo | Ops cost | Verdict |
|---|---|---|---|---|
| **A. Per-zone replicas** | Snapshot the store disk, create an 80 GB pd-standard clone in europe-west9-b (and -c), one zonal RO PV per zone; the workspace mounts the PV in whatever zone it landed. | ~$3.2/zone (80 GB × ~$0.04/GB) → **~$6–10/mo for a+b(+c)** | Re-snapshot + re-clone on EVERY store generation bump (the catalog is signed & pinned, so bumps are deliberate — automatable in the store-build job). | ✅ Cheapest, immediate. Recommended stop-gap. |
| **B. Regional PD** | Recreate the store on a `pd-standard` **regional** disk (auto-replicated across 2 zones). | ~2× zonal ≈ **$6.4/mo** | Regional PD is built for single-writer HA; RO-many across >2 zones isn't its model. Limits to 2 zones. | 🟠 Marginal over A, less flexible. |
| **C. Store as an image layer (no PV)** | Deliver the store as a container image layer (or SOCI/Image-Streaming lazy layer) baked/streamed onto every node — **no PV, no zone affinity at all**. | node-local disk + registry storage only | Bigger change: store-build must produce an image; workspaces mount it via an image volume / init copy. Aligns with "the deployment IS the workspace, imaged". | ✅ Durable end-state. Do this as the Nix-v2 productization lands. |

**Recommendation.** Ship **Option A** (per-zone replicas, ~$10/mo, automate the clone in the store-build job) as the prerequisite for making Nix the default toolchain; move to **Option C** (imaged/streamed store) as the durable design. **Do NOT enable nix-by-default until at least A is in place** — otherwise the first zone-a stockout is a Python/Go outage.

**Owner action (Avi):** approve Option A now (trivial cost); schedule Option C with the Nix-v2 rollout.
