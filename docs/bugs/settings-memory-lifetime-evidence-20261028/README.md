# Settings / Memory — brouillons et largeur de panneau

Recette locale Chromium sur la source `380a92791` complétée par la règle CSS locale `grid-template-columns: minmax(0, 1fr)`. Les sources applicatives sont restées gelées pendant compilation et recette. API entièrement synthétique ; aucun enregistrement Memory réel, aucune donnée client et aucune recette production.

## Résultats

| Cas | Résultat réellement observé |
| --- | --- |
| 320→1280, 390→1280, 1280→768 | Onglet Memory, texte long et aperçu du brouillon conservés ; fermeture/réouverture conserve aussi le texte. |
| GET Memory en cours pendant resize | Un seul GET memories et un seul GET preferences pour le projet ; état conservé, pas de double requête. |
| Sauvegarde interceptée puis HTTP 503 pendant resize | Brouillon et erreur restent accessibles ; aucun POST n'atteint un backend réel. |
| Édition d'une entrée synthétique puis resize | Brouillon d'édition conservé. |
| Navigation vers un autre projet | État vide dans le nouveau projet ; navigation complète dans le navigateur, isolation SPA couverte séparément par les tests du provider. |
| JSON long ouvert : initial 360/820/1280, 390→1280 sombre, 390 sombre, zoom natif 200 % | Six recettes finales passent : champs bornés, contenu JSON intégral, défilement du préformaté, fermeture/réouverture et brouillon conservés. |

Avant correction de largeur, le panneau à 1280 px mesurait `clientWidth=588`, `scrollWidth=819`. Après correction : `588/588`. Le JSON reste complet et défile dans son propre bloc (`clientWidth=532`, `scrollWidth=780`). Le zoom est celui du navigateur : viewport CSS 1280×856, DPR 2, pas une simple émulation de densité.

## Preuves visuelles

- [JSON avant](json-before.png) et [après](json-after.png).
- [Brouillon après redimensionnement en sombre](resize-dark-after.png).
- [Formulaire mobile sombre](mobile-dark-after.png).

Les messages de runtime indisponible visibles dans la fixture ne constituent pas une panne production reproduite. Le libellé FR « Enregistrer la mémoire » appartient au lot #833 ; ce lot en est indépendant.

## Validation et limites

Build client/SSR, typage global, lint sans erreur (52 avertissements préexistants), 44 tests ciblés réussis (13 Memory, 23 palette existants, 2 preview/CSS, 6 gardes index), aucun ignoré, et revue indépendante exécutés. Le `@ts-nocheck` préexistant de BaseChat impose une preuve de rendu en plus du typage ; le test compile le fragment JSX réel et ses imports. La garde CSS ne remplace pas les mesures navigateur ci-dessus.

Pas de Safari/WebKit, appareil physique, clavier virtuel, lecteur d'écran ou mesure exhaustive du contraste. Les thèmes clair/sombre sont inspectés sur ces états seulement. Le brouillon général Projet, les formulaires compte/sécurité, le focus après remplacement de coque et les opérations backend réelles ne sont pas certifiés par ce lot. Aucun contrôle de CI affaibli.
