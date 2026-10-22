# Recette locale du correctif de duplication — 22 octobre 2026

Ce dossier documente le build final local de #763 après le rouge CI `d83cb4a1`. La CI de cette ancienne tête demeure rouge : 445 succès, 26 skips explicites et deux échecs RPL définitifs. Les résultats locaux suivants ne remplacent ni les checks de la nouvelle tête ni la revue avant fusion.

## Provenance

- Base publiée : `d83cb4a18f00f04b79032a6316d62ad6bb9e2bb8`, sur main `18cf74fd7abcd59620f0994b44ac1411e97fcf93`.
- `sources.json` : 9 280 chemins suivis et empreintes des fichiers présents au lancement du build final ; aucune valeur de configuration ou session.
- `prepared-sources.json` : 9 281 blobs de l’arbre préparé `708d963e4360a5f6a41cb1d881651804ad113904` avant ajout de ces preuves. La nouvelle fiche et l’index sont inclus. Cet arbre n’est pas le commit final de publication.
- Après le build, ESLint exigeait une ligne vide et deux commentaires en bloc dans BaseChat. `lint-source-comparison.json` donne les empreintes avant/après et confirme un JavaScript émis strictement identique avec TypeScript (`removeComments: true`). Aucun changement fonctionnel postérieur au build.
- `compiled.json` : 2 307 fichiers compilés. Archive locale SHA-256 `5fb64924312bd2163f2dff73e7dd861167987a61e0bca5466e5b1d014f855d49`, non publiée. Les 2 307 contenus ont été recalculés depuis l’archive et comparés au manifeste, sans différence.
- `served-asset.json` atteste `/login` HTTP 200 et l’égalité octet pour octet d’un JavaScript servi à `127.0.0.1:5217` avec le fichier compilé. Le serveur utilise le répertoire `build/` normal ; aucun mélange avec une ancienne archive.

Le build intermédiaire modifié pendant compilation n’a pas servi à la recette finale. Les rouges précédents sont conservés dans [rpl-duplication](../rpl-duplication/README.md), avec les captures avant/après et les deux défauts successifs.

## Résultat local

**68/68 succès directs, zéro retry et zéro omission** : 45 IDE, 3 fichiers, 6 confirmations EN/FR, 12 menus EN/FR et 2 RPL clair/sombre. 35 tests unitaires passent. Build et typage officiel passent ; le lint final est vérifié par les hooks de publication.

## Recette et reproduction

`actions.json` donne chaque cas réellement exécuté, son projet Playwright, sa durée et ses tentatives. Les fichiers `*.config.ts.txt` sont les configurations exactes locales à replacer dans `.vibecore/ux-qa/` ; les suites partagées utilisent `playwright.combined-ux-audit.config.ts` du dépôt. RPL emploie une copie du test suivi dont seul le répertoire de captures est changé.

Environnement : Node 24.19.0, pnpm 9.14.4, Chromium système, API compilée locale sur 3017, PostgreSQL dédié loopback sur 55443. Les six sessions de recette utilisent des identités synthétiques existantes `@example.invalid` et de nouvelles organisations/projets isolés avec quotas normaux. Leur contenu, les secrets de connexion et les rapports réseau bruts ne sont pas publiés. Aucun compte utilisateur réel ni credential fournisseur.

Commandes et résultat des contrôles dans `validation-commands.json`. `pnpm typecheck` est la commande officielle du dépôt. Une invocation exploratoire différente, `pnpm exec tsc --noEmit`, a retourné 688 erreurs dans son périmètre large incluant les fixtures/tests ; aucune erreur dans BaseChat. Son échec reste explicite dans `raw-tsc-diagnostic.json` et n’a entraîné aucun changement de configuration ou exemption.

## Limites

La suite de documents flottants intercepte runtime/sauvegardes : elle ne certifie pas une persistance distante. B→A passe aux deux largeurs mais son intermittence historique n’est pas expliquée. Le canari WebKit précédent comporte toujours un flaky distinct de pilule retour bas. Les assertions RPL de navigation confirment l’onglet ciblé, pas une exécution terminal ou des données Git distantes. Aucune certification complète de panneau, de production ou du projet réel de l’utilisateur.
