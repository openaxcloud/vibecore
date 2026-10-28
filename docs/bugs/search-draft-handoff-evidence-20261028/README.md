# Search — brouillon, focus et remplacement de coque

Composants compilés réels dans Chromium local, API synthétiques isolées. Aucun fichier client remplacé, aucune sauvegarde ou recherche backend réelle certifiée.

## Défauts et contre-preuves

| Contrôle | Résultat et portée |
| --- | --- |
| Brouillon au remontage et au passage desktop/mobile | Témoins composants rouges avant raccord ; requête, remplacement et options conservés après correction, isolés par projet/workspace/fenêtre/panneau. |
| Remplacement de coque à 390, GET ide-state réellement retenu | Le premier patch focus échouait : reçu capturé, puis surface Search → Agent → Search ; champ absent pendant expiration. L'initialisation canonique Search corrige ce détour, sans augmenter le délai. |
| Même gate à 390 et 1280, build final | Deux recettes passent avec détachement de l'ancien champ exigé : alpha, focus et sélection 1–4 restaurés ; redimensionnements aller-retour réussis. |
| Agent → Retour → Suivant à 390, build final | Troisième recette finale réussie : brouillon conservé au Retour, aucun autofocus tardif ; Suivant réaffiche Agent. |
| Curseur/remplacement et contrôle extérieur | Deux recettes sur le build focus précédent passent ; saisie alpha → aXYZa et caret 4, sélection du champ Remplacer par conservée au resize ; composeur extérieur conserve son focus. |
| Split réel | Un nouveau panneau vide a été observé sur le build focus précédent ; la recette ne certifie pas toutes les dispositions à plusieurs panneaux. |

Les premiers essais rapides verts ne prouvaient pas le remplacement du champ. Ils n'ont pas été utilisés pour écarter l'échec déterministe mobile : celui-ci a été reproduit deux fois, puis corrigé et rejoué avec les mêmes assertions. Les cas échouant avant tout événement input ne sont pas présentés comme un brouillon enregistré puis effacé.

[Avant : focus mobile perdu](focus-before.png) · [Après : focus et sélection conservés](focus-after.png).

## Validations

34 tests ciblés réussis, aucun ignoré ; six gardes index réussis séparément. Revues indépendantes favorables, build client/SSR final, typage web officiel final, lint ciblé final et diff propres. Typage global officiel passé avant les derniers deltas web. Le nouveau E2E permanent, avec gate reçue explicitement, vérifie détachement/focus/caret et Retour/Suivant : collecté seulement en local, exécution attendue en CI (un cas Chromium390, deux projets ignorés).

Le premier lancement du typage global avait échoué faute de wrappers locaux de dépendances ; ils ont été isolés sans modification de manifeste puis la commande officielle a passé. Une invocation directe de tsconfig.json incluait les tests et leurs conflits DOM/Cloudflare : elle n'est pas le contrôle officiel du dépôt ; le contrôle web final utilise tsconfig.web.json, comme scripts/typecheck.mjs. Aucun contrôle de CI ou assertion n'a été affaibli.

## Limites

Pas de recette production, Safari/WebKit, appareil physique, clavier virtuel ou backend réel. L'état partagé n'inclut ni résultats, ni opérations, ni confirmations de remplacement, ni menus Terminal. Le Workbench historique sans identité de panneau garde son état local. Le `@ts-nocheck` préexistant de BaseChat exige les tests des expressions réelles et la recette compilée en plus du typage ; il n'a pas été étendu.
