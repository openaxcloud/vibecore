---
id: BUG-BUILD-003
---

## Bug

**P1 — le déploiement automatique NE RECONSTRUIT JAMAIS le tier `admin`, donc son image de production reste figée même une fois le code réparé.** Le job de build de `.github/workflows/deploy-main.yml` n'a que trois étapes — `Build runtime tier`, `Build web tier`, `Build workspace-agent` — et son `Detect changed tiers` ne pose que `RUNTIME`/`WEB`/`WSAGENT`. Le mot « admin » n'apparaît qu'**une seule fois** dans tout le workflow, et jamais comme tier à construire. Seul `cloudbuild.yaml` (pipeline complet 7 images) produit l'admin, et rien ne le déclenche sur un push `main`. **C'est la vraie raison du gel de l'image admin** : corriger la compilation (BUG-BUILD-002) était nécessaire mais NE SUFFIT PAS — sans relance du pipeline complet, la prod reste sur `ef05fea502`.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **Constaté 18/08**

## Preuve

Relevé sur le run CD `32088397334` (`ac1ed19d81`, conclusion **success**) : les étapes de build sont `Build runtime tier` / `Build web tier` / `Build workspace-agent`, **aucune étape admin**. Le CD est donc vert sans jamais valider ni publier l'admin. Deux pistes à arbitrer : (a) ajouter un tier `admin` à `deploy-main.yml` avec sa détection de changements, ou (b) déclencher `cloudbuild.yaml` quand `apps/admin/**` ou `app/**` bouge. Écart mesuré en prod : `web` = `93c4b6df7f` (à jour) contre `admin` = `ef05fea502`.

