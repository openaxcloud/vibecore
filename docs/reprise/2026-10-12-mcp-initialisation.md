# Initialisation MCP : contrôle mobile après disponibilité

Le contrôle E2E de la branche principale a8108ea7, exécution 38190001371, échoue sur le menu du composeur à 390 px : le test exigeait que seule l’amélioration du prompt soit désactivée, alors que MCP était encore en initialisation. Trois tentatives portent la même assertion ; il ne s’agit pas d’une famine d’exécuteurs. Rapport de la tranche 1 : artefact 11722065007.

Le déclencheur expose désormais son état réel via `aria-busy`, transmis au bouton DOM. Le test navigateur attend la fin de cet état avant de contrôler la désactivation, l’ouverture et la géométrie. Le plafond est de 45 secondes ; une initialisation qui ne termine pas reste un échec. Aucune exemption E2E ajoutée.

Validation locale : 20 cas du composeur sur deux fichiers, collecte de six cas navigateur, types web, construction web et lint des quatre fichiers modifiés passent. Les deux langues vérifient la désactivation pendant une promesse en attente puis la disponibilité après résolution, avec les libellés issus du catalogue existant. Retirer `ariaBusy` fait échouer les deux nouveaux cas ; retirer la désactivation aussi. Restauration : 20 cas verts. La suite navigateur complète relève de la CI, elle n’a pas été exécutée localement.
