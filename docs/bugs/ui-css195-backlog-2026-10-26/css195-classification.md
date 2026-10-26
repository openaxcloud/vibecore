# Classification des 16 contextes à 195 px CSS

Lecture seule des reçus existants, sans nouvelle recette, serveur, build ou modification produit. Source de mesure : `receipt.json`, build cc5574d. Ces 16 contextes représentent quatre routes × deux langues × deux thèmes, pas 16 défauts distincts ni de nouvelles routes couvertes.

## Limite de l’émulation et du reçu

Zoom natif Chrome 200 %, DPR 2, visualViewport.scale 1. Fenêtre demandée 390, largeur externe effectivement mesurée 500, largeur interne CSS 195. Ce n’est **pas une recette sur téléphone physique 390 px**, ni un viewport CSS390. Le minimum de fenêtre Chrome rend l’interprétation matérielle de cette combinaison limitée.

Les 16 reçus donnent html.scrollWidth=195 : aucun débordement horizontal du document n’est démontré par cette métrique. Cela ne prouve pas l’absence de contenu masqué : des descendants sont hors cadre. body.scrollWidth, computed overflow des ancêtres, défilement horizontal atteignable et hit-testing ne sont pas enregistrés. Aucune capture CSS195 exploitable n’a été produite ; les captures CSS320 ne les remplacent pas. La coupure effective de pixels et l’impossibilité d’activer un contrôle ne sont donc pas établies. Les coordonnées verticales reflètent des positions de défilement différentes et ne prouvent pas une perte de contenu vertical.

Les rectangles sont ceux de h1/h2/h3/p/a/button dans main ; les Range ne couvrent que les nœuds texte directs des contrôles ciblés. Aucun élément absolu n’est identifié comme cause par ce reçu. Les décorations absolues présentes dans le code ne doivent pas être confondues avec les textes et actions mesurés.

## Matrice exacte

« Bord hors viewport » compte les contrôles dont le rectangle dépasse la largeur ; « Texte hors bord » compte les Range dépassant le contrôle, même lorsque le contrôle reste contenu. Ces catégories peuvent se recouper. Tolérance du harness : 1 px. Tous les contrôles signalés mesurent au moins 44 px de hauteur.

| Route | Langue | Thème | Éléments hors viewport | Bord contrôle hors viewport | Texte hors bord contrôle |
|---|---|---|---:|---:|---:|
| /dpa | fr | light | 1 | 0 | 0 |
| /student-dpa | fr | light | 12 | 3 | 2 |
| /marketing/deployments | fr | light | 60 | 4 | 0 |
| /marketing/teams | fr | light | 16 | 0 | 3 |
| /dpa | fr | dark | 1 | 0 | 0 |
| /student-dpa | fr | dark | 12 | 3 | 2 |
| /marketing/deployments | fr | dark | 60 | 4 | 0 |
| /marketing/teams | fr | dark | 16 | 0 | 3 |
| /dpa | en | light | 1 | 0 | 0 |
| /student-dpa | en | light | 9 | 3 | 2 |
| /marketing/deployments | en | light | 50 | 3 | 0 |
| /marketing/teams | en | light | 12 | 0 | 1 |
| /dpa | en | dark | 1 | 0 | 0 |
| /student-dpa | en | dark | 9 | 3 | 2 |
| /marketing/deployments | en | dark | 50 | 3 | 0 |
| /marketing/teams | en | dark | 12 | 0 | 1 |

## Défauts et pistes classés

### DPA — priorité faible, dépassement inline mesuré

`DPA.tsx:72` : lien `e-code.ai/subprocessors`, x=49…196,66 pour 195 CSS, soit 1,66 px de dépassement géométrique, dans les quatre modes. Aucun contrôle de demande PDF/Word signalé. Le lien n’impose pas explicitement de rupture de mot. Aucune coupure visuelle ni obstacle d’activation prouvé ; ne pas qualifier ce faible dépassement de panne de navigation. Test manquant : capture rapprochée, Range du lien et chaîne des overflow ; largeur document/body et atteignabilité.

### StudentDPA — priorité de suivi élevée parmi ces cas étroits

`StudentDPA.tsx:107–124` : les deux actions hero restent dans x=16…179, hauteur44, mais leur texte déborde leur propre bord (FR jusqu’à195,27 ; EN jusqu’à181). Il s’agit d’un défaut de confinement du libellé mesuré, distinct d’un bouton dont la boîte sort du viewport. Le bouton partagé hérite de whitespace-nowrap ; cause probable à confirmer par style calculé.

`StudentDPA.tsx:396–413` : trois actions des cartes contact ont une boîte x=41…246,98 en FR et …242,89 en EN, donc environ52/48 px au-delà du viewport. Le texte du premier lien sort également du viewport ; les libellés des autres peuvent rester dans celui-ci alors que leur surface déborde. Les titres et paragraphes voisins ont la même largeur. La grille sans colonne mobile explicite et les dimensions min-content sont une hypothèse étayée par la structure, pas une contrepreuve DOM pour ces cas. `StudentDPA.tsx:294` : trois titres des droits débordent en FR (droite223,84). Les actions PDF/Word déjà corrigées ne figurent pas dans ces alertes.

Tests manquants : styles calculés/ancêtres et visibilité des trois cartes, accessibilité par Tab et activation interne sans email, contrepreuve locale de reflow avant tout changement. Aucune nouvelle obligation de stockage ou fonction n’est impliquée.

### Marketing Deployments — priorité de suivi élevée, plusieurs zones indépendantes

`PublicDeploymentsPage.tsx:47–79` : hero h1/paragraphe jusqu’à266,90 FR /248,94 EN ; deux contrôles débordent à droite (expert jusqu’à205,84/196,92 ; docs266,90/248,94). Les textes directs de ces contrôles restent dans leurs bordures et dans le viewport, mais leurs surfaces débordent. La section source porte overflow-hidden et une grille mobile implicite ; cela motive une vérification de coupure des descendants, sans constituer ici une inspection pixel à195.

`PublicDeploymentsSections.tsx:343–349` : actions de fin centrées plus larges que le viewport. FR : consultation x=-20,38…215,39 ; intégrations x=-32,82…227,83. EN : intégrations x=-12,89…207,90. Leurs Range enregistrés restent dans le viewport : ne pas confondre surface de contrôle tronquée potentielle et libellé coupé. Le nowrap partagé/largeur intrinsèque est une piste locale.

D’autres textes/cartes des sections ont des rectangles hors cadre (60 éléments FR,50 EN au total avant correction). L’observabilité à `PublicDeploymentsSections.tsx:66` fait partie de cet ancien relevé : sa grille a depuis été corrigée et validée compilée à CSS320/1024/1440, 100/200 %, dans `../ui-p2-observability-final/receipt.json`. **CSS195 n’a pas été rejoué après correction** : ne pas conserver la totalité des anciens débordements comme défauts actuels avérés, ni présumer leur résolution à195. Le hero et les actions de fin sont des zones distinctes de cette correction.

Tests manquants : refaire uniquement195 sur le build corrigé, distinguer observabilité/hero/autres sections, mesurer ancêtres/Range et atteignabilité. Aucun défaut d’élément absolu établi.

### Marketing Teams — priorité de suivi élevée pour les libellés FR, moyenne pour les cartes

`PublicTeamPage.tsx:55–64,139–153` : les boîtes d’action restent x=16…179 et hauteur44 ; trois libellés FR et un EN sortent de leur bouton. Le texte FR « Contacter l’équipe commerciale » va de -20,54 à215,55, donc hors viewport des deux côtés ; les autres Range signalés restent dans le viewport malgré leur sortie du bouton. Cela établit la géométrie du texte, pas une coupure visuelle observée ni une action inutilisable.

`PublicTeamPage.tsx:72,113` : grilles de fonctionnalités/usages sans colonne mobile explicite. Titres/paragraphes des fonctionnalités : droite205,20 FR /200,44 EN ; certains usages FR jusqu’à207,42. Piste min-content/nowrap à confirmer par contrepreuve. Pas d’élément absolu démontré. Tests manquants : styles/ancêtres, capture195 et Tab sur ces actions, retour à la ligne local sans réduction du texte.

## Portée finale

Aucune route supplémentaire promue, aucun nouveau parcours compté. Blog n’appartient pas à ces16contextes : aucun signal du harness sur cette route dans la matrice initiale. Les limites de cette matrice restent inchangées (Chromium local, polices externes bloquées, aucune production, aucun email/envoi/backend réel). La suite utile serait une reproduction ciblée de ces quatre familles sur le build actualisé, si autorisée ; ce document ne prétend pas l’avoir exécutée.
