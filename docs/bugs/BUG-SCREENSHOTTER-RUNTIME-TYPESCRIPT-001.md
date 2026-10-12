---
id: BUG-SCREENSHOTTER-RUNTIME-TYPESCRIPT-001
---

## Bug

**P1 — le captureur reconstruit ne démarre pas avec sa nouvelle dépendance de sécurité TypeScript.** Son package et les deux pipelines Cloud Build lancent `node dist/server.js`, alors que `@vibecore/security` expose directement `src/index.ts` et importe des modules `.js` résolus vers leurs sources par `tsx`.

## 📤 Dispatché

Pris en charge le 12 octobre 2026 après le déploiement 38194840868.

## 💻 Codé

☐ Correctif préparé : utiliser `tsx dist/server.js` dans le package, le pipeline complet et le pipeline runtime. `tsx` est déjà une dépendance de production ; aucune dépendance ni garde SSRF n'est retirée. Fusion et livraison restent à vérifier.

## ✅ Testé live

☐ Le déploiement de 7c24f8fc8f échoue dans Helm. Les captures montrent neuf redémarrages du nouveau captureur, le précédent restant disponible ; les sept autres services deviennent prêts. Helm rapporte un retour arrière atomique et la capture finale montre des réplicas prêts. Elle ne contient pas leurs imageIDs ni les journaux applicatifs du pod : la version exécutée après retour arrière reste non prouvée. Mesure : `docs/reprise/mesures/2026-10-12-livraison-7c-echec.json`.

## Validation

Reproduction locale avec le même code compilé : import avec `node` refusé (`ERR_MODULE_NOT_FOUND`), import avec `tsx` réussi. Trois tests lisent les commandes réelles du package et des pipelines, démarrent le véritable serveur compilé avec sa dépendance de sécurité puis exigent HTTP 200 et `{ok:true}` sur `/health`. Chaque ancienne commande doit rendre son test rouge. La suppression de la route de santé doit également rendre les trois tests rouges. La suite du captureur tient 23 cas (deux tests physiques désactivés sont signalés comme ignorés), les trois démarrages étant inclus dans ces 23 cas. Les types, le build et le lint passent. Les deux gardes Cloud Build passent également. Ces mesures locales ne remplacent pas une livraison réussie ni une capture réelle en production.
