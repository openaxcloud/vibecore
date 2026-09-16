---
id: BUG-AGENT-FILET-ACTION-001
---

## Bug

Le filet de fin de flux fermait l'artefact mais LAISSAIT L'ACTION EN COURS OUVERTE. Mesuré sur le parseur réel, flux coupé au milieu du second fichier : `actionOpen:src/App.tsx` + `actionOpen:src/main.tsx`, une seule `actionClose`. Le fichier en cours à la coupure — le dernier écrit, donc très souvent le point d'entrée — n'était jamais finalisé, et `onActionClose` est ce qui déclenche `runAction`. C'est le mécanisme derrière « l'index.html réclame /src/main.tsx qui n'existe pas ». Deuxième mesure, plus grave : à la coupure `state.currentAction.content` vaut `''` — la branche de streaming ne l'alimente jamais. Fermer sans récupérer le brut aurait écrit un fichier VIDE par-dessus le code affiché.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

preuve mesurée sur le parseur (trace d'ouvertures/fermetures) + épinglé par `app/lib/runtime/filet-ferme-aussi-l-action.spec.ts` (6 tests). Contre-épreuve : correctif retiré → 3 rouges ; remis → 6 verts. Contrôle négatif : un flux COMPLET n'est pas touché. Commit `1df1edd33`. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1597 de `deploy-main.yml` (SHA `e435692a1`, qui contient ces commits — vérifié par `merge-base` et par le comptage des marqueurs à ce SHA) : `Helm upgrade` 11:00:52→11:07:45, `Verify rollout` ✅, et surtout `Verify running imageIDs match the release manifest` ✅ — les pods qui tournent portent bien les images construites depuis ce commit ; l'étape de rollback est restée `skipped`. ⚠️ Le déploiement n'est PAS une vérification live : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

