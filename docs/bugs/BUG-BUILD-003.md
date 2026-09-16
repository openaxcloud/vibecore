---
id: BUG-BUILD-003
---

## Bug

**P1 — le déploiement automatique NE RECONSTRUIT JAMAIS le tier `admin`, donc son image de production reste figée même une fois le code réparé.** Le job de build de `.github/workflows/deploy-main.yml` n'a que trois étapes — `Build runtime tier`, `Build web tier`, `Build workspace-agent` — et son `Detect changed tiers` ne pose que `RUNTIME`/`WEB`/`WSAGENT`. Le mot « admin » n'apparaît qu'**une seule fois** dans tout le workflow, et jamais comme tier à construire. Seul `cloudbuild.yaml` (pipeline complet 7 images) produit l'admin, et rien ne le déclenche sur un push `main`. **C'est la vraie raison du gel de l'image admin** : corriger la compilation (BUG-BUILD-002) était nécessaire mais NE SUFFIT PAS — sans relance du pipeline complet, la prod reste sur `ef05fea502`.

## 📤 Dispatché

☑

## 💻 Codé

☑ 07/09 — **corrigé par #483** (`2badaced`, AUDX-173) : `deploy-main.yml` détecte `apps/admin/` et `infra/cloudbuild/admin-tier.yaml` (`ADMIN=true`), publie la sortie `admin`, et porte une étape « Build 4/4 : admin tier » bloquante (`set -euo pipefail`, `--config=infra/cloudbuild/admin-tier.yaml`), conditionnée à cette sortie. Le repli « rien de détecté → web+runtime » est délibérément SANS admin : il ne couvre que des fichiers hors de tout motif (CI, scripts, tests), et `apps/admin/package.json` n'a aucune dépendance `workspace:` — les entrées partagées (`packages/`, lockfile, Dockerfile…) reconstruisent, elles, les quatre étages. Constaté le 16/09 sur les runs 1608 → 1611 : l'étape existe et est `skipped` faute de changement sous `apps/admin/` — c'est le comportement voulu. **Épinglé le 16/09 par `scripts/garde-deploy-admin-tier.spec.mjs`** (détection, sortie, étape bloquante, entrées partagées → tout, et « l'admin n'a pas de dépendance workspace » — le jour où il en prend une, le motif devra s'élargir et ce test le dira).

## ✅ Testé live

☐ — **à constater sur le premier run où `apps/admin/` change** : « Build admin tier (Cloud Build) » doit passer de `skipped` à `success`, et l'image admin en prod doit porter le SHA du run (`kubectl -n vibecore get deploy admin -o jsonpath='{.spec.template.spec.containers[0].image}'`). Écart mesuré le 18/08 : `admin` = `ef05fea502` contre `web` à jour.

## Preuve

Relevé sur le run CD `32088397334` (`ac1ed19d81`, conclusion **success**) : les étapes de build sont `Build runtime tier` / `Build web tier` / `Build workspace-agent`, **aucune étape admin**. Le CD est donc vert sans jamais valider ni publier l'admin. Deux pistes à arbitrer : (a) ajouter un tier `admin` à `deploy-main.yml` avec sa détection de changements, ou (b) déclencher `cloudbuild.yaml` quand `apps/admin/**` ou `app/**` bouge. Écart mesuré en prod : `web` = `93c4b6df7f` (à jour) contre `admin` = `ef05fea502`.

