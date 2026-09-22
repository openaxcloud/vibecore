---
id: BUG-TEMOIN-VERSION-001
---

## Bug

**Un témoin lisait la DÉCLARATION et affirmait l'INSTALLATION.** `anthropic-thinking-effectivity.spec.ts` porte un cas nommé « TÉMOIN — la version installée est bien celle qui porte le gain » ; il lisait `package.json`, c'est-à-dire ce que le dépôt *demande*. Mesuré le 10/09 dans un bac à sable dont `node_modules` datait du 08-09 : **déclaré `1.2.12`, INSTALLÉ `0.0.39`**. Le témoin passait au VERT en annonçant que l'installation portait le gain, pendant que les deux cas au-dessus rougissaient sur des chaînes absentes du bundle — deux rouges incompréhensibles sous un vert rassurant, alors que la cause tenait en une ligne. C'est exactement le défaut que ce fichier dénonce ailleurs, commis par lui-même : une sonde qui mesure autre chose que ce qu'elle affirme.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

le témoin lit désormais `node_modules/@ai-sdk/anthropic/package.json` — le paquet réellement chargé — et son message nomme le geste de réparation (`pnpm install --frozen-lockfile`) ; la déclaration reste vérifiée séparément, pour qu'une régression du `package.json` rougisse aussi. Contre-épreuve décisive : version installée refaite à `0.0.39` → le témoin rouge avec « installé en 0.0.39 alors que le dépôt demande 1.2.12 » ; remise à `1.2.12` → 5 verts. ⚠️ **Ce n'était PAS un défaut de `main`** : le verrou pinne bien `1.2.12`, c'est mon bac à sable qui était périmé de deux jours — vérifié par les dates (`node_modules` 08-09 05:46 vs `pnpm-lock.yaml` 10-09 14:20). J'ai rafraîchi l'arbre et relancé la suite complète dessus : 8410 verts. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1603 de `deploy-main.yml` (SHA `a670708ee`, qui contient ce commit — vérifié par `merge-base` ; marqueurs présents à la tête de `main`). Les quatre niveaux reconstruits (runtime, web, workspace-agent, admin), `Helm upgrade` 16:37:29→16:45:07, `Verify rollout` ✅, `Verify running imageIDs match the release manifest` ✅ 16:45:21→16:45:40 — les pods qui tournent portent les images construites depuis ce commit ; rollback resté `skipped`. ⚠️ Déployer n'est pas vérifier : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

