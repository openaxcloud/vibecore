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

## Tailles machine (rate card v1) — PROUVÉ LIVE (deployment `cmrn4qhjy00090nesh8nxs756`)

- Migration 0070 passée en prod : `RateCard v1 active=true` (vérifié en DB).
- `GET /projects/:id/deployments/rate-card` : carte v1 servie de la DB, 6 tailles annotées
  disponibilité (`machinesize-ratecard-guards.txt`).
- Gardes 400 typées prouvées : `dedicated-8` en free → `MACHINE_SIZE_PLAN` ; `dedicated-4` →
  `MACHINE_SIZE_CAPACITY` (plafond mesuré 2 vCPU, nœuds 3920m) ; `mega-64` → `MACHINE_SIZE_UNKNOWN`.
- Publish réel `machineSize=dedicated-1` → 202, `machineSize` persisté sur la ligne, READY ~40 s.
- **kubectl get deploy -o yaml** (`machinesize-kubectl-proof.txt`) : `requests==limits ==
  {cpu:"1", memory:"4Gi"}`, replicas 1/1, URL publique 200 avec le contenu réel.
- **Panneau** (`panel-machine-size.txt`, vu à l'écran avec la session QA) : sélecteur 6 tailles,
  prix $/h actif issus de la carte, tailles interdites désactivées avec raison, note sleep 15 min.
- **Billing runtime** : événement `deployment.compute` 06:35:11 = 6 830 unités
  (contrôle : 26 u/s × 262,7 s actifs = 6 830 ✓ ; = 2,19 ¢ au rate card v1), metadata
  `{machineSize:dedicated-1, activeSeconds:263, replicas:1, requests:1, rateCardVersion:1}`,
  watermarks `runtimeMeteredAt`/`meteredRequests` avancés. Mode shadow (`BILLING_CREDITS_ENABLED`
  non actif) : l'événement + le montant sont réels, le débit de crédits est volontairement inhibé.

## Cron produit — RE-PROUVÉ après le fix P0 (`scheduled-reproof.txt`)

Tâche `sched_273460ed…` armée à T+2 min (cron `35 06 * * *` UTC) : tir à l'heure exacte
(`scheduledFor 06:35:00Z`, start 06:35:06.9), **SUCCESS exit 0 en 7,7 s**, logs réels du pod
(« cron reproof 1784183593 » + date), **computeUnits 100,425 / costCents 1 > 0**, `meteredAt`
posé, `nextRunAt` avancé au 2026-07-17T06:35:00Z.

## AUTOSCALE-01 bis — cycle complet sur le déploiement à taille choisie (`autoscale-01-new-deploy.txt`)

`cmrn4qhjy…` (dedicated-1) : dernier trafic 06:31 → endormi par le tick GC 07:00
(**spec.replicas=0**) → 1 requête → **HTTP 200 en 16,3 s** avec le contenu réel
(`{"ok":true,"phase":"machinesize","size":"dedicated-1"}`) → `spec.replicas=1 ready=1`.
La requête de réveil n'est pas perdue, zéro 502. Publish → facturé actif → sommeil gratuit →
réveil : la boucle Replit-parity entière sur UN même déploiement.

## GC mort du 9 au 16/07 — impact chiffré (`gc-pvc-analysis.txt`)

- 14 PVC / 595 Gi demandés dans `workspaces`, dont 4 × 100 Gi créés 10-14/07 (survivants de la
  semaine sans GC), passés STOPPED au premier GC fonctionnel (04:25) → suppression auto à +24 h
  (~400 Gi pd-standard ≈ 16 $/mois récupérés sans intervention).
- Storage class `workspace-standard-rwo` = **pd-standard** → les PVC ne comptent PAS dans
  `SSD_TOTAL_GB`. Le diagnostic « saturation SSD = boot disks gvisor pd-balanced » TIENT ;
  la migration pd-standard restait la bonne réponse structurelle. L'effet réel du GC mort :
  saturation CPU des nœuds (pods jamais arrêtés → Pending → scale-up bloqué par le quota),
  plus reaper/SIEM/metering morts 7 jours.

## Bug prod noté en passant (à l'inventaire)

`POST /api/runtime/workspaces/:id/files` sur un fichier EXISTANT → 502
(`WORKSPACE_AGENT_REQUEST_FAILED`) : la route mappe sur `/files/create` agent, qui 500 quand le
chemin existe. Le PUT `/files/write` fonctionne. L'UI n'utilise sans doute que le PUT, mais la
route POST ment (204 attendu, 502 rendu) sur l'overwrite.

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
