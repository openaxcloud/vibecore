---
id: BUG-IDE-PANE-FOCUS-DUPLICATION-001
---

# Le focus d’un panneau rouvre l’outil de l’URL

## 📤 Dispatché

22 octobre 2026 : deux échecs finaux light/dark dans la CI de #763 d83cb4a, trois tentatives par thème. Le déplacement augmente le total de trois à cinq onglets avec de nouveaux identifiants. Le flux de synchronisation existait déjà sur main 18cf74fd ; aucune attribution exclusive au lot courant.

## 💻 Codé

Correctif local validé, publication dans #763 (non intégré à main) : le callback d’ouverture lit le panneau actif dans une référence courante et conserve son identité entre changements de focus. L’effet de synchronisation URL ne doit pas interpréter un focus comme une nouvelle navigation. Aucun changement du moteur de déplacement, du comptage attendu, des délais ou des exemptions.

## ✅ Testé live

Rouge reproduit sur le build local 4ec690fc : deux thèmes, zéro retry. Une assertion complémentaire localise le premier doublon dès l’ouverture du menu du panneau gauche, avant tout déplacement. Correctif final : deux thèmes verts, zéro retry ; recette combinée 68/68 directe et 35 tests unitaires. Aucun succès CI de la nouvelle tête ni aucune certification de production revendiqués. [Provenance et matrice](ux-followup-2026-10-21/main-18cf-docking/final-rpl/README.md). Les assertions vérifient aussi la conservation des identifiants des onglets après déplacement et restitution du focus.

## Complément de navigation — 22 octobre

La CI historique d558b448 est verte (447 succès directs, 26 omissions explicites), mais une contre-épreuve locale a ensuite démontré qu’une navigation interrompue laisse le reçu anti-écho masquer la sélection demandée par Retour. Une correction intermédiaire a révélé un second cas : deux déplacements pendant une même navigation provoquent encore un doublon. Ces rouges restent conservés.

Le commit local `69592374` lie le reçu à l’identifiant de la navigation réellement appliquée et réutilise l’identifiant d’une navigation en cours pour un second déplacement ; sans navigation en cours, une demande redondante efface le reçu. Six cas sur sept passent sur ce build ; le cas restant a isolé un clic de fermeture perdu par alignement magnétique de la bande, traité séparément dans [BUG-IDE-TAB-STRIP-SNAP-CLICK-001](BUG-IDE-TAB-STRIP-SNAP-CLICK-001.md). La recette finale du build `d0ef2126` passe **73/73 directement**, sans retry ni omission, et 35 unitaires passent. La nouvelle CI et la revue restent requises avant fusion. [Recette finale](ux-followup-2026-10-21/main-18cf-docking/final-navigation-stable/README.md). [Contre-épreuves](ux-followup-2026-10-21/main-18cf-docking/navigation-echo/README.md).

## Navigation ordinaire suivie d’un déplacement — contre-épreuve finale

La CI historique de `afe8a440` passe (452 directs, 26 omissions), mais la revue a ensuite reproduit **3→4 onglets** : un clic normal vers Webview lance une navigation sans marqueur de déplacement, puis son déplacement pendant cette requête perd le reçu anti-écho. Aucune fusion de cette tête. Le rouge et sa capture restent conservés.

Le produit `edb558bc` utilise la clé React Router de cette navigation en cours quand aucun marqueur n’existe. Le reçu est invalidé lorsqu’une navigation finit ailleurs, avant la synchronisation URL. La protection POP annulé puis Retour vers la même clé historique était déjà verte sur le baseline et n’est pas revendiquée comme ancien défaut corrigé. **75/75 tests navigateur directs, zéro retry/omission ; 49 unitaires verts** sur ce build local attesté. CI exacte et revue de la publication restent requises ; aucune certification de production. [Matrice, manifeste et reproduction](ux-followup-2026-10-21/main-18cf-docking/final-navigation-complete/README.md), [rouge/vert normal-click](ux-followup-2026-10-21/main-18cf-docking/navigation-echo/normal-click/README.md).
