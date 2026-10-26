# AdminUsers — recette du correctif compilé

Source `3031e1e700fb3530e88d855f44527a143a433795`, build commun exécuté par le parent avec exit0 ; journal copié. Provenance serveur14499/API7299 et SHA256 bundle dans server-origin.json. Aucune injection DOM/CSS dans cette recette.

`receipt.json` completed, exit0 :16contextes320/390/820/1440 ×FR/EN ×clair/sombre. Le data-theme calculé correspond à chaque thème demandé, levant cette limite du reçu avant.64cibles (trois tris et menu du premier utilisateur) actives : largeur et hauteur minimales44px, centre plus quatre points internes à6px des bords réellement atteignables par elementFromPoint, soit320points contrôlés. Tableau défilé horizontalement jusqu’au menu sur mobile (scrollLeft390 à320FR,281 à390FR), conteneur dansviewport.

16parcours tri GET par Entrée puis menu par Entrée/Escape, retour du focus au déclencheur : tous réussis. Le menu est visible et ses bornes horizontales sont dans le viewport ; ses bornes verticales n’ont pas fait l’objet d’une assertion dédiée. Aucun item de menu sélectionné. Le tableau volontairement plus large conserve ses colonnes ; pas de suppression de contenu ou de pagination modifiée.

Zéro erreur JS, zéro échec,32GET de polices externes bloqués, aucune mutation tentée. Auth, utilisateurs et réponses API strictement synthétiques. Aucun mot de passe réel, rôle, suspension, impersonation ou permission utilisés. Pas de certification WCAG globale, Safari, lecteur d’écran, clavier OS/virtuel, zoom ou safeareas pour ce lot.

Les deux captures ciblées FRclair320/1440 ne constituent pas une inspection visuelle exhaustive des16contextes. La preuve principale mesure cibles, hit-tests, thème, table et parcours. Les limites CSS195 et capture Observabilité200 % sont archivées séparément dans `ui-css195-backlog-2026-10-26`, sans changement de couverture ni correctif associé.

Tous les navigateurs sont fermés dans finally. cleanup.json vérifie les PID propres221556/221555, startTicks/cmdline avant arrêt, puis états Z sansRSS/cmdline et ports14499/7299 refusés. Aucun autre processus touché. Main/live restent faux ; aucun source/index/push modifié pendant la recette. Logs archivés avec fins de lignes normalisées et espaces finaux retirés.
