# Security remediation — `.env.production` in git history

**Status:** prevention shipped ✅ · rotation = **Avi's action** (checklist below) · history purge = **awaiting Avi's explicit GO** (not executed)

> **Values are never reproduced in this document — secrets are referred to by NAME only.**

---

## 1. Finding (what was actually exposed)

`.env.production` was committed to history and later removed:

| Commit | What happened to `.env.production` |
| --- | --- |
| `0487ed14` | added (env template) |
| `4ca535b9` | modified (env template) |
| `57f85761` "Prepare VibeCore platform for GitHub" | **removed** it before publishing |

**Current tree is clean:** only `.env.example` and `.env.production.example` are tracked (placeholder values like `your_..._here`); `.env.production` is git-ignored and absent.

**Severity — LOW / precautionary.** A value-shape audit of the historical blobs (performed without printing any value) found the committed `.env.production` held **empty values** for every credential-style key. The only two non-empty entries were **`VITE_GITLAB_URL`** (a URL) and **`VITE_GITLAB_TOKEN_TYPE`** (a token *type* label, e.g. "personal-access-token") — neither is a credential. **No real secret value was found in the git history.** This matches the earlier repo audit (public repo, placeholder-only env templates — non-incident).

Because there were no real values in history, **rotation is precautionary**: do it if any of these names were ever populated with a real value in *any* environment (local `.env.production`, CI, a teammate's machine). It is not an active credential-exposure incident.

### Variable NAMES that appeared in the historical template (names only)
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `COHERE_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `TOGETHER_API_KEY`, `HYPERBOLIC_API_KEY`, `OPENAI_LIKE_API_KEY`, `OPEN_ROUTER_API_KEY`, `XAI_API_KEY`, `HuggingFace_API_KEY`, `AWS_BEDROCK_CONFIG`, `VITE_GITHUB_ACCESS_TOKEN`, `VITE_GITLAB_ACCESS_TOKEN`, `VITE_VERCEL_ACCESS_TOKEN`, `VITE_NETLIFY_ACCESS_TOKEN`, `VITE_SUPABASE_ACCESS_TOKEN`, `VITE_SUPABASE_ANON_KEY`, plus non-secret config (`*_API_BASE_URL`, `VITE_GITLAB_URL`, `VITE_GITLAB_TOKEN_TYPE`, `VITE_LOG_LEVEL`, `DEFAULT_NUM_CTX`).

> Note: the platform has grown well beyond this template. The rotation checklist below also covers the **current** production secret surface (OAuth, Stripe, platform crypto secrets, workspace-agent token, SIEM/HMAC, SMTP), because those are the secrets that would actually matter if a real `.env.production` ever leaks — even though none is in git history today.

---

## 2. Prevention — SHIPPED in this change ✅

- **`.gitignore`** now ignores **every** `.env*` via a glob (`.env`, `.env.*`) with negations only for `!.env.example` and `!.env.production.example`. Previously it listed a few specific filenames, so a new variant (`.env.staging`, `.env.development`, …) could slip through.
- **`git rm --cached`** — nothing to do: no real `.env*` file is currently tracked (verified; only the two `*.example` templates are).
- **Secret templates** — `.env.example` and `.env.production.example` are already comprehensive (all current keys, placeholder/empty values). Keep them as the single source of "what keys exist".
- **Pre-commit secret gate** (`.husky/pre-commit`): (1) hard-refuses to stage any real `.env*` (non-`.example`) file; (2) runs `gitleaks protect --staged` when gitleaks is installed (warns + defers to CI when it isn't).
- **Blocking CI job** (`.github/workflows/security.yaml` → `gitleaks`): downloads the gitleaks binary (no org license needed) and runs `gitleaks detect --no-git` on the working tree with `--exit-code 1`, so any real credential added in a PR/push **fails the build**. Config in **`.gitleaks.toml`** (allowlists templates/lockfiles/generated/bundles/tests). The pre-existing Trivy secrets scan (artifact-only, non-blocking) is left in place as defense-in-depth.

> Recommended follow-up for Avi (repo setting, not code): mark **"Secret scan (gitleaks, blocking)"** as a **required status check** on the `main` branch protection rule so it cannot be bypassed by merge.

---

## 3. Rotation checklist — **Avi's action** (do NOT let Claude rotate)

Priority ordering: **P0** = platform-wide blast radius / signing keys → **P1** = payment & auth provider creds → **P2** = third-party API keys.

For each: **regenerate at the source**, then **update where the platform reads it**. The platform reads production secrets from **GCP Secret Manager → synced into the K8s secret `vibecore-platform-secrets`** (see `scripts/sync-k8s-secret-from-gcp.sh` and `infra/terraform/modules/secret-manager`), except where noted as **DB-backed via the admin UI**. After updating a K8s secret, **restart the consuming Deployment** (`kubectl rollout restart deploy/<name> -n <ns>`) so pods pick it up.

### P0 — platform crypto & signing secrets (rotate first)
| Secret (NAME) | Regenerate | Update where | Notes |
| --- | --- | --- | --- |
| `CONFIG_ENCRYPTION_KEY` | new 32-byte random | `vibecore-platform-secrets` (GCP SM) | ⚠️ **encrypts all stored project secrets / connections** — rotating requires re-encrypting existing ciphertext; plan a migration, do NOT rotate blind. |
| `COOKIE_SECRET` | new random | `vibecore-platform-secrets` | invalidates existing sessions (users re-login). |
| `JWT_SECRET` | new random | `vibecore-platform-secrets` | invalidates issued JWTs. |
| `WORKSPACE_AGENT_TOKEN_SECRET` | new random | `vibecore-platform-secrets` + workspace-agent env | signs workspace-agent tokens; rotate api + agent together. |
| `PREVIEW_PROXY_SHARED_SECRET` | new random | `vibecore-platform-secrets` + preview-proxy | preview-proxy ↔ api shared secret. |
| `BACKUP_ENCRYPTION_KEY` | new random | `vibecore-platform-secrets` | keep old key until old backups expire. |
| `SIEM_SIGNING_SECRET` / `RESEND_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET` | rotate at each webhook source | provider dashboard + `vibecore-platform-secrets` | HMAC verification secrets. |

### P1 — auth & payments
| Secret (NAME) | Regenerate at | Update where |
| --- | --- | --- |
| `GOOGLE_CLIENT_SECRET` (sign-in OAuth) | Google Cloud Console → Credentials | **`/admin/oauth-providers`** (DB-backed, migration 0052) — not env |
| `GITHUB_CLIENT_SECRET` (sign-in OAuth) | GitHub → Developer settings → OAuth Apps | **`/admin/oauth-providers`** (DB-backed) |
| `INTEGRATION_GITHUB_CLIENT_SECRET` / `INTEGRATION_GITLAB_CLIENT_SECRET` / `INTEGRATION_BITBUCKET_CLIENT_SECRET` (Connect providers) | each provider's OAuth app | `vibecore-platform-secrets` (or admin integrations config) |
| `OIDC_CLIENT_SECRET` | your IdP | `vibecore-platform-secrets` |
| `SAML_X509_CERTIFICATE` | your IdP (re-issue) | `vibecore-platform-secrets` |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API keys (roll) | **`/admin/stripe`** (DB-backed, migration 0047) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks | `/admin/stripe` |

### P1 — deploy/integration tokens (if ever populated)
`GITHUB_DEPLOY_TOKEN`, `GCP_OAUTH_TOKEN`, `VERCEL_DEPLOY_HOOK_URL`, `NETLIFY_BUILD_HOOK_URL`, `CLOUDFLARE_DEPLOY_HOOK_URL`, `DOCKER_BUILD_TRIGGER_URL`, `CLOUD_RUN_BUILD_TRIGGER_URL` → regenerate at the provider (GitHub/Vercel/Netlify/**Cloudflare**/GCP), update in `vibecore-platform-secrets`. Per-user deploy/DB provider tokens are stored **encrypted per-user** (`UserConnection`) — users re-connect from the IDE; nothing to rotate centrally.

### P2 — AI provider API keys
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`/`GOOGLE_GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `COHERE_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `TOGETHER_API_KEY`, `XAI_API_KEY`, `OPEN_ROUTER_API_KEY`/`OPENROUTER_API_KEY`, `HuggingFace_API_KEY`, `HYPERBOLIC_API_KEY`, `CEREBRAS_API_KEY`, `FIREWORKS_API_KEY`, `MOONSHOT_API_KEY`, `ZAI_API_KEY`, `AWS_BEDROCK_CONFIG` → revoke + reissue in each provider console, update in `vibecore-platform-secrets`. Most are also user-supplied per project (encrypted), which need no central rotation.

### P2 — mail
`SMTP_PASSWORD` / `SMTP_USER`, `EMAIL_HTTP_TOKEN`, `RESEND_WEBHOOK_SECRET` → rotate at the mail provider, update in `vibecore-platform-secrets`.

> Confirm the exact GCP Secret Manager entry names against `infra/terraform/modules/secret-manager/*.tf` before rotating; `scripts/sync-k8s-secret-from-gcp.sh` pushes them into the K8s secret.

---

## 4. History purge plan — **DO NOT RUN without Avi's explicit GO** ⛔

**Rotation supersedes purge.** Once any real value is rotated, the copy in git history is worthless, and purge becomes optional cleanup. Purge is **destructive and shared** (rewrites SHAs, requires force-push, breaks every existing clone/fork/PR), so it is **not** executed here.

Preferred tool: **`git filter-repo`** (safer/faster than `filter-branch`; BFG is an alternative for blob-by-size/path).

**Ready-to-run script:** [`outputs/purge-env-production-from-history.sh`](./purge-env-production-from-history.sh) — it does the SAFE local steps (mirror clone → `filter-repo` rewrite in a scratch dir → verifies the path is gone) and then **STOPS**, printing the exact `git push --force --mirror` for a human to run manually. It never pushes by itself. Run it after rotation to preview the rewrite; the force-push stays Avi's explicit call.

Dry-run / plan (safe to review, run on a **fresh mirror clone**, never on a working checkout):

```sh
# 1. Rotate first (section 3). Then, only with GO:
git clone --mirror git@github.com:openaxcloud/vibecore.git vibecore-purge.git
cd vibecore-purge.git

# 2. Remove the path from ALL history (also add --replace-text for any stray value).
git filter-repo --path .env.production --invert-paths
#   BFG equivalent: bfg --delete-files .env.production

# 3. Review, then (DESTRUCTIVE, shared history) — requires Avi's GO:
#    git push --force --mirror
```

**Before any force-push, Avi must:**
1. Confirm rotation of anything that was ever real (section 3).
2. Announce a freeze; every collaborator must re-clone afterwards (old clones become incompatible).
3. Expect open PRs/forks to break; GitHub caches old commits (contact support to purge if needed).
4. Coordinate with the automated process that manages `main` (it force-resets/pushes — a purge must not race it).

**Recommendation:** given no real secret value was found in history, **skip the purge** (or defer it) and rely on rotation + the shipped prevention. Revisit only if a real value is later discovered in a historical blob.

---

*Generated as part of the security-hardening pass. Prevention is committed & deploying; rotation and any purge are Avi's calls.*
