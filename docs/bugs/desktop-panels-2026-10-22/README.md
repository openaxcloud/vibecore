# Audit desktop — lot palette, Webview et Problems

Quatre défauts reproduits sur le produit compilé sont corrigés : la palette globale disparaissait lors du remplacement de la coque de chargement ; les commandes Webview débordaient sous Library ; son menu ne se fermait pas avec Échap/clic extérieur ; `?panel=problems` ouvrait l’éditeur au lieu de Problems.

Ce lot n’est pas une certification de la plateforme. La [matrice des 31 portes](INVENTORY.md) distingue surfaces, menus, actions métier non testées et blocages. Aucun projet utilisateur ni accès fournisseur n’a été modifié.

## Complément après revue : invocation répétée de la palette

Le raccourci répété pendant la saisie remplaçait la cible de retour par le champ ensuite démonté. Le rouge est reproduit à 1440/1024 sur la référence main187 et sur c382 : aucune régression nouvelle attribuée à ce lot. Le correctif conserve la cible tant que la palette est ouverte.

Version compilée du complément : `2a1c2bc3a843a8b8b97514d211170aebf97ac0ac`, arbre `59ed252fc5918f62671edc94395ef9fbbce173c7`. Les 9 405 blobs sources ont été comparés à Git sans différence ; 2 306 fichiers compilés et un asset HTTP sont attestés dans le [reçu](proofs/repeated-focus/build-receipt.json). Archive complète conservée localement.

Onze scénarios ciblés passent directement : huit palette, deux Problems, un Webview. Les deux scénarios tactiles 390/768 et les neuf parcours docking/navigation passent également : **22 succès directs, zéro retry, zéro omission** sur cet arbre. Les 79 tests unitaires, le build, le typage et les hooks passent (lint : 52 avertissements existants, zéro erreur). Les nouveaux cas couvrent répétition clavier, pointeur desktop, fermeture/réouverture par fond modal compact et navigation Retour avec recherche conservée. Répétition puis Retour dans la même ouverture n’est pas un cas combiné couvert.

Le build intermédiaire d6 avait dix succès puis un échec de préparation Webview : la onzième inscription réelle en 52 s a reçu HTTP 429, plafond local 10/min. La fixture partage désormais une identité synthétique par largeur entre trois projets distincts et conserve des contextes navigateur neufs : sept inscriptions pour les onze cas directs. Aucun quota, délai, assertion ou gate modifié. Les [contre-épreuves et résultats](proofs/repeated-focus/README.md) restent séparés de la recette historique ci-dessous. Les configurations exactes du complément sont jointes dans ce même dossier ; build local sur 5225, API réelle/PostgreSQL dédiée sur 3017, Chromium système, zéro retry.

## Version et provenance — recette initiale conservée

- Base : `18745bd04f77e4d9fc6353d61bd4d17a3822f94e`.
- Produit et tests corrigés : `c382137ad72eeb983b40493e40bc296cd85e61c1` ; arbre `f26a295f50a7ddb890f8f5800db457d563a70630`.
- Le build a démarré sur l’index, puis la correspondance exacte avec l’arbre du commit a été vérifiée. Aucun changement produit pendant la compilation.
- [Manifestes sources et build](proofs/build-receipt.json) : 9 368 fichiers suivis et 2 307 fichiers compilés, chemins relatifs et SHA-256 ; [asset HTTP](proofs/served-asset.json) identique au fichier compilé. L’archive complète reste locale, son empreinte est fournie ; elle n’est pas publiée.
- Les commits de preuves ultérieurs ne changent pas le produit. Une comparaison explicite est jointe avant publication.
- Interface locale compilée sur 5223, API réelle sur 3017, PostgreSQL local dédié et identités synthétiques. Aucun mock dans les cinq nouveaux scénarios et la recette tactile. Le test de handoff retient puis laisse continuer la vraie requête GET, sans fabriquer sa réponse.

## Rouge puis vert

| Défaut               | Contre-épreuve conservée                                                                                                     | Effet vérifié après correction                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Palette globale      | Disparition à 1440 pendant le handoff ; essai 1024 initial bloqué par un mauvais déclencheur, pas une preuve de disparition  | Recherche et focus conservés à 1440/1024 ; Échap rend le focus ; réouverture et Entrée ouvrent Database       |
| Retour focus compact | Premier correctif `4f8e8b334` : cible du bouton absente au premier effet, puis `focus` sur l’input détaché                   | Résolution du déclencheur à la fermeture ; assertion originale verte à 1024                                   |
| Commandes Webview    | Quatre commandes hors des bornes ; clic Playwright pouvant réussir par défilement automatique                                | Bornes respectées à 1440/1024/1920 ; clic par coordonnées Logs, fermeture Logs, ouverture/fermeture DevTools  |
| Menu Webview         | Deux rouges initiaux Échap/clic extérieur ; premier correctif encore rouge car le raccourci global consomme Échap en capture | Échap, Tab entrant, Shift+Tab sortant, clic extérieur et clic sur surface iframe ; focus et contenu conservés |
| Problems             | URL reconnue par le registre mais absente du modèle : 0 onglet Problems, README affiché                                      | Onglet et contenu Problems, rechargement ; tiroir de barre d’état déjà fonctionnel conservé                   |

[Preuves rouges expurgées et erreurs de préparation](proofs/baseline/README.md), [premier assemblage : 3 succès / 2 échecs](proofs/intermediate-red.json), [cinq scénarios corrigés](proofs/results-redacted.json), [deux scénarios tactiles](proofs/touch-results.json). Tous les cas corrigés passent directement, sans retry, skip, modification de délai ou réduction d’assertion.

Captures : [Webview avant](proofs/baseline/toolbar-before.png), [après 1440](proofs/preview-after-1440.png), [après 1024](proofs/preview-after-1024.png), [palette 1440](proofs/palette-after-1440.png), [palette 1024](proofs/palette-after-1024.png), [Problems après rechargement](proofs/problems-after-reload.png), [téléphone](proofs/preview-touch-390.png), [tablette](proofs/preview-touch-768.png). Les noms visibles sont ceux de fixtures synthétiques.

## Reproduction

Utiliser une API/PostgreSQL locale dédiée déjà initialisée, sans compte réel. Les tests créent eux-mêmes leurs identités et importent leurs ZIP. Démarrer le build de la version ci-dessus avec `NODE_ENV=production PORT=5223 SAAS_API_URL=http://127.0.0.1:3017 API_BASE_URL=http://127.0.0.1:3017 node server.mjs`.

Les configurations exactes sont archivées en `.txt` dans `proofs/`. Les recopier à leur emplacement d’origine `.vibecore/ux-qa/final-corrected.config.ts`, `.vibecore/ux-qa/final-rpl.config.ts` et `.vibecore/ux-qa/preview-audit/mobile-compat.{config,spec}.ts` conserve leurs imports relatifs. Chromium système : `/usr/bin/chromium`, un worker, zéro retry.

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5223 SAAS_API_URL=http://127.0.0.1:3017 pnpm exec playwright test -c .vibecore/ux-qa/final-corrected.config.ts
pnpm exec playwright test -c .vibecore/ux-qa/preview-audit/mobile-compat.config.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5223 SAAS_API_URL=http://127.0.0.1:3017 pnpm exec playwright test -c .vibecore/ux-qa/final-rpl.config.ts
```

## Contrôles et limites

9/9 régressions docking/navigation passent directement sur le même build ([résultats](proofs/rpl-results.json)), dont clic normal puis déplacement, Back/Forward et navigation interrompue. Les requêtes retenues continuent vers le vrai serveur.

Deux contre-épreuves de sélection à 768 px passent aussi directement (Retour immédiat et A → B → Retour A). [Résultats complémentaires](proofs/files-supplementary-results.json) : les interceptions runtime/écriture de la spec existante sont conservées ; ce ne sont pas des validations réelles de sauvegarde ni une explication des intermittences CI.

79/79 tests unitaires ciblés ; typage complet vert ; lint application sans erreur, 52 avertissements préexistants ; build réussi. Premier commit effectué avant installation des exécutables Husky dans ce nouveau worktree : les contrôles complets et le scan du commit ont ensuite été exécutés, sans dispense. Les commits suivants passent les hooks normaux. Deux essais de typage initiaux échouaient sur les liens de dépendances et le mélange des clients Prisma entre worktrees ; isolation locale des liens corrigée, aucune dépendance du dépôt modifiée.

Safari n’a pas été exécuté : binaire WebKit absent, téléchargement local refusé par HTTP 403 « Domain forbidden ». Aucun contournement ni relance après constat du refus. La compatibilité tactile attestée est Chromium 390/768, pas Safari.

Les 429 et 503 observés dans l’audit initial restent des limites de chargement, pas des défauts de géométrie démontrés. La carte Database ouverte ne prouve aucune requête SQL. L’aperçu provient d’un vrai ZIP importé, sans certifier le runtime complet. Les quatre intermittences historiques de #763 ne sont pas déclarées résolues par ce lot ; les contre-épreuves de navigation n’établissent pas leur cause. Aucun panneau n’est entièrement certifié.

Chevauchement annoncé avec #765 : fichier BaseChat partagé, mais uniquement import de l’état de palette, état/focus vers 3880 et ouverture vers 6370 ; aucune modification de sa file AgentPatchReviewQueue, des stores files/workbench ni des chemins runtime/i18n réservés. L’inventaire compte 474 fiches, union à préserver lors d’une future intégration. #764 n’a fait l’objet d’aucune action. PR en brouillon ; revue indépendante coordonnée et validations requises avant toute fusion.
