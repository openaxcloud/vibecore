# Contraste calculé — build local 8799

Mesure FR uniquement, 320 et 1440 px, clair et sombre : **16 cas**, **612 échantillons textuels mesurés**, **432 exclus**. Minimum **5,1784:1**, aucun échantillon retenu sous4,5:1 et aucun échec au seuil applicable. Zéro erreur JavaScript et zéro mutation tentée. Aucune correction produit n’a été appliquée à la suite de cette mesure.

| Route | Cas | Échantillons mesurés | Exclus | Minimum | Échecs |
| --- | --- | --- | --- | --- | --- |
| `/` | 4 | 24 | 56 | 15.9240:1 | 0 |
| `/pricing` | 4 | 544 | 72 | 5.1784:1 | 0 |
| `/login` | 4 | 24 | 132 | 5.1784:1 | 0 |
| `/signup` | 4 | 20 | 172 | 5.1784:1 | 0 |

Les comptes représentent des échantillons par combinaison de route, largeur et thème, pas612 textes uniques. Le minimum correspond notamment au texte blanc `rgb(255,255,255)` sur le fond opaque `rgb(194,65,12)` (`--vc-action-primary-strong`) de Tarifs : accroche de facturation annuelle, bouton Mensuel et badge Recommandé. Le reçu fournit tag, classe, texte, couleurs, taille, graisse, fond couvrant et ratio pour chaque échantillon.

## Méthode et exclusions

La conversion sRGB, luminance relative et formule `(Lclair+0,05)/(Lsombre+0,05)` reprennent le helper `docs/bugs/user-area-2026-10-25/scripts/contrast.cjs`. Les couches de couleur uniforme des ancêtres sont compositées de la même manière. Les seuils consignés sont4,5 pour le texte normal,3 pour le grand texte ; le résultat est également contrôlé au seuil conservateur4,5 pour tous les échantillons retenus.

L’éligibilité a été restreinte pour éviter un faux verdict sur les calques publics : le helper initial ne voit pas les gradients peints par des frères absolus, tels que `.vc-auth-left-glow` et `.vc-auth-left-shade`. Les zones auth transparentes/translucides sans surface opaque couvrante sont donc exclues. Un fond opaque situé dans une branche explicitement peinte au-dessus du calque peut être mesuré ; sinon le fond est classé incertain. Les dégradés/images dans la chaîne d’ancêtres, opacités, alpha du texte et contrôles désactivés sont exclus.

Motifs **non exclusifs** parmi les432 éléments exclus :

-270 : calque décoratif superposé ou fond peint incertain ;
-224 : région auth à glow/translucidité sans surface opaque couvrante ;
-104 : élément non rendu ;
-84 : alpha du premier plan ;
-12 : dégradé/image dans les ancêtres ;
-12 : opacité dans les ancêtres ;
-8 : contrôle désactivé.

Un élément peut avoir plusieurs motifs : ces nombres ne s’additionnent pas pour reconstituer432.

## Limites précises

Le périmètre est `#main-content` pour Accueil et `main` pour les autres routes, dans le DOM initial après stabilisation. Header et footer ne sont pas mesurés. Les sections Accueil différées qui ne sont pas encore montées après défilement ne sont pas dans les candidats et ne sont pas comprises dans les432 exclusions. Les six échantillons Accueil par cas ne certifient donc pas l’ensemble de cette page. Les valeurs/placeholder des inputs, pseudo-éléments et états après saisie/erreur ne sont pas couverts par ce relevé de nœuds textuels HTML.

Le premier lancement utilisant `main` partout a expiré sur Accueil, dont le contenu existant est un div#main-content. Il n’a fourni aucune mesure ; son diagnostic est conservé. Le script a ensuite ciblé le conteneur réel, sans modification du produit.

Ce sont des **ratios calculés sur les surfaces retenues**, pas une appréciation visuelle ni une mesure pixel des dégradés. Pas de certification générale de contraste, d’accessibilité ou de production. Données et navigateur locaux, API3699 isolée. Les captures d’inspection visuelle des phases précédentes ne remplacent pas cette mesure.

## Rejouer

Depuis le dépôt avec Playwright et Chromium disponibles : `NODE_PATH=$PWD/node_modules UI_BASE_URL=http://127.0.0.1:8799 node .../contrast.cjs`. Le script exige une URL locale et écrit dans `/tmp/ui-public-contrast`. Il bloque les mutations et requêtes tierces. Aucune référence à des données réelles.
