# A-8, A-11, A-12, A-14 — histoire persistée et reprises cohérentes

Le lot d’historique déjà validé est intégré par une fusion réelle sur main 80f1de14, puis la branche `fix/rattrapage-sa-propre-copie` est fusionnée sans conflit. Les lectures avortées restent réessayées, l’échec d’historique reste visible et les changements d’onglet n’envoient plus à nouveau une conversation identique.

Le rattrapage refuse une copie qui porte encore le raisonnement du navigateur : elle n’est pas la réponse finale du serveur. La persistance serveur retire ces blocs et la garde API compare le texte utile des deux copies, afin qu’une copie partielle avec raisonnement ne remplace pas la réponse complète. Un test compare les deux détecteurs réels, côté app et API, pour tenir leur contrat commun.

89 assertions passent dans neuf suites : 79 côté app et 10 côté API. Retirer les trois nouveaux mécanismes rend neuf tests rouges et 21 verts. Les contre-épreuves de déduplication, d’abandon de lecture et de retour de session ont été exécutées dans le lot d’historique initial. Lint ciblé, types web/API et constructions web/API passent. Les scénarios navigateur d’historique sont présents mais non exécutés localement.

La branche `fix/rechargement-sans-reexecution`, annoncée en conflit dans l’inventaire, est aujourd’hui identique à main sur son code et ses six tests : elle n’est pas fusionnée inutilement. Les branches anciennes susceptibles de retirer du code de protection ne sont pas reprises.

État : préparé, pas fusionné sur main et pas servi. Ce lot touche workbench.ts comme la reprise de tour ; son intégration avec cette livraison et ses contrôles complets reste nécessaire avant fusion.
