# Rapport de couverture i18n EN/FR — état au 5 août 2026

Statut : **NON FAIT — fusion interdite**.

La plateforme dispose désormais d’une infrastructure i18n EN/FR, de catalogues en parité, d’une détection navigateur, d’un choix manuel persistant, de formats localisés, d’une garde source et d’une matrice Playwright de production. La preuve stricte « zéro anglais résiduel » échoue encore dans six fichiers dont les zones Terminal mobile et Solutions sont protégées ou coordonnées. Ce rapport ne transforme pas ces exceptions en validation.

## Résumé vérifiable

| Mesure                                        |                   État mesuré |
| --------------------------------------------- | ----------------------------: |
| Fichiers de catalogue EN/FR                   |                           198 |
| Entrées anglaises                             |                        18 179 |
| Entrées françaises                            |                        18 179 |
| Clés concordantes                             |                18 179 (100 %) |
| Familles de pluriels `_one` / `_other`        |                           203 |
| Fichiers source analysés                      |                         1 360 |
| Occurrences autorisées et justifiées          |                           767 |
| Résidus stricts                               |           145 dans 6 fichiers |
| Matrice live finale                           | 1 128 / 1 128 audits produits |
| Captures de la matrice finale                 |           2 256 EN/FR uniques |
| Preuves de négociation initiale               |                             8 |
| Audits sans finding lors de la matrice finale |     1 028 / 1 128 (91,1348 %) |
| Findings live, tous périmètres protégés       |                         2 624 |
| Scan source strict zéro                       |                     **ÉCHEC** |
| Autorisation de fusion                        |                       **NON** |

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
- tests web complets : 821 fichiers, 5 939 tests réussis, aucun échec ni test ignoré ;
- tests API complets : 176 fichiers réussis, 4 ignorés, 1 488 tests réussis et 35 ignorés ;
- tests de services ciblés : preview-proxy 7 fichiers/81 tests, workspace-manager 6 fichiers/80 tests (1 fichier/7 tests ignorés), workspace-agent 6 fichiers/76 tests, connector-proxy 5 fichiers/24 tests et worker 6 fichiers/37 tests, tous réussis ;
- typecheck étendu : réussi pour le web, les scripts Node, Electron et les 34 paquets/services ;
- lint : zéro erreur, 27 avertissements historiques ;
- `actionlint` et validation des actifs CI/CD : réussis ;
- build production final : réussi, 9 459 modules client et 1 249 modules SSR transformés.

Un premier typecheck a détecté un usage orphelin de l’ancienne constante `PREVIEW_STARTING_HTML`. La branche le remplace par le générateur localisé typé, vérifie le statut 503 en français et repasse le typecheck global ainsi que les 81 tests preview-proxy. Les premiers timeouts API/worker observés pendant l’exécution simultanée de plusieurs suites ne se reproduisent pas en isolation ; les résultats isolés ci-dessus font foi.

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

### Contrôle des zones coordonnées

La comparaison à `origin/main` confirme que les fichiers `mobile-ide-tabs.ts`, `TerminalTabs.tsx`, `solutions._index.tsx` et `solutions.$slug.tsx` sont identiques. Les deux blocs gelés de `BaseChat.tsx` sont aussi identiques : header mobile SHA-256 `56ee8e62…e76`, dock mobile `947e6d09…55ca`. Le bloc `solutionPages` du composant marketing partagé est identique, SHA-256 `faeda7c5…bdc07`. Les fonctions de rendu partagées autour de ce bloc ont été localisées ; le chrome rendu peut donc évoluer sans modifier les données Solutions coordonnées.

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

## Matrice live finale

Révision live auditée : `ca6cb4e296814fc4b8a7813d37357826b71a1ea6`. Révision statique finale avant mise à jour de ce rapport : `537d384329c1134cd6104a4eec8ba08988db2990`.

La matrice finale a utilisé le bundle SSR de production, l’API réelle et PostgreSQL. Elle ajoute deux chemins HTTP 404 localisés à la taxonomie initiale et exerce 141 routes ou panneaux, deux thèmes, quatre viewports et les deux locales. Elle enregistre dans chaque JSON le statut HTTP, la locale, le thème, le SEO, le switch, sa géométrie, les erreurs navigateur et les entrées sémantiques rendues.

| Contrôle                                                |                  Résultat |
| ------------------------------------------------------- | ------------------------: |
| Audits route × thème × viewport                         |             1 128 / 1 128 |
| Captures EN/FR                                          |                     2 256 |
| Preuves de négociation initiale                         |                         8 |
| Artefacts totaux                                        |                     3 392 |
| Artefacts invalides, manquants ou inattendus            |                         0 |
| Entrées sémantiques FR analysées                        |                   157 623 |
| Combinaisons sans finding                               | 1 028 / 1 128 (91,1348 %) |
| Combinaisons avec finding                               |               100 / 1 128 |
| Findings                                                |                     2 624 |
| Réponses EN et FR                                       |    1 112 × 200 + 16 × 404 |
| Réponses 5xx                                            |                         0 |
| Débordements horizontaux documentaires                  |                         0 |
| Pages blanches                                          |                         0 |
| Erreurs console, page ou JavaScript                     |                         0 |
| Anomalies langue, thème, switch, SEO ou interaction     |                         0 |
| Groupes de switch / boutons                             |             1 128 / 2 256 |
| Boutons hors viewport ou sous la cible tactile minimale |                         0 |
| Preuves compactes IDE/Git sans chevauchement            |                   12 / 12 |
| Scénarios Playwright réussis                            |                    9 / 16 |

Les sept scénarios rouges sont attendus parce que l’assertion finale exige réellement zéro finding : les quatre scénarios marketing échouent sur Solutions/Enterprise et les trois scénarios user compacts (`1024`, `768`, `390`) échouent sur le header IDE gelé. Le scénario user desktop `1440` est vert. Aucun échec inattendu n’a été relevé.

Répartition par viewport :

| Viewport | Audits propres | Audits sales | Findings | Cause                                  |
| -------- | -------------: | -----------: | -------: | -------------------------------------- |
| 1440     |            260 |           22 |      620 | Solutions/Enterprise                   |
| 1024     |            256 |           26 |      668 | Solutions/Enterprise + header IDE gelé |
| 768      |            256 |           26 |      668 | Solutions/Enterprise + header IDE gelé |
| 390      |            256 |           26 |      668 | Solutions/Enterprise + header IDE gelé |

Les 2 624 findings se répartissent en 2 480 occurrences Solutions/Enterprise et 144 occurrences du header IDE compact, sans autre résidu. Par canal : 1 908 textes, 336 libellés ARIA, 200 métadonnées, 112 textes alternatifs, 60 attributs `title` et 8 titres de document. Par signal : 2 520 termes interdits, 72 correspondances anglaises et 32 signaux lexicaux anglais.

La géométrie du switch compact a été vérifiée dans 12 preuves IDE/Git : écart de 8 px sous le header, écart de 3 px avant le contenu, aucun chevauchement, deux boutons de 44 × 44 px entièrement dans le viewport. La revue visuelle finale des captures `1024`, `768` et `390`, en clair et sombre, confirme que le switch et le badge « Inactif » restent visibles.

## Résidus live finaux

Les résidus suivants ne sont pas des faux positifs et restent bloquants :

- `/solutions` et les cartes Solutions contiennent du texte anglais et des anglicismes visibles ; avec `/enterprise`, ce périmètre totalise 2 480 findings sur les quatre viewports ;
- `/enterprise` contient notamment `What you can build`, `Production workflow`, `Code review`, `Runtime preview` et `Deployment path`, y compris dans les métadonnées ;
- les vues IDE/Git compactes rendent encore `Ready for the next change`, `Back to dashboard`, `Activity`, `Open tools`, `Open tab switcher`, `Open tabs` et `Add new tab` depuis le bloc coordonné de `BaseChat.tsx`, soit 144 findings sur `1024`, `768` et `390` ;
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
- l’absence de troncature élément par élément sur chaque nœud ; le crawl mesure le débordement du document et la géométrie du switch, tandis que les troncatures du header compact gelé restent visibles et bloquantes ;
- la fonctionnalité réelle de chaque preview IDE ;
- une revue humaine de chacune des 2 256 captures ou une comparaison visuelle automatisée ; la revue humaine finale a porté sur un échantillon représentatif marketing, auth, dashboard, 404 et IDE compact clair/sombre.

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
