---
id: BUG-CI-DEPLOY-PREVIEW-TOUJOURS-ROUGE-001
---

## Bug

**P2 — `Deploy Preview` rougit sur TOUTES les propositions, et ne peut pas réussir.** Il apprend au dépôt entier à ignorer le rouge.

C'est la même maladie que la suite E2E qui expirait toujours : un filet qui n'attrape plus rien mais qu'on continue de regarder. Le coût n'est pas le contrôle lui-même, c'est qu'il **désarme la lecture des autres rouges** — quand un contrôle est rouge par défaut, plus personne ne distingue le rouge qui compte.

## 📤 Dispatché

☑ 2026-09-30

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**La cause, lue dans le journal du 2026-09-30 :**

```
##[error]Unable to resolve action `cloudflare/pages-action`, not found
```

L'action **n'existe plus** en amont. Le workflow ne peut donc pas démarrer — ce n'est pas un échec de déploiement, c'est une référence morte.

**Fréquence mesurée** sur les 12 derniers passages du workflow « Preview Deployment » : **10 échecs, 2 succès**. Les deux succès sont antérieurs à la disparition de l'action.

## La question à trancher, en une ligne

**Ni l'un ni l'autre n'est long** : soit on remplace `cloudflare/pages-action` par son successeur documenté `cloudflare/wrangler-action` (quelques lignes), soit **on retire le workflow**. La vraie question n'est pas technique : la plateforme se déploie sur GKE, pas sur Cloudflare Pages — cet aperçu sert-il encore à quelqu'un ? S'il ne sert plus, le retirer vaut mieux que le réparer.

⚠️ **Ce qu'il ne faut PAS faire** : le laisser rouge. Un contrôle qui ne peut pas passer doit être réparé ou retiré — jamais gardé en décor.
