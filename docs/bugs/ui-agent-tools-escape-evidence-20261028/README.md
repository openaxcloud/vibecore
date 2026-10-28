# Agent tools Escape — recette locale

Build compilé sur 6263bd719 + correctif local ChatBox/useKeybindings. Chromium local, API et runtime synthétiques isolés, aucun prompt envoyé ni mutation cliente. Le script conservé utilise les chemins de dépendances du workspace de recette.

Avant : les quatre formats 390/820/1280/1536 laissent le menu ouvert après Escape. Le test intégré du vrai ChatBox avec le hook global échoue sur cette même fermeture (1 échec, 9 réussites).

Après : 4/4 recettes réussies, fermeture du menu outils puis du dialogue Advanced, focus rendu au déclencheur, brouillon conservé, menus dans le viewport et zéro erreur JavaScript. 16/16 tests unitaires passent ; Ctrl+S reste global et Escape redevient global après fermeture.

Les captures montrent les menus ouverts ; receipt.json consigne les assertions de fermeture réussies. Le relevé géométrique du dialogue pendant son animation ne certifie pas toute sa mise en page. Aucun Safari, appareil physique, zoom natif200% ou backend réel validé.

Extension compilée : 5/5 recettes supplémentaires réussies à320×640,360×740,844×390 paysage,768×1024 et1920×1080, mêmes assertions et aucune erreur JS. Total9formats. Le lancement initial du test inventaire par node --test était incompatible avec Vitest ; relancé avec le runner du dépôt.

Revue indépendante : aucun défaut bloquant,16/16 tests exécutés séparément, aucun ignoré.
