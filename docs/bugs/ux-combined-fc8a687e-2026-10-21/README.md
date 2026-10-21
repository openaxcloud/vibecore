# Recette combinée UI sur main fc8a687e — 21 octobre 2026

Checkout isolé, non fusionné dans main. Base `fc8a687e715e6052668ade83474da4aef5f27df9`, menu #750 `e996671e600322a5c5df8f70f4ad8f4cfe766707`, panneaux #753 `f06923ff4c7aa4ce71e9b0e9af0584c0ca39f7a8`. Le chantier éditeur/BaseChat/scroller reste exclu de cette combinaison.

**Statut : combinaison non validée.** Le dernier passage exhaustif est à **43/45**, sans omission ni retry. Les deux défauts de chargement/palette restent ouverts et exigent la coordination BaseChat avant intégration. La mise à jour de branche rétablit la cohérence avec main ; elle ne transforme pas ces rouges en succès.

## Sources et inventaire

[Manifeste complet](manifest.json) : 4 996 fichiers source comparés aux trois références exactes ; sept superpositions attendues, aucune différence imprévue. 2 304 fichiers compilés ; build SHA256 `f78327169bc834d59a8dad75975ec121761848df1faec7ff03a35bc53eec3ff0`. L’archive compilée est conservée localement, sans publication volumineuse dans Git.

[Union de l’inventaire](inventory-union.json) : 455 fichiers, union exacte des 449 de main, 450 de #750 et 454 de #753. Aucun fichier perdu. L’index est régénéré par le script du dépôt, ses six tests passent. Arbre Git préparé `79afec9ee816fc6fdb797890b0b7448a3e60d037` ; la configuration de recette est attestée séparément par son empreinte. Aucune fusion de PR n’a été effectuée.

## Banc local

API issue du checkout main combiné, port local 3015 ; frontend compilé 5207, Chromium système, PostgreSQL synthétique existant sur 55443. `/ready` initial : 200 en 69,8 ms. Le schéma de données ne change pas entre les bases concernées.

Les sessions précédentes ont expiré : les identités synthétiques existantes sont réutilisées, avec sessions locales temporaires et six organisations/projets dédiés. Aucun compte réel ou credential fournisseur créé ; aucun quota modifié. Les paramètres enterprise des nouvelles organisations sont initialisés séquentiellement dans la préparation. **Cette recette ne valide donc pas la course d’initialisation enterpriseOrganizationSettings**, transmise au chantier API avec ses preuves antérieures.

## Configuration reproductible

[Configuration combinée](../../../playwright.combined-ux-audit.config.ts), qui requiert aussi le test de #750 dans le checkout. Elle hérite des budgets et profils de la configuration publiée ; zéro retry et un worker. La fixture privée contient `cases` par format/langue et la session racine du menu ; elle n’est pas publiée.

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5207 SAAS_API_URL=http://127.0.0.1:3015 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium UX_QA_SESSION_FILE="$PWD/.vibecore/ux-qa/integration-sessions.json" UX_INTEGRATION_REPORT_DIR=/tmp/combined-formats node_modules/.bin/playwright test -c playwright.combined-ux-audit.config.ts
```

Le mode standard ajoute `UX_STANDARD_CONFIG=1` et `--project chromium`, dans un autre répertoire de résultats. Le fichier `ide-mobile-chrome.spec.ts` utilise la configuration et le mécanisme de sessions publiés avec #753, toujours avec API/main et build exacts ci-dessus.

## CI et limites

Le job PostgreSQL de #753 `f06923ff` a échoué avant ses sept tests : script `verify-scheduled-task-postgres.sh` absent de cette ancienne base (run 39579750541/job119154135365, sortie 2). Ce n’est pas une régression SQL/UX démontrée. La mise à jour de #753 reprend le script et le workflow exacts de main, sans copie divergente, désactivation ou exemption. #750 reste une dépendance séparée.

Les deux échecs initiaux Git/Sécurité et Mes données du gate #748 ne sont pas expliqués par leur passage local précédent. Aucun transfert des traces 403 n’est retenté. Les cas d’affichage avec connexion nommée non joignable et les tests SQL réels restent distingués, de même que les doubles voix/streaming et une véritable validation fournisseur. Aucune certification production ou de panneau complet.

## Premiers résultats combinés

- [Trois formats × FR/EN](formats-results.json) : **18/18**, zéro retry/omission/flaky, 134,3 s. Menu clavier, navigation compacte tactile, actions et persistance du thème, création d’instantané, annulation sans restauration et maintien du focus.
- [Profil standard chromium](standard-results.json) : **6/6**, zéro retry/omission/flaky, 56,2 s. Ce profil est sans capacité tactile ; aucune déduction à partir d’un nom de profil temporaire.
- Captures FR de l’annulation : [desktop](cancel-desktop-fr.png), [tablette](cancel-tablet-fr.png), [mobile](cancel-mobile-fr.png). Captures du menu : [desktop](menu-desktop-fr.png), [tablette](menu-tablet-fr.png), [mobile](menu-mobile-fr.png). Les captures EN et dialogues intermédiaires sont conservés dans l’archive locale de résultats. L’image mobile d’annulation montre le contour de focus et le contrôle non recouvert ; elle n’est pas utilisée comme preuve de présence de la visite guidée.

[Reçu du build](build-receipt.json) : archive SHA256 `60d274ff9b3af95ec4b0fddbf84698fec54061c40c84e40e4c4b775b8ae8bf17`. Cette comparaison locale des sources et des fichiers compilés n’est pas une attestation indépendante du build.

La [comparaison avec la branche #753 mise à jour](branch-comparison.json) couvre les 4 996 sources : seule différence attendue, `HeaderOverflowMenu.tsx` de #750, qui reste une dépendance séparée. L’inventaire à 455 entrées est conservé dans le checkout combiné ; la branche #753 seule conserve l’union de ses propres entrées et de main.

Le banc utilise des sessions synthétiques préparées et ne rejoue pas l’inscription CI. Cela limite l’analyse causale des deux échecs CI initiaux. Les assertions de préparation des projets, conversations, transcriptions et variables sont conservées pour rendre visible une erreur de données avant toute assertion géométrique.

Dépendances locales observées dans les [réponses API en erreur](known-api-errors.json) : `GET /agent-memory` et `/agent-memory/preferences` répondent 503 `AGENT_MEMORY_UNCONFIGURED` dans ce banc, qui ne configure pas ce service. Les tests de menu ne certifient donc pas les fonctions mémoire. Le 500 de schéma correspond à la connexion nommée non joignable du test d’affichage, pas aux tests SQL dédiés. Ces constats ne sont pas attribués à une régression de main sans comparaison causale.

## Échec conservé et diagnostic de la couleur du micro

Première passe intégrale : [44/45, zéro omission et zéro retry](mobile-first-results.json), 528,6 s. Les deux cas CI initiaux et les deux tests SQL réels passent. Le [gate de main](gate-first.txt) refuse correctement le résultat, sans exemption.

Le cas dictée échoue sur une comparaison instantanée de couleur après `aria-pressed=false`. [Mesure instrumentée](voice-transition.json), [script exact](voice-transition-probe.cjs), [capture au repos](voice-idle.png) : classe active déjà retirée, couleur encore `rgb(220, 38, 38)` à la première observation, transition CSS `all 0.15s` en cours ; une fois ses animations terminées, couleur `rgb(17, 24, 39)` et aucune animation restante. Le composant possède déjà `transition-all` ; ni ce composant ni BaseChat ne sont modifiés.

Le [seul changement de test](voice-test-comparison.json) remplace la lecture instantanée par `await expect(micro).not.toHaveCSS('color', couleurEcoute)`. La condition reste identique, le budget d’assertion existant est utilisé ; aucun délai fixe, désactivation d’animation ou réduction d’assertion. [Rejeu ciblé après correction](voice-targeted-results.json) : 1/1, zéro retry. Ce résultat ne remplace pas le rouge de la première passe complète.

Le moteur vocal reste le double préexistant du test : le diagnostic porte sur le rendu et son animation, **pas sur une reconnaissance vocale fournisseur réelle**. La sonde observe la fin des animations du navigateur ; elle n’ajoute aucun délai artificiel au produit ou au test.

Pendant le second passage, les anciennes API locales sur 3013/3014, dont les essais étaient terminés et archivés, ont été arrêtées pour libérer leurs ressources. L’API courante 3015 et le navigateur actif n’ont pas été relancés ([journal](resource-cleanup.json)). Les durées ne constituent pas un benchmark ; aucun budget de test n’a été augmenté.

## Dépendances encore rouges au deuxième passage

Le cas « Mes données » reproduit l’absence de DATABASE_URL avant toute assertion de hauteur. [Contexte DOM](database-error-context.md), [chronologie navigateur/BFF](database-failure-browser.json), [requêtes API corrélées](database-failure-api.json), [relecture API sans valeurs sensibles](database-after-failure-read.json). Le PUT initial est 200 ; après l’échec, GET env-vars et GET databases confirment chacun DATABASE_URL. Le premier BFF est reçu 24,066 s après son départ ; le second est encore en attente 1,303 s après son départ lorsque le test échoue. Le parent n’est plus busy mais l’enfant affiche Loading databases.

Source fc8a687e : `BaseChat.tsx / ProjectDatabasePanel` reçoit déjà `data` mais ne transmet que `projectId` à `DatabaseWorkbench`. Celui-ci lance son propre chargement au montage. C’est cohérent avec les deux chargements observés ; cela ne démontre pas la cause de toute la lenteur API/BFF ni celle du run CI. [Bug et proposition à coordonner](../BUG-UX-DATABASE-SEQUENTIAL-LOAD-001.md). Aucun fichier BaseChat n’est modifié ici.

Le menu tablette échoue distinctement : Design palette disparaît après un appui intérieur. Le [contexte](palette-error-context.md) montre Checking the active session et Loading E-Code, avec un composeur sans bouton Envoyer. [Bug à coordonner avec le chantier éditeur](../BUG-UX-PALETTE-INITIALIZATION-001.md). Une remontée/remplacement du composeur est une piste, pas une causalité prouvée. Aucun force-click, nouveau délai ni modification de cette assertion.

L’[inventaire final](inventory-final-union.json) préserve les 455 entrées initiales et ajoute ces deux diagnostics distincts : 457 dans la combinaison, 456 dans #753 seule, avec l’entrée #750 conservée séparément. Aucun panneau n’est déclaré certifié sur ces résultats.

## Verdict exhaustif et gestes supplémentaires

[Dernier passage complet](mobile-final-results.json) : 43 réussites, 2 échecs, zéro omission/retry/flaky, 914,6 s. Le cas de couleur passe ; les deux tests SQL réels passent. Le [gate final](gate-final.txt) refuse les deux échecs, sans exemption. Aucun troisième passage complet n’est lancé pour rechercher un vert.

[Huit gestes supplémentaires du menu](menu-extra-results.json), FR/EN : clic extérieur, déplacement du focus hors menu, Shift+Tab, ouverture de la confirmation partagée puis annulation avec conversation conservée et focus restauré. Tous réussissent sur le même build ; ils ne certifient pas le menu de la palette pendant l’initialisation. Captures [FR](menu-extra-fr.png) et [EN](menu-extra-en.png).

Visite guidée : [actions réelles et persistance](tour-actions.json), création avec visite ouverte, contrôle refocalisé entièrement dans l’écran et recevant les événements, annulation, Suivant/Retour, Plus tard, réouverture, fermeture puis rechargement. Les PATCH de préférences sont 200 et relus par GET ; aucun statut de visite n’est forcé par la fixture. [Défilement tactile 390×320](tour-scroll.json) : scrollTop 29 sur contenu 277 px dans 248 px, Plus tard atteint et actionné. [Focus après annulation](integration-tour-after-cancel-mobile-fr.png), [après fermeture](integration-tour-after-dismiss-mobile-fr.png). Scripts exacts : [actions](tour-after.cjs), [écran court](tour-scroll.cjs), [menu](menu-combined.cjs), exécutés depuis le checkout d’intégration avec ses fixtures privées.

La [matrice complémentaire des journaux de publication](publication-matrix-blocked.json) reste **incomplète** sur cette combinaison : premier cas mobile FR arrêté sur l’absence du bouton Voir les journaux dans le budget existant de 5 s, cinq combinaisons non atteintes, aucun rejeu. Le [déploiement persistant relu par API](publication-state.json) est bien FAILED avec un journal ; aucun déploiement n’a été recréé par cette recette ([origine](publication-origin.json)). La cause UI précise n’est pas établie. Les cas de disposition publication du fichier complet passent, mais ils ne remplacent pas cette vérification d’action. Les six réussites de publication sur le build précédent restent des preuves historiques, non transférées à ce build.

Les six tests de cohérence de l’inventaire mis à jour passent. Le build de cette combinaison est réussi. Les contrôles de type/lint sont requis avant publication de la branche ; la recette UI exhaustive reste rouge et l’intégration attend la coordination des deux défauts réservés.
