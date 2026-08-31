# Rollback

## Platform Helm Rollback

```bash
gcloud container clusters get-credentials PROD_APP_CLUSTER --region REGION --project PROJECT
helm history vibecore -n vibecore
helm rollback vibecore LAST_GOOD_REVISION -n vibecore
pnpm synthetic:health
```

The production deploy workflow prints the same rollback command before and after deployment.

## Image Rollback

Use the `Deploy Production Break Glass` workflow with the GitHub Actions run ID
that uploaded the previous known-good `release-manifest.json`. Two distinct
approvers are required. The workflow downloads that immutable manifest,
cosign-verifies every recorded digest, applies those exact digests atomically and
checks the live imageIDs. Before either approval/WIF path, it proves the workflow
graph came from `main`; both jobs check out that exact workflow SHA. The pinned
cosign binary is SHA-256 verified before installation. The workflow never
rebuilds or resolves a mutable tag.

Do not use `global.imageTag` for a production rollback: doing so would discard
the per-service digest pins and reopen a tag-mutation window.

## Database Rollback

Prefer forward fixes. If data restoration is required, use Cloud SQL PITR:

```bash
gcloud sql backups list --instance vibecore-prod-postgres --project PROJECT
gcloud sql instances clone vibecore-prod-postgres vibecore-prod-restore --point-in-time "YYYY-MM-DDTHH:MM:SSZ" --project PROJECT
```

Never run destructive migrations without a backup verification pass and an incident commander approval.

## Workspace Runtime Rollback

```bash
gcloud container clusters get-credentials PROD_WORKSPACES_CLUSTER --region REGION --project PROJECT
helm history workspaces -n workspaces
helm rollback workspaces LAST_GOOD_REVISION -n workspaces
```
