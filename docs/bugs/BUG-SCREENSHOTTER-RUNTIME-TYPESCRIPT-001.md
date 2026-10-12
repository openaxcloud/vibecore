---
id: BUG-SCREENSHOTTER-RUNTIME-TYPESCRIPT-001
---

## Bug

**P1 — le captureur reconstruit ne démarre pas avec sa nouvelle dépendance de sécurité TypeScript.** Son package et les deux pipelines Cloud Build lancent `node dist/server.js`, alors que `@vibecore/security` expose directement `src/index.ts` et importe des modules `.js` résolus vers leurs sources par `tsx`.

## 📤 Dispatché

Pris en charge le 12 octobre 2026 après le déploiement 38194840868.

## 💻 Codé

☑ Fusionné par #722 à `7ce2aa9ceac014b2449d053e3991baeaea9f427d` après 26 contrôles verts : `tsx dist/server.js` dans le package et les deux pipelines. La CI du commit de main est également réussie, dont 429 tests navigateur sans échec ni nouvelle tentative. `tsx` était déjà une dépendance de production ; aucune garde SSRF retirée. Livraison 38203837782 réussie, digests exécutés vérifiés sur huit services. Mesure : `docs/reprise/mesures/2026-10-12-controles-7ce.json`.

## ✅ Testé live

☐ Vérification complète encore partielle : le démarrage est confirmé dans la livraison 38203837782 (pod Running/ready, zéro redémarrage, imageID conforme au digest signé), mais le rendu Chromium d’un véritable projet n’est pas remesuré. Mesure : `docs/reprise/mesures/2026-10-12-livraison-7ce.json`.

## Échec précédent conservé

☐ Le déploiement de 7c24f8fc8f échoue dans Helm. Les captures montrent neuf redémarrages du nouveau captureur, le précédent restant disponible ; les sept autres services deviennent prêts. Helm rapporte un retour arrière atomique et la capture finale montre des réplicas prêts. Elle ne contient pas leurs imageIDs ni les journaux applicatifs du pod : la version exécutée après retour arrière reste non prouvée. Mesure : `docs/reprise/mesures/2026-10-12-livraison-7c-echec.json`.

## Validation

Reproduction locale avec le même code compilé : import avec `node` refusé (`ERR_MODULE_NOT_FOUND`), import avec `tsx` réussi. Trois tests lisent les commandes réelles du package et des pipelines, démarrent le véritable serveur compilé avec sa dépendance de sécurité puis exigent HTTP 200 et `{ok:true}` sur `/health`. Chaque ancienne commande doit rendre son test rouge. La suppression de la route de santé doit également rendre les trois tests rouges. La suite du captureur tient 23 cas (deux tests physiques désactivés sont signalés comme ignorés), les trois démarrages étant inclus dans ces 23 cas. Les types, le build et le lint passent. Les deux gardes Cloud Build passent également. Ces mesures locales ne remplacent pas une livraison réussie ni une capture réelle en production.

La dépendance copiée physiquement dans `node_modules`, sans lien symbolique, est également importée avec succès par `tsx`. `node` rend `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` dans cet essai local sous Node v24.19.0. Cela ne prétend pas reproduire la version exacte de Node ni le rendu du navigateur en production. Mesure : `docs/reprise/mesures/2026-10-12-securite-runtime-physique.json`.

## Relevé de production du 12 octobre à 05:44 UTC

Le nouveau captureur est Running/ready, zéro redémarrage, une réplique prête et mise à jour. Son imageID archivé correspond au digest du manifeste signé de 7ce2aa9c. Le défaut de démarrage n’est plus observé dans cette capture. Le rendu Chromium d’un véritable projet reste non remesuré : la case de vérification complète n’est pas cochée sur cette seule santé du processus. Mesure : `docs/reprise/mesures/2026-10-12-livraison-7ce.json`.
