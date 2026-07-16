# Zone Autoscale + tailles machine + rétention AR — preuves live du 2026-07-16

Tout exécuté sur prod (`vibecore-prod-app`, europe-west9) via le vrai parcours. Chiffres bruts.

## BUG-CRON-001 — tous les CronJobs plateforme morts depuis ~9/07 (P0, trouvé + corrigé + prouvé)

- Symptôme : chaque Job d'enqueue `Failed` (BackoffLimitExceeded), pods supprimés trop vite pour logger.
- Diagnostic live : le même conteneur en Pod nu (sans `ENQUEUE_DEDUP_KEY`) → `{"event":"enqueued"}` ;
  en Job (dedup key injectée) → `{"event":"enqueue.failed","error":"Custom Id cannot contain :"}`.
- Cause : bump BullMQ ^5.76 (`bc7a393b`, 9/07) rejette `:` dans les custom ids ; `enqueue-cli.ts`
  composait `${job}:${dedupKey}`. Fix `9b3315b1` (`--` + sanitisation, 5 specs).
- Preuve post-CD : jobs 05:10 `deploy-reap`/`siem-deliver` **Complete 1/1** (worker `9b3315b127`),
  tick 05:15 `cron-workspace-gc-29736315` **Complete 1/1** → le sweep idle a endormi les 11
  Deployments `app-*` idle (0/0), dont `app-cmrmb34mz`/`app-cmrmc2v0u` bloqués 1/1 depuis 12 h.
- Conséquence avouée : PERSONNE ne dormait depuis le 9/07 (ni workspaces ni apps), reaper deploy,
  SIEM et metering morts sur la même période.

## Autoscale — cycle replicas=0 → 1 requête → réveil 200 (sorties brutes : `wake-cycle-node.txt`)

- AVANT : `app-cmrmb34mz…` `spec.replicas=0` (endormi par le sweep, 6 h+ sans trafic).
- 1 requête `https://d-cmrmb34mz….preview.e-code.ai/` → **HTTP 200 en 16,05 s**, corps réel de l'app
  (`{"ok":true,"phase":"B4","builtFrom":"revision"}`) — la requête de réveil N'EST PAS perdue, zéro 502.
- APRÈS : `spec.replicas=1 readyReplicas=1`.
- Port externe unique + budget santé 5 s (bruts : `single-port-service.txt`) : Service `80→3000`
  seul port exposé ; readinessProbe `{path:/, periodSeconds:1, timeoutSeconds:5, failureThreshold:30}`
  = la règle Replit « accueil > 5 s = pas prêt » est portée par la probe.

## Tailles machine (rate card v1) — [preuves à compléter après CD 894c5f6f]

- Publish réel avec `machineSize` non-défaut → `kubectl get deploy -o yaml` (requests==limits).
- Garde-fous : 8 vCPU refusé en free (400 MACHINE_SIZE_PLAN) ; 4 vCPU refusé au plafond de
  capacité mesuré (400 MACHINE_SIZE_CAPACITY, nœuds e2-standard-4 = 3920m allocatable).
- Metering : événements `deployment.compute` stampés machineSize/activeSeconds/rateCardVersion.

## Rétention Artifact Registry — chiffres et policies

- AVANT (mesuré 16/07) : `vibecore-prod-containers` 1 380 images / **483,4 Go facturés**
  (somme imageSizeBytes 697 Go avant dédup de layers) — web 423 img / 226,8 Go, api 178 / 88,2,
  ai-gateway 170 / 81,7, worker 168 / 77,7, workspace-manager 168 / 77,7, preview-proxy 166 / 71,3,
  screenshotter 40 / 48,8, autres 67 / 24,8. `vibecore-prod-apps` 6 images / 168 Mo, **aucune policy**.
- Trou réel : `screenshotter:377792b0e1` EN EXÉCUTION était rank 36 (hors keep-20), âge 7 j —
  supprimable à J+23 sous l'ancienne policy delete-30d. Aucun garde-fou « image qui tourne ».
- Policies appliquées (`gcloud set-cleanup-policies --no-dry-run`, vérifiées par describe,
  fichiers versionnés `infra/artifact-registry/*.json`) :
  - containers : KEEP 20 récentes/pkg + KEEP tags `running-*`/`helm-active-*` + DELETE > 7 j ;
  - apps : KEEP 10 récentes/app + KEEP tags `active-*` + DELETE > 60 j.
- 23 tags de protection posés immédiatement : 8 `running-*` (pods live), 9 `helm-active-*`
  (release Helm actif + `WORKSPACE_AGENT_IMAGE` du configmap), 6 `active-<deployId>` sur prod-apps
  (Deployments k8s, Y COMPRIS endormis à 0 réplique — le réveil doit pouvoir puller l'image).
- Automatisation : `.github/workflows/ar-protect-images.yml` (toutes les 6 h + dispatch) re-pointe
  les tags sur la réalité du cluster. 1er run : PERMISSION_DENIED `artifactregistry.tags.delete` →
  grant `roles/artifactregistry.repoAdmin` scopé aux 2 repos au SA `github-actions-docker@…`.
  Run 29473177657 : **success**.
- La suppression effective est faite par le job de cleanup AR de Google (asynchrone, ~quotidien) ;
  le volume redescendra progressivement sous la nouvelle policy. Aucun chiffre de reclaim promis
  sans mesure post-passage.
