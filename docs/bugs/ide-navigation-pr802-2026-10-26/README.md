# Diagnostic local des signaux E2E #802

## Verdict

Aucun défaut de contenu après application du projet A ni écriture de sélection A dans B n'est démontré. La cause exacte des deux échecs CI reste indéterminée. Aucun fichier produit ou test du dépôt n'a été modifié ; aucun timeout relevé, aucune assertion supprimée et aucune mutation GitHub effectuée.

## Références CI

Tête #802 : `279440d2fcbe3ee028d4209759f482bf6101c422`. [Run E2E 40269242521](https://github.com/openaxcloud/vibecore/actions/runs/40269242521).

- [README, tranche 2](https://github.com/openaxcloud/vibecore/actions/runs/40269242521/job/121399041832) : échec ligne 621 après Retour, trois lectures PROJECT-B-DOCUMENT puis éditeur absent au terme de 5 s ; réussite au retry 1. Variante 768 et contrôle archive retenue 768 réussis directement.
- [Settings, tranche 1](https://github.com/openaxcloud/vibecore/actions/runs/40269242521/job/121399042001) : shell absent après deux navigations et 60 s ; aucune mesure de couleur atteinte. Réussite au retry 1.
- Les quatre rapports principaux totalisent 508 cas déclarés : 480 réussites directes, 2 réussites après retry, 26 ignorés. Les 18 cas responsive tous ignorés d'une étape additionnelle sont distincts de ces rapports. Le contrôle agrégé indique zéro échec final et zéro dérogation utilisée ; cela ne signifie pas 508 validations exécutées directement.

## Reproduction locale

Build `6f270b9bc2a14e9f07a3b3b9eb457b5189f98fac`, réutilisé sans rebuild. Les deux fichiers de test sont identiques à #802 après normalisation du newline final ajouté lors de la récupération. Les sources workbench.ts, files.ts et ProjectWorkspaceProvider.tsx ont les mêmes empreintes Git. Ce build inclut toutefois les correctifs locaux focus/composition et n'est pas la tête CI exacte.

| Vérification | Résultat |
|---|---|
| Test README exact 390 | Réussite directe, 14,4 s |
| Archive A retenue, contrôle 390 | Réussite directe, 14,1 s |
| Loader, archive et état A retenus ; observation fine | Réussite directe, 30 s ; aucun échantillon titre A/contenu B |
| Loader A retenu au-delà de 5 s | Assertion originale expirée volontairement à 5023 ms ; routeur encore B en chargement, titre B ; après libération, A revient intact |
| Test exact des vingt panneaux clairs, Settings compris | Réussite au premier lancement effectif, 55,2 s ; un appel page.goto pour Settings, mesures atteintes |

Le premier lancement Settings n'avait pas ouvert de navigateur : binaire Playwright par défaut absent. Le harnais a ensuite utilisé `/usr/bin/chromium` déjà installé. Cette erreur est distincte d'un échec produit et d'un retry automatique du test.

L'observation fine distingue URL, état interne du routeur, titre réellement rendu, contenu, binding des stores et réponse archive. Un échantillon indique déjà routeur A/idle alors que titre et contenu restent B ; il précède le binding A et ne prouve pas un commit React A. Après binding A, les documents sont vides pendant l'archive retenue puis README A apparaît. Les PUT de sélection vers B et les sélections en base isolée restent propres à chaque projet. Le contretest reproduit un mécanisme compatible avec le journal CI, sans prouver que la même latence s'y soit produite.

## Preuves, limites et suite

Reçus et extraits joints. Rapports complets et traces locales : `/tmp/ide-project-switch-qa/` et `/tmp/ide-settings-qa/`. Les traces détaillées de l'échec CI original n'ont pas été obtenues ; aucun téléchargement d'artefact précédemment refusé n'a été retenté.

Fixtures synthétiques sur API/base locales réelles, réponses retardées sans substitution. Aucune édition client réelle, publication fournisseur ou validation production/Safari matériel. Les observations de sélection ne constituent pas une preuve universelle sur toutes les écritures de fichiers. Stack isolée arrêtée, services concurrents préservés.

Prochain diagnostic utile si le signal revient : corréler, dans la trace CI exacte, le commit visible du projet, la fin du loader, la fin de l'archive et les erreurs réseau/JavaScript du shell. Les contrôles de préconditions peuvent ensuite être séparés comme dans le scénario d'archive retenue, sans affaiblir les assertions de contenu ni présenter une hypothèse comme une correction produit.

Revue indépendante : conclusions correctement qualifiées, aucun correctif produit justifié par ces seules preuves. Le contretest ne reproduit pas intégralement la chronologie CI B puis éditeur absent dans le même budget ; la trace CI corrélée reste nécessaire pour attribuer la cause.
