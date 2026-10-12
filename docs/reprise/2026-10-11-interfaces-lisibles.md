# A-29 à A-34 — lot intégré des interfaces lisibles

Le lot mobile/bureau est complété par deux fusions réelles : l’encre des boutons Facturation/Usage suit les jetons du thème, et l’orange de texte conserve un ratio d’au moins 4,5 sur les surfaces claires teintées. Les aplats orange gardent leur couleur. Les correctifs de plancher mobile, d’exemples de champ et d’onglet actif sont conservés.

66 assertions passent ensemble dans six suites. Revenir aux deux liens de main rend la garde d’encre rouge ; revenir aux anciens jetons de texte rend la garde de contraste rouge. Les contre-épreuves du plancher et de défilement sont documentées dans le lot mobile. Lint ciblé, types web et construction React Router passent.

A-32 est déjà corrigé dans le code de main : les deux cases portent `shrink-0`, et ses sept tests passent. Une fusion réelle de sa branche ancienne révèle qu’elle réintroduirait l’ancienne feuille de réglages et les anciens modes ; l’essai est annulé. Le composant et sa garde restent identiques à main. La taille réellement rendue dans un projet client reste à mesurer après livraison ; le vert local ne la prouve pas.

Ce lot remplace, pour la livraison, la branche préparée `fix/reprise-lisibilite-mobile-20261011` ; ne pas livrer les deux séparément. État : préparé, pas fusionné sur main ni servi. Les scénarios navigateur de mobile/bureau et les contrôles live restent requis.
