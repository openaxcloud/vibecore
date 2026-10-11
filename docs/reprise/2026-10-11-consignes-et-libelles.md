# A-25 et A-26 — état inconnu et consignes de périmètre

Deux fusions réelles depuis `4f7c07f7`, sans conflit ; comparaison directe de chaque fichier avec main avant reprise. Les changements sont additifs et conservent les détecteurs et traductions existants.

A-25 : l'état littéral `unknown`, quelle que soit la casse, utilise le catalogue i18n existant au lieu de rendre le terme technique brut.

A-26 : une restriction telle que « ne modifie aucun autre fichier » n'est plus classée comme refus global d'écriture. L'examen de chaque passage conserve la reconnaissance d'un vrai refus ailleurs dans la même demande. L'effet établi par la branche est une écriture autorisée à tort refusée ; ce point dépasse un simple libellé de réponse.

Mesures locales du 11 octobre : 48 assertions dans deux suites, toutes vertes. Remplacement des deux seuls détecteurs par ceux de main : sept assertions rouges, 41 vertes ; les fichiers corrigés sont restaurés. Lint des quatre fichiers : zéro erreur. Typecheck web complet : passe.

Le build React Router passe avec une limite de heap Node de 8 Go. Aucun scénario n'a été rejoué dans un compte de production ; la branche n'est pas encore fusionnée ni servie.
