# OPERATIONS_DR — exploitation et reprise après sinistre

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: SLO/astreinte/chaos/RTO-RPO non prouvés (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — SLO/astreinte/chaos/RTO-RPO non prouvés — puis re-soumettre à signature
Règle d'or: ce qui n'a jamais été TESTÉ en réel est marqué UNTESTED — un plan
de DR non testé n'est pas un plan.

## Exploitation (réel, en service)

- Déploiement: push main → GitHub Actions `deploy-main.yml` → Cloud Build
  (7 images taguées SHA court) → `helm upgrade --reuse-values --atomic`.
  Runbook: `docs/DEPLOY_RUNBOOK.md`. ⚠ course inter-lanes documentée
  (un run tardif peut rétrograder un tier — parade: -f force_tiers + attendre
  la convergence).
- Rollback applicatif: `helm -n vibecore rollback vibecore <REV>` (upgrade
  --atomic ⇒ rollback auto si rollout KO). TESTÉ en réel (incidents passés).
- Zéro-downtime: maxUnavailable:0 + preStop depuis `5c2c3586` (tous les
  Deployments). EN SERVICE.
- Migrations DB: hook Helm pre-upgrade (`prisma migrate deploy`) — l'image ne
  bascule pas si la migration échoue. EN SERVICE.

## Sauvegardes / restauration

- Cloud SQL `vibecore-prod-postgres`: sauvegardes automatiques GCP — présumées
  actives, **restauration JAMAIS testée par nous: UNTESTED**.
- PVC workspaces (100Gi/projet): snapshots CSI **non industrialisés** —
  checkpoint projet = spec (DOMAIN_MODEL §6), implémentation: NON FAITE.
- Artefacts: images AR (rétention: policies + tags protégés, workflow 6h);
  archives projets GCS. Restauration testée partiellement (reseed workspace
  validé le 13/07).

## RTO/RPO

- RTO/RPO formels: **UNKNOWN — jamais définis ni mesurés.**

## Incidents notables documentés

- OAuth prod cassé (state signé + NetworkPolicy) — corrigé, documenté.
- Deploy QUEUED orphelin (OOM) — corrigé (BullMQ durable + reaper 5 min), prouvé.
- Crons morts depuis le 9/07 — root-cause prouvée, fix `616f0bad` (16/07).
