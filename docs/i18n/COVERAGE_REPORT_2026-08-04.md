# Rapport de couverture i18n EN/FR — état au 5 août 2026

Statut : **NON FAIT — fusion interdite**.

La plateforme dispose désormais d’une infrastructure i18n EN/FR, de catalogues en parité, d’une détection navigateur, d’un choix manuel persistant, de formats localisés, d’une garde source et d’une matrice Playwright de production. La preuve stricte « zéro anglais résiduel » échoue encore dans six fichiers dont les zones Terminal mobile et Solutions sont protégées ou coordonnées. Ce rapport ne transforme pas ces exceptions en validation.

## Résumé vérifiable

| Mesure                                          |                   État mesuré |
| ----------------------------------------------- | ----------------------------: |
| Fichiers de catalogue EN/FR                     |                           198 |
| Entrées anglaises                               |                        18 179 |
| Entrées françaises                              |                        18 179 |
| Clés concordantes                               |                18 179 (100 %) |
| Familles de pluriels `_one` / `_other`          |                           203 |
| Fichiers source analysés                        |                         1 360 |
| Occurrences autorisées et justifiées            |                           767 |
| Résidus stricts                                 |           145 dans 6 fichiers |
| Première matrice live de diagnostic             | 1 112 / 1 112 audits produits |
| Captures de la première matrice                 |           2 224 EN/FR uniques |
| Audits sans finding lors de la première matrice |         916 / 1 112 (82,37 %) |
| Scan source strict zéro                         |                     **ÉCHEC** |
| Autorisation de fusion                          |                       **NON** |

La parité du catalogue prouve que chaque clé enregistrée possède une valeur EN et FR. Elle ne prouve ni que chaque surface dynamique a été exercée, ni que les 145 chaînes protégées ont disparu.

## Commandes de validation

```bash
pnpm run i18n:check
pnpm run i18n:scan:source:zero
TYPECHECK_TIMEOUT_MS=1800000 pnpm run typecheck
pnpm run lint
pnpm test
pnpm --filter @vibecore/api test
pnpm run build
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
PLAYWRIGHT_BASE_URL=http://localhost:5173 \
PLAYWRIGHT_API_URL=http://127.0.0.1:3001 \
I18N_FULL_LIVE_AUDIT=1 \
I18N_CAPTURE_ALL=1 \
pnpm exec playwright test tests/e2e/i18n-french-live.spec.ts \
  --config=playwright.i18n.config.ts
```

Résultats statiques connus sur le worktree audité :

- `i18n:check` : réussi, 18 179 clés EN/FR concordantes et baseline stable ;
- `i18n:scan:source:zero` : échec attendu, 145 résidus ;
- tests web complets : 817 fichiers, 5 916 tests réussis ;
- tests API complets : 176 fichiers réussis, 4 ignorés, 1 488 tests réussis et 35 ignorés ;
- typecheck étendu : réussi pour le web, les scripts Node, Electron et les 34 paquets/services ;
- lint : zéro erreur, 27 avertissements historiques ;
- build production : réussi sur le bundle final destiné à la seconde matrice.

## Scan source strict

L’inventaire exhaustif des 1 360 chemins se trouve dans [`SOURCE_SCAN_INVENTORY_2026-08-04.json`](./SOURCE_SCAN_INVENTORY_2026-08-04.json). Le scanner couvre `app`, `apps`, `packages`, `public` et `services`, notamment :

- textes JSX et expressions rendues ;
- attributs accessibles, placeholders, titres, aides et tooltips ;
- textes visibles d’objets, états vides, validations, toasts et notifications ;
- messages littéraux de `Error` et `Response` ;
- métadonnées SEO ;
- HTML actifs et HTML embarqués qui appartiennent au chrome produit.

Répartition des 145 résidus :

| Fichier coordonné ou protégé                         | Résidus |
| ---------------------------------------------------- | ------: |
| `app/lib/mobile-ide-tabs.ts`                         |      60 |
| `app/components/workbench/terminal/TerminalTabs.tsx` |      48 |
| `app/components/chat/BaseChat.tsx`                   |      16 |
| `app/components/marketing/EcodeMarketingPages.tsx`   |      13 |
| `app/routes/solutions._index.tsx`                    |       4 |
| `app/routes/solutions.$slug.tsx`                     |       4 |

Par règle : 43 attributs visibles, 10 expressions JSX, 13 textes JSX, 2 messages d’erreur, 74 copies visibles d’objets, 2 métadonnées SEO et 1 message de réponse.

La CI exécute `pnpm run i18n:check`. Cette garde compare le résultat à une baseline signée par fichier : toute nouvelle occurrence, hausse ou substitution non approuvée échoue. C’est une garde anti-régression, pas un certificat zéro. Seul `pnpm run i18n:scan:source:zero` fournit ce certificat, et il est rouge.

## Première matrice live de diagnostic

La première matrice a utilisé le bundle SSR de production, l’API réelle et PostgreSQL. Elle a exercé :

- 84 routes du sitemap marketing ;
- 7 routes auth ;
- 34 routes de l’espace utilisateur ;
- 14 routes/panneaux projet ;
- 2 thèmes, 4 viewports (`1440`, `1024`, `768`, `390`) et les deux locales.

Résultats dédupliqués :

| Contrôle                                       |          Résultat |
| ---------------------------------------------- | ----------------: |
| Audits route × thème × viewport                |     1 112 / 1 112 |
| Captures EN/FR                                 |             2 224 |
| Entrées sémantiques FR analysées               |           156 668 |
| Combinaisons sans finding                      |       916 / 1 112 |
| Combinaisons avec finding                      |       196 / 1 112 |
| Findings répétés                               |             2 944 |
| Réponses 5xx                                   |                 0 |
| Débordements horizontaux documentaires         |                 0 |
| Pages blanches                                 |                 0 |
| Exceptions de page non interceptées            |                 0 |
| Switch de langue réellement absent             |                 0 |
| Anomalies canonical/hreflang/OG/Twitter        |                 0 |
| Erreurs console transitoires `Failed to fetch` | 17 dans 15 audits |
| Scénarios Playwright réussis                   |            8 / 16 |

Les 7 routes auth et les tests de détection/bascule ont réussi sur les quatre viewports. Les quatre lots marketing et les quatre lots user/IDE ont échoué.

Cette première exécution a révélé puis permis de corriger hors zones protégées :

- les anglicismes de catalogues `stack`, `workflow`, `streaming`, `responsive` et `starter` ;
- les tags machine rendus directement (`frontend`, `dashboard`, `streaming`) sans changer leurs IDs ni les filtres URL ;
- les faux positifs sur commandes slash, chemins, noms de produit, offres commerciales et homographes français ;
- la locale EN perdue après une redirection ;
- le faux négatif causé par la sélection du premier switch caché ;
- la simulation incomplète du thème clair dans les préférences projet.

## Seconde matrice de validation

La seconde matrice ajoute deux chemins HTTP 404 localisés et produit 1 128 audits, 2 256 captures EN/FR et 8 preuves de négociation lorsqu’elle est complète. Elle enregistre aussi la locale et le thème réellement rendus dans chaque JSON et ne duplique plus physiquement les artefacts Playwright.

**Résultat final : en attente de la reconstruction et de l’exécution sur le dernier worktree.** Cette section doit être remplacée par les nombres réels avant publication de la PR.

## Résidus live déjà confirmés

Les résidus suivants ne sont pas des faux positifs et restent bloquants :

- `/solutions` et les cartes Solutions contiennent du texte anglais et des anglicismes visibles ;
- `/enterprise` contient notamment `What you can build`, `Production workflow`, `Code review`, `Runtime preview` et `Deployment path`, y compris dans les métadonnées ;
- les vues IDE/Git rendent encore `Ready for the next change`, `Back to dashboard`, `Activity`, `Open tools`, `Open tab switcher`, `Open tabs` et `Add new tab` depuis le bloc coordonné de `BaseChat.tsx` ;
- les chaînes du Terminal mobile et des onglets IDE gelés restent détectées statiquement, même quand le crawl de routes ne les ouvre pas.

Ces fichiers n’ont pas été modifiés dans leurs blocs protégés. La coordination demandée prime sur une modification unilatérale, mais elle ne transforme pas les résidus en exception acceptable pour la définition de fini.

## Couverture et limites de la preuve

La matrice contrôle le rendu visible, les attributs humains, le titre, les descriptions SEO, le statut HTTP, `<html lang>`, le thème, la présence du switch, le débordement horizontal global, la page blanche, la console et les erreurs JS.

Ne sont pas encore prouvés de bout en bout :

- la page 500 réelle ;
- le rendu transactionnel dans Mailpit des e-mails de bienvenue, reset, factures et alertes ;
- les erreurs API déclenchées puis rendues dans chaque panneau ;
- les parcours OAuth/SSO réels ;
- chaque modal, menu, tooltip, toast, validation et état async ;
- l’ouverture interactive de tous les panneaux IDE, notamment Terminal, Problems et Agent ;
- l’absence de troncature élément par élément ; le crawl mesure le débordement du document ;
- la fonctionnalité réelle de chaque preview IDE ;
- une revue humaine de chacune des 2 224 captures ou une comparaison visuelle automatisée.

La couverture rendue ne doit donc pas être présentée comme 100 %, même si une future matrice de routes devient verte.

## Termes laissés en anglais avec justification

Sont volontairement conservés :

- marques et noms propres : E-Code, VibeCore, GitHub, Vercel, OpenAI, etc. ;
- protocoles et standards : API, URL, OAuth, SSO, SCIM, SAML, HTTP, WebSocket, Open Graph ;
- `commit`, Git, Terminal, commandes, options, identifiants, variables, clés, URLs, chemins et code ;
- noms de modèles et contenu utilisateur ;
- Starter, Core, Pro, Enterprise et Team uniquement lorsqu’il s’agit des noms officiels d’offres.

Le détail normatif est dans [`GLOSSARY_FR.md`](./GLOSSARY_FR.md).

## Preuves CI et artefacts

Le workflow [`i18n-live-audit.yml`](../../.github/workflows/i18n-live-audit.yml) lance un job indépendant par viewport sur chaque PR, avec PostgreSQL, Redis, Mailpit, API et bundle SSR réels. Il téléverse systématiquement les JSON, captures et journaux, même si un viewport échoue. Les artefacts sont conservés 14 jours.

Le dossier local `test-results/` est ignoré par Git. Les captures ne doivent pas être ajoutées au dépôt ; les artefacts CI de la PR sont reliés au SHA audité et conservés 14 jours. Ils constituent une preuve temporaire à archiver hors de Git si une conservation plus longue est requise.

## Décision

Le travail est publiable uniquement dans une **PR draft non fusionnée** afin d’exposer le code, les scans et les artefacts. Les cases « Codé sur main » et « Testé live » des fichiers de suivi restent décochées tant que les 145 résidus, les échecs live et les scénarios non exercés ci-dessus ne sont pas résolus.
