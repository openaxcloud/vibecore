# Solutions EN/FR — rapport de finalisation

Statut au 13 août 2026 : **NON FAIT tant que les 96 captures et la matrice 128/128 ne sont pas vertes sur le déploiement contenant ce delta**.

## Inventaire et état courant

| Page                | Projet réel dédié |             EN |             FR | WebP importés/rejetés | Sources acceptées | Preuve live finale |
| ------------------- | ----------------- | -------------: | -------------: | --------------------: | ----------------: | -----------------: |
| Website Builder     | Meridian Studio   | contenu validé | contenu validé |                 24/24 |              0/48 |                  ☐ |
| Game Builder        | TriviaClash       | contenu validé | contenu validé |                 48/48 |              0/48 |                  ☐ |
| Dashboard Builder   | PipelineIQ        | contenu validé | contenu validé |                 24/24 |              0/48 |                  ☐ |
| Chatbot Builder     | HelpDesk Copilot  | contenu validé | contenu validé |                   0/0 |              0/48 |                  ☐ |
| Internal AI Builder | PeopleOps         | contenu validé | contenu validé |                   0/0 |              0/48 |                  ☐ |
| Enterprise          | Northwind Control | contenu validé | contenu validé |                   0/0 |              0/48 |                  ☐ |
| Startups            | Launchpad         | contenu validé | contenu validé |                   0/0 |              0/48 |                  ☐ |
| Freelancers         | Studio Ferro      | contenu validé | contenu validé |                   0/0 |              0/48 |                  ☐ |

App Builder est la référence et ne compte ni dans les huit pages, ni dans les 96 captures, ni dans les 128 lignes. Total actuel : **96 WebP importés, 96 rejetés, 0/384 source acceptée**.

## Couverture EN/FR

Le scan dédié compare toutes les feuilles des catalogues structurés, signale les traductions absentes, les valeurs EN/FR identiques non autorisées et la prose anglaise probable.

| Mesure            | Avant (`origin/main` au cadrage) | Après (branche de travail) |
| ----------------- | -------------------------------: | -------------------------: |
| Surfaces scannées |                8 pages de détail |          index + 8 détails |
| Chaînes EN        |                            1 208 |                      1 282 |
| Chaînes FR        |                            1 208 |                      1 282 |
| Résidus détectés  |                                0 |                          0 |
| Couverture        |                            100 % |                      100 % |

Le delta ajoute notamment les 48 alt d’images rédigés dans chaque langue, aligne les légendes sur le projet propre à chaque page et inclut les 18 chaînes de cartes de l’index. Les noms d’offres, marques de démonstration, noms propres et termes techniques conservés sont listés avec une justification exacte par `scripts/audit-solutions-fr-residuals.mjs --json` ; aucune prose n’est ignorée par motif global.

Résultat courant : `1 282/1 282` chaînes FR sur l’index et les huit pages, `0` résidu, `100 %`.

## SEO et navigation

- title, description, OG et Twitter passent par `t(path)` ;
- alt social localisé ;
- canonical identique EN/FR ;
- hreflang `en`, `fr`, `x-default` ;
- repli EN feuille par feuille ;
- suppression du toggle FR/EN local aux pages Solutions ; le toggle unique du top header reste la seule commande de langue ;
- `/solutions/internal-ai` → `/solutions/internal-ai-builder` en `308` conservé.

## Avant / après visuel

Avant, les huit déclinaisons réutilisaient explicitement les deux captures App Builder dans leur bande de preuve. La matrice du 10 août prouve l’ancien responsive (144/144 avec App Builder), mais pas l’exigence de projets uniques.

Après codage, le registre interdit tout fallback App Builder et exige 384 sources distinctes : 8 pages × 2 langues × 2 thèmes × 6 placements × 2 tailles. Les assets ne sont comptés que lorsqu’ils ont été promus par le gate de capture réel. État actuel : **0/384 accepté**. Les 96 WebP historiques importés sont **tous rejetés** : aucun des quatre lots n’a de manifeste de succès et 28 chemins présentent aussi un défaut visuel.

## Incidents de production observés pendant la reprise

- Webview native vide malgré un runtime `running`, un port 5173 `ready` et un proxy servant l’application : `Preview stayed empty`.
- Game EN : requête `ide-state` en HTTP `412`.
- Game FR : `Dependency sync skipped before preview: Remote runtime request failed: 404`.
- Des reprises ont affiché `Reconnecting` ; une bascule light/dark a échoué avec `Timeout 5000ms exceeded`.
- Pilote PeopleOps EN du 13 août : projet réel retrouvé, 7 fichiers et runtime synchronisés, puis échec sans promotion car le contrôle `More agent actions` attendu par le harnais n'existait pas dans cette variante du header IDE (`expect(locator).toBeVisible() failed`, timeout 60 s).

Ces occurrences ne valident aucun visuel, aucune capture finale et aucune ligne de matrice. Aucun identifiant de session ni secret n’est reproduit dans ce rapport.

## Preuve live finale

- Captures responsive déployées acceptées : **0/96**.
- Lignes de matrice responsive déployée acceptées : **0/128**.
- Statut : **NON FAIT** ; aucun ✅ live n’est coché.

## Gates restant à fermer

- [ ] 384/384 WebP authentiques et uniques présents ;
- [ ] build, typecheck, lint et tests scope verts ;
- [ ] branche rebasée sur le dernier `origin/main`, PR draft, commit ancêtre après merge ;
- [ ] déploiement vert contenant le SHA ;
- [ ] 96/96 captures finales ;
- [ ] matrice 128/128, overflow=0, troncature=0, switch EN↔FR, console=0 ;
- [ ] mise à jour des trois états sans cocher live prématurément.
