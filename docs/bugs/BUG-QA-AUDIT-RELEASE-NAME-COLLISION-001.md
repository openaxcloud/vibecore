---
id: BUG-QA-AUDIT-RELEASE-NAME-COLLISION-001
---

## Bug

**P1 sécurité d'exploitation — la release Helm de l'environnement d'audit porte EXACTEMENT le même nom et le même namespace que la production, et le runbook affirme le contraire.** Constaté : sur le cluster d'audit, `helm list -n vibecore` rend **`vibecore` / ns `vibecore` / révision 20** ; sur le cluster de prod, **`vibecore` / ns `vibecore` / révision 1085**. **Nom identique, namespace identique.** Le **seul** discriminant est donc le contexte `kubectl`/`--kube-context`. Or le contexte ambiant de ce poste était **`connectgateway_vibecore-495216_europe-west9_vibecore-prod-app`**, c'est-à-dire **la production** : un `helm upgrade vibecore -n vibecore …` tapé sans `--kube-context` explicite part **sur la prod**, sans aucun garde-fou. **Le runbook aggrave le risque au lieu de le réduire** : `docs/audit/TEST_ENV_RUNBOOK.md` §4 prescrit `helm upgrade --install vibecore-audit …` et annote « release `vibecore-audit` (⚠️ la prod s'appelle `vibecore` — ne pas confondre) ». Cette phrase laisse croire que **le nom** protège. Il ne protège pas : les deux s'appellent `vibecore`. Suivre le runbook à la lettre créerait en plus une **seconde** release parallèle sur le cluster d'audit, divergente de celle réellement déployée. Risque concret : un déploiement d'audit qui atterrit en production, ou un `helm rollback`/`helm uninstall` visant l'audit et frappant la prod.

## 📤

☐

## 💻

☐

## ✅

✅ **27/08** constaté en réel sur les deux clusters

## Preuve

`helm --kube-context gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster list -n vibecore` → `vibecore  vibecore  20  vibecore-platform-0.1.0`. `helm --kube-context connectgateway_vibecore-495216_europe-west9_vibecore-prod-app list -n vibecore` → `vibecore  vibecore  1085  vibecore-platform-0.1.0`. `kubectl config current-context` → **contexte de PRODUCTION**. `env \

