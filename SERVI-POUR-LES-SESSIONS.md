# Servi pour les sessions — journal des fusions

## Contrat du journal

Une ligne par fusion réellement observée, en UTC, avec PR, SHA de fusion, liste exacte des fichiers et attribution. Le titre du fichier n'est pas une preuve que tous les changements sont servis : fusion, livraison et vérification live restent séparées. Ajouter les futures fusions sans inventer celles de l'historique non encore recensé.

Amorçage documentaire du 12 octobre 2026 : les deux lignes ci-dessous sont des **observations historiques**, pas des fusions effectuées pendant cette préparation. Les heures et fichiers ont été relus via l'API GitHub des PR ; pour #711, l'ancien relevé ne donnait que 20:22 UTC, les secondes ci-dessous proviennent de cette lecture GitHub.

| Fusion UTC | PR | SHA de fusion | Attribution / portée de preuve | Fichiers modifiés |
|---|---|---|---|---|
| 2026-10-11 20:22:14 UTC | [#711](https://github.com/openaxcloud/vibecore/pull/711) | `27273f19029058e5e5da9e39bf46ada8d430c066` | Action historique de dot dans cette conversation : fusion effectuée le 11 octobre, avant cette préparation documentaire. Livraison non attestée par cette ligne, consulter les preuves de reprise. | `app/lib/i18n/catalogs/billing.payg-labels.spec.ts`<br>`app/lib/i18n/catalogs/billing.ts`<br>`docs/BILLING.md`<br>`services/api/src/app-public-copy.json`<br>`services/api/src/tests/admin-wallet-adjust.spec.ts`<br>`services/api/src/tests/payg-ledger-labels.spec.ts` |
| 2026-10-11 22:49:30 UTC | [#713](https://github.com/openaxcloud/vibecore/pull/713) | `2cec44b4dac5353f930ca2935e10e87bbabe23c9` | Action historique : proposition rédigée et poussée par dot ; fusion constatée par une autre session. Livraison non attestée par cette ligne, consulter les preuves de reprise. | `docs/TIERS_A_JOUR.md`<br>`scripts/fixtures/tiers-a-jour-release-history.json`<br>`scripts/fixtures/tiers-a-jour-release-history.md`<br>`scripts/tiers-a-jour.mjs`<br>`scripts/tiers-a-jour.regressions.ts`<br>`scripts/tiers-a-jour.spec.mjs`<br>`tsconfig.tiers-a-jour.json` |

Sources de reprise : [inventaire historique](docs/reprise/2026-10-11-inventaire.md), [complément et priorités](docs/reprise/2026-10-12-complement-inventaire.md), [point d'entrée](PROBLEMES.md).

Avant chaque nouvelle ligne, relever `merged_at`, `merge_commit_sha` et toutes les pages de la liste des fichiers de la PR. Identifier si la fusion a été effectuée par la session qui écrit ou seulement constatée. Conserver une référence à la CI du SHA final puis, séparément, au manifeste, à la comparaison des imageIDs et aux tests live disponibles. Une PR ouverte ou en brouillon n'a pas de ligne de fusion.
