# BUG-CI-002 — live proof: runtime-tier sequential build does NOT freeze

Build `07c99732-e76d-4a76-bca3-c01c3fd8deab` — config `infra/cloudbuild/runtime-tier.yaml` — status **SUCCESS**
- SHA `58c2a05eb8` (origin/main `58c2a05e`, Merge PR #56)
- createTime 2026-07-24T07:14:50.896941327Z
- start 2026-07-24T07:15:32.589338294Z  finish 2026-07-24T07:20:15.203933Z
- logUrl https://console.cloud.google.com/cloud-build/builds;region=europe-west9/07c99732-e76d-4a76-bca3-c01c3fd8deab?project=267592214411

Per-step timing (proves strict serialization: each step starts exactly when the previous ends — the `waitFor` chain build-deps→api→workspace-manager→preview-proxy→ai-gateway→worker→screenshotter):

| step | status | start | end | dur |
|---|---|---|---|---|
| prime-cache | SUCCESS | 07:15:41 | 07:18:56 | 195s |
| build-deps | SUCCESS | 07:18:56 | 07:19:18 | 21s |
| build-api | SUCCESS | 07:19:18 | 07:19:20 | 1s |
| build-workspace-manager | SUCCESS | 07:19:20 | 07:19:21 | 1s |
| build-preview-proxy | SUCCESS | 07:19:21 | 07:19:23 | 1s |
| build-ai-gateway | SUCCESS | 07:19:23 | 07:19:25 | 1s |
| build-worker | SUCCESS | 07:19:25 | 07:19:26 | 1s |
| build-screenshotter | SUCCESS | 07:19:26 | 07:19:28 | 1s |
| scan-images | SUCCESS | 07:19:28 | 07:20:01 | 33s |

**Total wall 282s (4m42s). strictly_sequential_no_overlap = True. No stall — no step exceeded its predecessor's completion, all SUCCESS.**

Contrast: the pre-fix failure (BUG-CI-002 original repro, build `ded1fb17-...`) hung in WORKING with the six service builds running in parallel on the 8 GB worker. The serialized DAG here dispatched each service build only after the previous finished, and the whole tier completed cleanly.
