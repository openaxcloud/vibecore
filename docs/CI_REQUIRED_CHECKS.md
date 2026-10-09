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
Le bloc GitHub Script est autonome : il ne charge aucun module de la proposition
dans l'action porteuse du jeton. Les permissions du jeton sont en lecture seule
(`contents`, `checks`, `pull-requests`). Les modifications de workflow restent à
revoir comme toute modification de politique CI ; la porte de livraison production
indépendante, liée aux identités des workflows, n'est pas remplacée par ce contrôle.
Un garde compare le code du bloc autonome au module testé pour prévenir une divergence.
La sécurité ne repose plus sur le nom inexistant `CodeQL Analysis` : GitHub
affiche `CodeQL Analysis (javascript)` et `CodeQL Analysis (typescript)`.

Validation : `node --test scripts/wait-required-pr-checks.checks.mjs`, cinq tests
de logique et un garde d'intégration au workflow. Retirer l'attente des contrôles
absents fait rougir les tests d'enregistrement et de délai. Retirer son appel
du workflow fait rougir le garde d'intégration. Cette correction réduit les
permissions du jeton de validation ; le mécanisme de livraison production reste inchangé.

Le nom `.checks.mjs` évite que Vitest découvre cette suite `node:test` comme
un fichier Vitest. Le run `37886840838` a révélé cette collision : 9 171 tests
Vitest réussis, puis « No test suite found » sur le fichier Node. La suite Node
reste obligatoire dans le job de validation et n'est pas supprimée.
