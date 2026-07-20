# DEPLOYMENT_TYPES_CONTRACT — les 4 types de déploiement (P0-A2-04)

schemaVersion: 1
repoCommit: d1063912
reviewer: UNKNOWN

Exigence de parité centrale (audit de réanalyse 2026-07-20) : Autoscale,
Static, Reserved VM et Scheduled sont des **produits contractualisés**, pas des
lignes de backlog. Un type de déploiement n'existe que lorsque chacun des
volets ci-dessous est spécifié ET prouvé live (« un contrat n'est pas une
capacité » — preuves tracées dans `E2E_PROOFS.yaml`).

## 1. Matrice des 4 types

| Volet | Autoscale | Static | Reserved VM | Scheduled |
|---|---|---|---|---|
| Cible | app serveur HTTP, scale-to-zero→N | assets statiques (SPA/SSG) | instance dédiée toujours-on (4 tailles tarifées) | jobs cron (BullMQ→Cloud Run jobs) |
| Lifecycle | `REQUESTED→BUILDING→READY→SERVING ⇄ SLEEPING → RETIRED` | `REQUESTED→BUILDING→PUBLISHED→RETIRED` | `REQUESTED→PROVISIONING→RUNNING→(RESIZING)→RETIRED` | `SCHEDULED→TRIGGERED→RUNNING→{COMPLETE\|FAILED}→(retry policy)` |
| Config | machine size (RateCard), min/max instances, concurrency | domaine, cache headers, SPA fallback | taille (0.25–8 vCPU, RateCard v1), disque, always-on | cron expr (jamais « vendredi » implicite), timeout, volume réel monté |
| Port | `$PORT` injecté, healthcheck obligatoire | n/a (CDN/edge) | `$PORT` + ports additionnels déclarés | n/a (batch) |
| Secrets | refs versionnées via ReleaseManifest, jamais en clair | interdits dans le bundle (scan) | refs versionnées + rotation sans recréer | refs versionnées, lease par run |
| Coûts | à l'usage mesuré (metering runtime prouvé) | stockage+egress | tarif fixe par taille + engagement | par exécution (durée×taille) |
| Observabilité | logs build+runtime, métriques par révision | logs edge, hit ratio | métriques machine + uptime | historique des runs, coût par run, alerting échec |
| Changement de type | **sans recréer l'app** : re-déploiement du même ProjectRevision vers le nouveau type ; l'URL et l'historique de releases survivent | idem | idem | idem |
| Preuve exigée | E2E publish→READY→200 + scale-to-zero observé | E2E publish→200 + cache | E2E provision→RUNNING→resize | E2E cron déclenché à l'heure + run COMPLETE avec volume |

## 2. État réel mesuré (ne pas confondre avec le contrat)

- Autoscale : pipeline server-deploy PROUVÉ live (`E2E-PHASEB-NODE`,
  machine sizes + metering `E2E-AUTOSCALE-Z`) — scale-to-zero/wake mesuré.
- Static : pipeline statique historique en prod (CSP/CORP corrigés) — preuve
  E2E dédiée à référencer.
- Reserved VM : **NON FAIT** — offres/tarifs à créer (P1-COV-04, ACT-31).
- Scheduled : cron runs réels avec volume PROUVÉ (SCHEDULED-01, 16/07) ;
  contrat produit (UI, coût par run) incomplet.

## 3. Invariants communs

1. Tout déploiement naît d'un `ProjectRevision` pinné (digests, §4.7 du plan) —
   jamais d'un pointeur mutable.
2. Le changement de type est une opération de release, auditée, réversible par
   rollback — jamais une recréation qui perd l'historique.
3. Les 4 modes d'accès (`[RPL-23]`) s'appliquent uniformément aux 4 types.
4. Un type non listé ici n'existe pas ; en ajouter un = réviser CE contrat.
