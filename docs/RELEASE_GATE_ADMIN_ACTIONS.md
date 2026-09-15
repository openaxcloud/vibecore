# Admin actions required before the exact-SHA gate can be switched on

Five things a CI session cannot do. Every value below was **read from the live project
and repo**, not assumed — the read-back command is given with each one so you can verify
before and after.

Each action is fail-closed: getting one wrong blocks deploys rather than weakening the
gate. Two of them have a trap that the obvious one-liner walks straight into; those are
marked ⚠️ and the trap is explained before the command.

---

## 1. KMS — let the deploy identity *verify* cosign signatures

**Current state** (`gcloud kms keys get-iam-policy cosign-images --keyring=ecode-supply-chain --location=europe-west9 --project=vibecore-495216`):

```yaml
bindings:
- members: [serviceAccount:267592214411-compute@developer.gserviceaccount.com]
  role: roles/cloudkms.signerVerifier
- members: [serviceAccount:267592214411-compute@developer.gserviceaccount.com]
  role: roles/cloudkms.viewer
```

The deploy service account has **no binding at all** on this key. The deploy path runs
`cosign verify` on every digest before `helm upgrade`, and that step fails closed — so
with the gate switched on and this ungranted, **nothing deploys**.

```bash
# The deploy identity behind secrets.GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT.
# Confirm it first — it is a repo secret, so a session cannot read it:
#   gh secret list -R openaxcloud/vibecore | grep ARTIFACT_WRITER
DEPLOY_SA="github-actions-docker@vibecore-495216.iam.gserviceaccount.com"

gcloud kms keys add-iam-policy-binding cosign-images \
  --keyring=ecode-supply-chain --location=europe-west9 --project=vibecore-495216 \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role=roles/cloudkms.publicKeyViewer
```

`publicKeyViewer` is enough to verify: verification reads the public key. **Do not grant
`signerVerifier` or `signer`** — the deploy path must not be able to mint signatures for
images it is about to trust.

**Read back:**

```bash
gcloud kms keys get-iam-policy cosign-images --keyring=ecode-supply-chain \
  --location=europe-west9 --project=vibecore-495216 --format='yaml(bindings)'
```

**Noticed while reading this policy, unrelated to the gate but worth a ticket:** the
signing role sits on `267592214411-compute@developer.gserviceaccount.com` — the *default
compute* service account, which is broad and attached to a lot. A dedicated signing
identity would be better.

---

## 2. Two GitHub environments for break-glass

**Current state** (`gh api repos/openaxcloud/vibecore/environments`): three environments
exist — `copilot`, `production`, `staging` — and **all three have `protection_rules: []`
and `deployment_branch_policy: null`**. Neither break-glass environment exists.

A single environment with N reviewers requires **one** of them to approve. That is why
the workflow uses two sequential environments, and additionally reads the run's real
approvals and refuses unless **two different people** approved.

Create both in the UI (Settings → Environments), or:

```bash
for env in production-break-glass-1 production-break-glass-2; do
  gh api -X PUT "repos/openaxcloud/vibecore/environments/${env}" \
    -f 'wait_timer=0' \
    -F 'reviewers[][type]=User' -F "reviewers[][id]=$(gh api users/<reviewer-1> --jq .id)" \
    -F 'deployment_branch_policy[protected_branches]=false' \
    -F 'deployment_branch_policy[custom_branch_policies]=true'
  gh api -X POST "repos/openaxcloud/vibecore/environments/${env}/deployment-branch-policies" \
    -f 'name=main'
done
```

Put **different** reviewers on `-1` and `-2` where you can; the workflow enforces
distinctness at run time either way, so identical lists just mean a run can deadlock.

**Read back:**

```bash
gh api repos/openaxcloud/vibecore/environments \
  --jq '.environments[] | "\(.name)\tprotections=\(.protection_rules|length)"'
```

---

## 3. Protect the `production` environment

It has no protection at all today. Writing `environment: production` in a workflow
currently guarantees nothing.

```bash
gh api -X PUT repos/openaxcloud/vibecore/environments/production \
  -F 'reviewers[][type]=Team' -F "reviewers[][id]=<team-id>" \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/openaxcloud/vibecore/environments/production/deployment-branch-policies \
  -f 'name=main'
```

Until this and #4 are done, the in-workflow `GITHUB_WORKFLOW_REF` assertion added by this
lot is the **only** thing stopping a production deploy from a side branch.

---

## 4. ⚠️ WIF — restrict *which workflow* may impersonate the deploy identity

**The obvious one-liner breaks seven workflows.** Read this before running anything.

**Current state:**

```
provider  github-actions-pool / github-provider
  attributeCondition: assertion.repository_owner == 'openaxcloud'
  attributeMapping:   google.subject, attribute.actor, attribute.repository,
                      attribute.repository_owner        # no workflow_ref
SA github-actions-docker@… : roles/iam.workloadIdentityUser granted to
  principalSet://…/attribute.repository/openaxcloud/vibecore
```

So **any workflow, on any branch, of any repo owned by `openaxcloud`** can mint a token
and impersonate the deploy identity. And `workflow_ref` is not mapped, so no binding can
refer to it yet.

Eight workflows authenticate through this provider, four of them on the **same**
`GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT`:

| service account secret | workflows |
|---|---|
| `GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT` | `deploy-main`, `deploy-break-glass`, `ar-protect-images`, `docker` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `deploy-staging`, `staging-runtime-validation` |
| `GCP_TERRAFORM_SERVICE_ACCOUNT` | `terraform` |

Binding the deploy SA to `deploy-main.yml@refs/heads/main` alone would therefore break
`ar-protect-images` (retention tagging — which then **deletes running images**), `docker`,
and break-glass itself.

**Step 4a — map the claim** (additive, breaks nothing):

```bash
gcloud iam workload-identity-pools providers update-oidc github-provider \
  --workload-identity-pool=github-actions-pool --location=global \
  --project=vibecore-495216 \
  --attribute-mapping="google.subject=assertion.sub,\
attribute.actor=assertion.actor,\
attribute.repository=assertion.repository,\
attribute.repository_owner=assertion.repository_owner,\
attribute.workflow_ref=assertion.workflow_ref"
```

**Step 4b — replace the repo-wide impersonation with an explicit allowlist:**

```bash
POOL="projects/267592214411/locations/global/workloadIdentityPools/github-actions-pool"
DEPLOY_SA="github-actions-docker@vibecore-495216.iam.gserviceaccount.com"
REPO="openaxcloud/vibecore"

for wf in deploy-main deploy-break-glass ar-protect-images docker; do
  gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA}" \
    --project=vibecore-495216 --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/${POOL}/attribute.workflow_ref/${REPO}/.github/workflows/${wf}.yml@refs/heads/main"
done

# Only once the four above are confirmed working, remove the repo-wide grant:
gcloud iam service-accounts remove-iam-policy-binding "${DEPLOY_SA}" \
  --project=vibecore-495216 --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL}/attribute.repository/${REPO}"
```

Add the grant first, verify, remove the broad one last — in that order the change is
never a window where nothing can authenticate. Note `@refs/heads/main`: a dispatch of the
same file from a side branch presents a different `workflow_ref` and is refused.

**Read back:**

```bash
gcloud iam service-accounts get-iam-policy "${DEPLOY_SA}" --project=vibecore-495216
gcloud iam workload-identity-pools providers describe github-provider \
  --workload-identity-pool=github-actions-pool --location=global \
  --project=vibecore-495216 --format='yaml(attributeMapping,attributeCondition)'
```

`wif-proof.yml` exists and is the cheapest way to confirm the pool still works after the
change.

---

## 5. `vars.STAGING_APP_CLUSTER` on the `staging` environment

`deploy-staging.yml` runs `helm upgrade --install vibecore --namespace vibecore` — the
**production release name and namespace**, inside the production GCP project. The only
thing separating it from production is this variable, which is **defined nowhere**. It
fails by accident rather than by design. This lot added a guard that refuses an unset
value or the production cluster; the variable still has to be set to the real staging
cluster.

```bash
gh variable set STAGING_APP_CLUSTER --env staging -R openaxcloud/vibecore --body '<staging-cluster-name>'
gh variable list --env staging -R openaxcloud/vibecore
```

---

## Order

1 and 5 are independent — do them whenever. 2 and 3 are pure GitHub settings. 4 is the
only one with an ordering constraint (4a before 4b, and remove the broad binding last).

None of them should be done *after* merging the gate: #1 in particular turns
`cosign verify` from "fails closed and blocks every deploy" into "works".
