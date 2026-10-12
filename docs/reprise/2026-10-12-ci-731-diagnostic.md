# CI #731 — diagnostic suspendu aux preuves, 12 octobre 2026

## Séparation des lots

La sélection mobile est conservée sur `codex/mobile-selection-restore-20261012`, commit local `9fd22be0dc3d208720968805c60565183f906b86`, sans push. Six scénarios répétés deux fois : 12/12, un worker, zéro retry (2,9 minutes). 47 tests ciblés et 7 gardes AST passent ; build, lint et typecheck passent avec la limite `@ts-nocheck` préexistante de BaseChat. Les sept captures finales demandées ont ensuite été inspectées par le relecteur indépendant : Back/reload aux deux largeurs, langue immédiate aux deux largeurs et interruption390 ; toutes montrent audit.txt et les deux lignes attendues, sans README ni écran vide. Cela ne prouve pas la chronologie ni la conservation des brouillons. Le commit mobile reste inchangé. Rapport détaillé dans cette branche : `docs/reprise/2026-10-12-restauration-selection-mobile.md`.

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

Aucun correctif produit appliqué à #731, aucune relance CI, aucun push, aucune fusion. Delta de test préparé ensuite à la demande du parent, décrit ci-dessous. Les vérifications locales ciblées des lecteurs DB et du sélecteur d'onglets ne reproduisent pas la CI. Les preuves manquantes sont les traces/réseau/captures des trois essais DB et du premier essai 390 px ; elles doivent être rendues disponibles par un chemin autorisé pour établir la cause historique.


## Delta de test proposé au parent

La garde du PUT exige le contrat actuel (aucun changement API) : HTTP200, `envVar.id` non vide, projet et clé attendus, valeur identique et scope implicite `production`. Les comparaisons de valeur retournent uniquement une erreur générique, jamais la valeur reçue/attendue. Le test RP-DB-05 attend ensuite `tab-database` actif et le titre réel « All databases » / « Toutes les bases de données » avant l'assertion existante `db-carte` (30s). Aucune assertion retirée, aucun délai augmenté.

Diagnostics activés seulement pour RP-DB-05 et le nouveau parcours390 : jusqu'à16 marques et24 métadonnées de réponses navigateur, nombres/états DB et menus, panneau mobile borné à des valeurs connues, sélection/rectangle/réception au centre de l'onglet éditeur. Aucune URL, en-tête, valeur, corps de réponse ou texte DOM joint. La pièce jointe n'est créée qu'en échec. Le PUT par `APIRequestContext` n'est pas observé par le listener navigateur : son statut est contrôlé par la garde.

Les marques horodatées n'attendent pas le DOM ; une seule observation peut être engagée. Si elle est occupée, `stateSkipped` le dit explicitement. Le teardown peut attendre au plus1s l'observation puis1s l'attachement, avec timers nettoyés et rejets absorbés. Ces bornes n'annulent pas une opération engagée ; l'ultime état peut manquer. Pas de modification des budgets métier. Ces mesures de diagnostic peuvent influencer marginalement le timing ; elles ne démontrent pas la cause historique.

Validation du delta :

- Une fixture locale bénigne a appelé le véritable PUT API sans authentification, obtenu401, puis laissé la garde échouer : rouge attendu `Database setup PUT failed: HTTP 401`, avant ouverture de panneau. Aucune base provisionnée ni service simulé opérationnel. Journal `/tmp/731-ci-evidence/red-final.log`.
- Le collecteur a réellement joint son JSON sur ce rouge. Un texte-canari du DOM et l'URI bénigne de fixture en sont absents. [Pièce jointe filtrée](mesures/731-ci-2026-10-12/refus-401-diagnostic.json). Les autres artefacts Playwright automatiques de cette fixture ne sont pas déclarés expurgés ni ajoutés au dépôt.
- Deux tests réels de garde passent : refus401 ; création d'un projet synthétique, PUT200 confirmé puis refus de confirmations comparées à un mauvais projet ou une mauvaise valeur. Ils testent la persistance d'une variable, pas la disponibilité de la base qu'elle désigne. Aucun appel schéma/query/provisionnement.
- Typecheck strict des cinq fichiers TypeScript et lint ciblé réussis. Aucun build produit requis pour ce delta exclusivement test. Le parcours DB complet et le nouveau390 ne sont pas relancés ici : aucune reproduction historique supplémentaire n'est revendiquée.
- Relecture indépendante après correction de trois réserves (marques desktop retirées, observation non bloquante, attachement protégé) : aucun blocage supplémentaire relevé. Limites de collecte conservées ci-dessus.

Diff local remis pour revue du parent avant toute publication. Le refus Azure demeure respecté : aucun nouvel accès ni autre chemin de téléchargement utilisé.
