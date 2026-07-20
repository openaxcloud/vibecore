# Live proof — invitation `tokenHash` leak fixed in prod (2026-07-19)

**Fix:** PR #6 — `GET /orgs/:orgId/invitations` now strips `tokenHash`, like the other 4 invitation endpoints. Merged to main as `25b5580bcd`.

**Method:** registered a real QA user + org on prod (`api.e-code.ai`), created one invitation, then called `GET /orgs/:orgId/invitations` against the SAME org/invite/token before and after the rollout.

| | Image served by api pods | `tokenHash` in response |
|---|---|---|
| BEFORE | `api:7d2d2db82c` (commit before the fix) | **PRESENT** (`3d6e2a7c…`) — leak live |
| AFTER  | `api:25b5580bcd` (the fix, helm rev 869, 5/5 pods) | **ABSENT** (3 calls, different pods) |

- `BEFORE-image-7d2d2db8-leak-present.json` — raw body, tokenHash present.
- `AFTER-image-25b5580b-tokenhash-absent.json` — raw body ×3, tokenHash absent.

Proof is at the pod level: verified all api pods run `25b5580b` (0 on the old image) before the AFTER capture, and hit 3 pods to rule out a stale replica.
