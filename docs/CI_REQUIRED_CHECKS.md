# Validation des propositions : attendre une mesure réelle

Le run `37835320948`, tentative 1, a échoué le 8 octobre 2026 sur le commit
`b8f2a05483f3eca9e7fba23ede9848cba821f984` : le contrôle CI requis n'était
pas encore enregistré quand l'action d'attente l'a cherché. Le même commit,
relancé une fois les contrôles présents, a réussi le 9 octobre (tentative 2).
Ce n'était ni un test produit rouge ni une raison de contourner la validation.

`scripts/wait-required-pr-checks.mjs` attend l'enregistrement et la fin de la
CI ainsi que des **deux** contrôles matriciels CodeQL. Seul `success` est accepté.
Un échec, une annulation, un contrôle sauté ou une conclusion manquante bloque.
Une absence persistante bloque après 60 minutes ; le job a une limite de 65
minutes. Les erreurs d'API se propagent. La lecture est paginée et chaque tour
journalise les contrôles encore attendus. La dernière tentative de chaque
contrôle prévaut sur ses anciennes tentatives.

Le workflow utilise le SHA de tête de la proposition, pas le SHA de fusion
temporaire. Il n'emploie pas `continue-on-error` pour la porte obligatoire.
La sécurité ne repose plus sur le nom inexistant `CodeQL Analysis` : GitHub
affiche `CodeQL Analysis (javascript)` et `CodeQL Analysis (typescript)`.

Validation : `node --test scripts/wait-required-pr-checks.test.mjs`, cinq tests
de logique et un garde d'intégration au workflow. Retirer l'attente des contrôles
absents fait rougir les tests d'enregistrement et de délai. Retirer son appel
du workflow fait rougir le garde d'intégration. Cette correction ne modifie
ni les permissions, ni le mécanisme de livraison production.
