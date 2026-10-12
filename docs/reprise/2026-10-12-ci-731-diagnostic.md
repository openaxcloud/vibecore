# CI #731 — diagnostic suspendu aux preuves, 12 octobre 2026

## Séparation des lots

La sélection mobile est conservée sur `codex/mobile-selection-restore-20261012`, commit local `9fd22be0dc3d208720968805c60565183f906b86`, sans push. Six scénarios répétés deux fois : 12/12, un worker, zéro retry (2,9 minutes). 47 tests ciblés et 7 gardes AST passent ; build, lint et typecheck passent avec la limite `@ts-nocheck` préexistante de BaseChat. Inspection des captures finales suspendue. Rapport détaillé dans cette branche : `docs/reprise/2026-10-12-restauration-selection-mobile.md`.

Le diagnostic #731 utilise un worktree distinct, `/workspace/vibecore-731-ci`, branche `codex/731-ci-diagnosis-20261012`, base `1bd259831508a15cda5b8ece5e392628cd1e4d37`. La branche #731 reste à ce SHA. Main distant relu : `dfd1d1f071a2e19a516833e8fff491fb5a818bd0`. Aucun correctif sélection mobile n'est incorporé ici.

## Accès et verdict

L'API GitHub est accessible. Elle confirme le job `115024638596` en succès (ses étapes ne suffisent donc pas au verdict E2E), et l'agrégateur `115035818964` en échec à `E2E gate (bounded waiver)`, run `38313486381`. Le rapport tranche 1 est l'artefact `11777306609` (38 117 538 octets) ; les résultats JSON sont `11777600938`.

Les téléchargements du log du job et du ZIP rapport sont refusés vers **productionresultssa18.blob.core.windows.net**, distinct du domaine autorisé `productionresultssa0.blob.core.windows.net`. Chemin arrêté ; aucun changement de réseau, secret ou dérogation. Aucune URL signée conservée dans ce rapport. Les captures/traces CI n'ont pas été obtenues ni inspectées.

La description détaillée des échecs provient du parent : unique échec final DB, carte absente 30 secondes aux trois essais ; quatre flaky, dont le nouveau 390 px interrompu au clic `tab-editor` ligne 244 par le budget global 90 secondes, puis réussi en 33,9 secondes. Ce détail n'est pas présenté comme une inspection indépendante des traces.

## DB : ce que le code établit

- Le test RP-DB-05 prépare un projet puis attend le `PUT /projects/:id/env-vars`, **sans contrôler son statut**. Il ouvre ensuite l'outil et attend directement `db-carte`. Une réponse HTTP non réussie ne fait donc pas échouer le test à la préparation.
- La liste API `/projects/:id/databases` lit les variables/secrets du projet et détecte les connexions. Pour ce projet neuf non provisionné, elle ne se connecte pas à la base cible pour produire la carte. L'échec avant carte ne démontre donc pas un problème SQL ou de lecture des tables.
- Le loader du panneau attend aussi les routes `/env-vars` et `/secrets` ; leur rejet, comme celui de `/databases`, donne une enveloppe d'erreur. Dashboard et snapshots ont des replis distincts. Une connexion existante dans l'API seule ne prouve donc pas que le panneau a reçu une enveloppe réussie.
- `DatabaseWorkbench` rend les cartes depuis `readEnvironments(fetcher.data)`, puis demande le schéma seulement après choix d'une carte.
- Le test DB, BaseChat, le loader DB, l'API DB et le composant DB sont identiques à main. Le code produit de #731 touche uniquement `FloatingPaneFrame` et le CSS `.bolt-project-floating-pane`. Aucun lien causal avec l'absence de carte n'est établi ; une régression indirecte n'est pas exclue par une simple lecture.

Diagnostic à obtenir avant correctif : statut du PUT (sans sa valeur), statut et présence de la clé `DATABASE_URL` dans la liste des connexions, statut/code de l'enveloppe panneau, puis capture DOM/écran montrant loading, erreur, vide ou carte. Ne pas publier les corps bruts de variables/secrets ni une trace non expurgée.

## 390 px : transition attendue

La sélection d'un fichier passe par `onFileOpen` en mobile : elle sélectionne le document, active `setMobileIdePanel('editor')` et met `panel=editor`. Le clic `tab-editor` qui suit dans le test est donc une seconde activation ; ce n'est pas la preuve que l'ouverture initiale a abouti.

La barre présente quatre créneaux et trois onglets fixes. L'éditeur est à la demande ; le sélecteur inclut l'onglet actif et le mécanisme de défilement cherche à le montrer. Un timeout **global** au clic ne dit pas si l'onglet était absent, recouvert, hors écran ou simplement privé du budget restant.

Avant modification, relever à chaque étape les durées, l'URL/panneau, le nombre de `tab-editor`, `aria-pressed`, son rectangle et celui de la bande, les overlays visibles, et le contenu CodeMirror. Si l'ouverture a déjà activé l'éditeur, une assertion directe sur l'onglet actif et le contenu serait un contrat plus précis que le second clic. Ne pas enlever ce clic ni augmenter le budget sur la seule base du timeout fourni.

## Contrôles et relecture

28 tests passent : `DatabaseWorkbench.environments.spec.ts` (11), `DatabaseWorkbench.renders-databases.spec.tsx` (4), `mobile-bottom-tabs.spec.ts` (13). Exécutés depuis l'installation existante de `/workspace/vibecore`, avec pnpm 9.14.4 ; fichiers testés et dépendances produit de ces tests identiques à main et #731. Journal local : `/tmp/731-ci-evidence/targeted-contracts.log`. Ce contrôle de contrats n'est pas une reproduction navigateur du run en échec.

Relecture indépendante par `review_pastille`, en lecture seule : confirme l'absence de changement direct des chemins DB, le statut PUT ignoré, le chargement unique du panneau, et l'ambiguïté du timeout global 390 px. Aucun correctif causal recommandé avant observation des preuves.

## État

Aucun correctif produit/test appliqué à #731, aucune relance CI, aucun push, aucune fusion. Les vérifications locales ciblées des lecteurs DB et du sélecteur d'onglets ne reproduisent pas la CI. Les preuves manquantes sont les traces/réseau/captures des trois essais DB et du premier essai 390 px ; elles doivent être rendues disponibles par un chemin autorisé pour établir la cause historique.
