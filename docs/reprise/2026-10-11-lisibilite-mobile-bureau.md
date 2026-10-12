# A-31, A-33, A-34 — libellés, exemples et onglet actif

Trois branches sont intégrées par des fusions réelles sur main 80f1de14, sans conflit : plancher des libellés sémantiques sur mobile, exemples de champ distincts sur bureau, défilement de la barre du bas vers l’onglet actif. Les couleurs d’encre plus récentes de main sont conservées : la comparaison directe de la branche ancienne aurait remis du blanc sur plusieurs boutons orange, tandis que la fusion effective ne fait que les ajouts utiles.

Mesure Chromium avec la feuille Sass compilée, sans pile E2E : `label`, `legend` et `th` rendent actuellement 11 px à 390/768 ; le plancher les porte à 12 px. Retirer uniquement la règle les ramène à 11 px. À 1440, les tailles ne changent pas. La fiche historique annonçant 9 px n’est donc pas une description de main aujourd’hui. Le relevé est joint ; il mesure la cascade CSS, pas un parcours client authentifié.

22 assertions passent dans les suites de libellés et d’onglets. Remplacer uniquement le calcul de défilement par main fait échouer les trois tests correspondants. Les 135 scénarios des deux fichiers E2E sont découverts mais non exécutés localement. Lint ciblé, types web et construction React Router passent. Le retrait de l’onglet ou de son branchement dans l’IDE reste protégé par le scénario navigateur à exécuter en CI.

État : lot préparé, pas fusionné sur main et pas servi. Les contrastes et la visibilité dans un projet réel restent à vérifier lors de sa livraison.
