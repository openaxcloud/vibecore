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

Deploy the previous immutable image tag:

```bash
helm upgrade --install vibecore infra/helm/platform \
  --namespace vibecore \
  --atomic \
  --set global.imageTag=PREVIOUS_GOOD_TAG
```

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
