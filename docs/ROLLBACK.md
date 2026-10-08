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

## Preuves d'un rollout atomique

Le pipeline de production publie `rollout-status-<sha>` même en échec. Son fichier
`rollout-status.jsonl` conserve les états des Deployments, Jobs et pods de la release
avant, pendant et après `helm upgrade --atomic`. Lire les premiers états dégradés,
car les derniers peuvent déjà montrer les anciens pods rétablis par le rollback.
`commandExitCode` reste le code de sortie de Helm ; une `captureError` indique une
preuve manquante, pas une disponibilité confirmée. Les échantillons ne contiennent
pas de Secrets, specs, variables d'environnement ou journaux applicatifs.

Une erreur d'écriture après le lancement de Helm produit un avertissement et un
artefact incomplet. Le collecteur attend la fin de Helm et conserve son code de
sortie pour que le workflow continue à connaître le résultat réel de l'upgrade.
Une impossibilité d'écrire le premier échantillon bloque avant de lancer Helm.
