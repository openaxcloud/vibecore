# A-17 — Domaines ouvre Déploiements sur son onglet Domaines

Fusion réelle de #379 sur main 80f1de14 : aucun conflit de code, seul l’index dérivé est régénéré. Le catalogue distingue la recherche et la grille ; la grille ne propose plus la carte doublon. Une recherche ou un ancien lien de menu vers Domaines ouvre Déploiements sur son onglet Domaines, avec une requête consommée une seule fois afin de ne pas écraser un changement manuel d’onglet.

32 assertions passent dans le catalogue, le store d’onglet demandé et l’index. Remettre uniquement le catalogue de main rend 13 cas rouges et neuf verts. Les anciennes dispositions persistées gardent leur branche de rendu compatible ; les nouveaux chemins d’ouverture sont normalisés. Lint ciblé, types web et construction React Router passent. Les scénarios de panneaux et de tableau de bord sont présents, pas exécutés localement.

État : préparé, pas fusionné sur main ni servi. Le parcours Domaines dans un projet réel reste à mesurer après livraison.
