# Cold-start (Image Streaming) + dev/prod DB — ready-to-execute plans

Prepared so each is immediate on GO. Owner: runtime/deploy lane.

## 1. GKE Image Streaming — ready to run

**Measured baseline (live, 2026-07-13):** pod on a WARM gvisor node with the agent
image cached = PodScheduled→Ready **~17 s**. The 1–2 min only appears when the
`sandbox-gvisor` pool is saturated (autoscaler adds a node: ~60–120 s) **and** the
new node must pull the `workspace-agent` image (~30–60 s) before the pod starts.
Pool today: min=2/zone (4 nodes warm), max=6, `e2-standard-4`.

**What Image Streaming changes:** GKE mounts the image over a network filesystem
and starts the container as soon as the files it *actually reads* are available,
lazy-loading the rest. The full-image-pull wait on a fresh node effectively
disappears.

**Expected gain (cold-start):**
- Warm-node start (the common case): **no change** — image already cached, already ~17 s.
- Scale-up start (pool saturated → fresh node): image-pull component removed →
  cold-start drops from ~**150 s** (node ~90 s + pull ~45 s + ready ~17 s) to ~**107 s**
  (node ~90 s + ready ~17 s). **~30–60 s saved** on exactly the worst-case starts users feel.
- Also removes the first-pod pull penalty after any new `workspace-agent` image tag.

**Cost:** $0 (free GKE feature). Prereqs already met: images on Artifact Registry.

**Prereq to enable once (idempotent):**
```
gcloud services enable containerfilesystem.googleapis.com --project=vibecore-495216
```

**GO command (single):**
```
gcloud container node-pools update sandbox-gvisor \
  --cluster=vibecore-prod-app --region=europe-west9 --project=vibecore-495216 \
  --enable-image-streaming
```
⚠️ This recreates the pool's nodes (rolling). Workspaces on those nodes restart —
their pods reschedule; **PVCs survive** (data safe). Schedule in a low-traffic
window. Verify after: `gcloud container node-pools describe sandbox-gvisor … --format='value(config.gcfsConfig.enabled)'` → `True`; then time a fresh provision and confirm PodScheduled→Ready ≈ warm-node baseline.

## 2. dev/prod database separation — plan (blocked on prerequisite)

**Today:** one managed CNPG database per project; its `DATABASE_URL` is injected
into the **workspace (dev)** pod as a secret. There is **no** prod DB because
deploys are **static-only** (`deploy-workspace-build.ts` rejects a server/API/DB
app with `NOT_STATIC_SITE`) — a static site has no server process to open a DB
connection, so "the deployed app reaches the prod DB" has no consumer yet.

**Prerequisite (step 0):** build a **server/full-stack deploy path** (container
build → run on Cloud Run or a deploy pod → ingress). Until this exists, a prod DB
is dead infrastructure.

**Plan once step 0 exists:**
1. **Two CNPG clusters per project**, keyed by environment: reuse the existing
   `/database` provisioning (see [[project_db_project_binding_fix]]) with an
   `env` discriminator (`dev` = today's cluster, `prod` = new).
2. **Env-scoped `DATABASE_URL`**: dev workspace keeps the dev URL (unchanged); the
   deployed prod app gets the **prod** URL injected at deploy time (deploy env, not
   the workspace secret set).
3. **Deployed-app connectivity (the untested gap):** the prod runtime must have
   egress to the `project-databases` namespace — add a NetworkPolicy allowing
   deploy-runtime → prod CNPG, then **prove it live**: open a real connection from
   the deployed app and run `SELECT 1`.
4. **Schema parity:** run migrations against both; a first-deploy "promote" step
   copies **schema** (not data) dev→prod.

**Recommendation:** don't build the DB split before step 0 — it would be untestable
dead code. Confirm whether to build the server-deploy path first.
