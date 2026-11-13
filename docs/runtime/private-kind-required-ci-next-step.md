# PR925 : validation CI après intégration de PR926

[PR926](https://github.com/openaxcloud/vibecore/pull/926) a été validée puis fusionnée
sur main le 13 novembre 2026, au SHA
`95f035df6771552e0b71f691fbd0bd62ab914b9a`. PR925 intègre cette révision.
La proposition initiale de mode sans fournisseur est donc remplacée par son
implémentation revue ; les clés IA ne bloquent plus les checks de PR925.

## Checks requis au SHA de PR925

La mise à jour de la branche PR925 sans `[skip ci]` déclenche Production CI et
Production E2E, ainsi que les autres contrôles PR applicables. Leurs résultats
restent attribués au `head_sha` exact, distinct des preuves de recette kind.
La synchronisation et la mise à jour de cette note lancent ces checks ; leur
réussite n'est pas présumée et doit être constatée dans GitHub avant fusion.

Production CI ne référence aucun secret de fournisseur ni OIDC ; il utilise
PostgreSQL/Redis locaux et conserve la suite existante.

Production E2E n'injecte plus ANTHROPIC/OPENAI/OPENROUTER/GOOGLE. Ses deux appels à
`preparer-pile-e2e` utilisent `provider-mode: absent`, qui refuse toute clé présente.
La liste des tests, les tranches et le verdict bloquant sont conservés. Les E2E
sans fournisseur validés pour PR926 ne constituent pas à eux seuls un résultat
pour la tête de PR925, ni une validation de génération IA.

## Périmètre conservé

Le mode par défaut de l'action composite reste `required` pour ses autres
appelants. Le runtime nightly n'est pas déclenché par cette mise à jour : ses
événements restent `schedule` et `workflow_dispatch`.

Aucun check requis n'est désactivé ou exempté. La recette privée n'autorise pas le
déploiement : la porte de release conserve ses exigences de runs `push` sur
`main` et de SHA exact (`scripts/release-gate/required-checks.json`). L'extension
navigateur reste sur une branche séparée et n'est pas incluse dans PR925.
