# Journaux de validation

Les fichiers `.log` sont des sorties réellement enregistrées, pas des logs reconstruits.

- `support-tests-final.log` :28 tests réussis,26 octobre2026 à01:47:29UTC ;15 tests de contrat/i18n et13 DataRouter.
- `support-lint-final.log` : lint ciblé réussi, sortie vide attendue.
- `final-review.md` : revue indépendante favorable du correctif final.
- `ui-safe-next-*` : logs consolidés du parent, qui a confirmé les codes0 (build, typage, lint global, formatage, Gitleaks). Lint52 avertissements préexistants ; aucune fuite détectée.

## Diagnostics historiques, distincts du verdict final

`draft-red.log` et `draft-red-valid-router.log` montrent les problèmes initiaux du harness : incompatibilité AbortSignal jsdom/Request Node et matchers absents. Ils ne démontrent pas des défauts produit.

`draft-red-product.log` contient les six échecs produit reproduits avant correction : démontage du champ pendant revalidation et absence de garde. Les scénarios400/503 avec loader différé forcent `shouldRevalidate=true` pour exercer cette situation ; des tests supplémentaires couvrent aussi la politique par défaut de React Router.

`draft-first-implementation.log` comprend des assertions de visibilité trop précoces pendant l’animation du dialogue. Après attente explicite de visibilité, `draft-guard-red-discard.log` isole le défaut réel de résurrection d’un brouillon pourtant abandonné ; celui-ci a été corrigé.

Les logs `router-*-trace.log` sont des expériences ayant établi qu’un état intermédiaire de navigation peut être coalescé. Ils justifient l’accusé frontend explicite finalement retenu ; aucune dépendance au contexte UNSAFE du routeur n’a été introduite. Ces tests de diagnostic ne sont pas comptés comme des tests fonctionnels supplémentaires du correctif final.
