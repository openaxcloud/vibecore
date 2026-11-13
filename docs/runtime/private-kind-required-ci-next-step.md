# PR925 : voie de validation CI sans fournisseur non autorisé

Cette note propose la suite ; elle ne change aucun workflow ni check requis.

## Production CI

`ci.yml` possède déjà `workflow_dispatch`, ne référence aucun secret de fournisseur
ni OIDC, et lance la suite existante sur PostgreSQL/Redis locaux. La prochaine
exécution possible est `gh workflow run ci.yml --ref ci/private-runtime-kind-20261113`,
après stabilisation de la tête et vérification du `head_sha` du run. Ne déclencher
que ce workflow : retirer `[skip ci]` d'une mise à jour PR lancerait aussi E2E.
Ce dispatch n'a pas été effectué dans cette extension de recette.

Le résultat doit rester attribué au SHA exécuté. Il ne vaut ni validation E2E,
ni autorisation de déploiement : la porte de release exige des runs `push` sur
`main` pour son SHA exact (`scripts/release-gate/required-checks.json`).

## Production E2E : blocage et proposition minimale à revoir

`e2e.yml` injecte ANTHROPIC/OPENAI/OPENROUTER/GOOGLE dans ses jobs Playwright et
l'action locale `preparer-pile-e2e/action.yml` refuse toute exécution sans
`ANTHROPIC_API_KEY` avant démarrage de la pile. Le paramètre `spec` existant ne
supprime ni les secrets ni ce préflight. Aucun dispatch E2E actuel n'est donc
compatible avec l'interdiction d'utiliser ces credentials.

Une modification séparée, soumise à revue, pourrait ajouter un mode explicite
`no-provider` au dispatch et à l'action locale, conservateur par défaut :

- n'injecter aucune des quatre clés dans ce mode et refuser toute clé présente ;
- adapter seulement le préflight des credentials à ce mode ;
- conserver l'intégralité de la suite, les tranches, le rapport agrégé et le
  verdict bloquant actuels, sans nouveau filtre, skip, waiver ou faux fournisseur ;
- laisser échouer toute dépendance réelle à la génération ; corriger la couverture
  explicitement après diagnostic, sans annoncer cette génération comme testée ;
- vérifier par contrats le routage du mode, l'absence de secrets et la conservation
  du dénominateur de tests avant tout lancement.

Cette proposition ne garantit pas que la suite passera sans fournisseur. Si un
scénario bloquant exige réellement une génération distante, sa validation reste
impossible dans le périmètre présent : aucun résultat de recette kind ni check
partiel ne doit le remplacer. Le runtime nightly reste un workflow distinct,
non concerné par cette proposition. La politique E2E globale n'a pas été modifiée.
