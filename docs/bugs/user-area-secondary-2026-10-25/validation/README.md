# Validation du lot secondaire local

Base : #792, 71d080c9c32af00af83075051a5e3caab5a54564. Lot secondaire pas encore publié ni intégré à main. Base avancée sans changement de fichiers au commit de fusion #792 ef65c1e68bfdd203c4a0a56eedc427ad22053368 ; index régénéré à495 fiches.

154 tests ciblés uniques dans 27 fichiers : inventaire joint, résultats détaillés dans les sous-dossiers de preuve. Typage web strict : succès. Lint global : zéro erreur, 52 avertissements préexistants. Build final : succès.

Le premier build final a été tué avec code 137 après accumulation de 31 anciens serveurs locaux de cette mission (événement OOM confirmé). Ces seuls processus identifiés ont été arrêtés ; mémoire revenue à environ 1,3 Go. La relance sur le même code réussit. Cet échec environnemental est conservé et n'est pas compté comme validation réussie.

Les matrices sont associées à leurs builds successifs et aux fichiers exercés ; elles ne prétendent pas avoir toutes été rejouées sur le dernier build. Le dernier changement touche uniquement le token de couleur du lien Paramètres espace de travail ; sa vérification compilée est consignée séparément. Les empreintes finales des sources sont jointes.

Navigateur Chromium local et API synthétiques seulement. Aucune recette backend réel ou production authentifiée ; aucune opération financière, création de compte, invitation, révocation ou mutation client réelle. Voir la cartographie pour les pages non couvertes et les limites matérielles.

Les journaux texte archivés sont normalisés uniquement pour supprimer les espaces de fin de ligne et les lignes vides finales ; contenu et verdicts conservés.

Correction documentaire après CI #795 : Gitleaks8.21.2 a signalé une empreinte SHA-256 sur la ligne du chemin api-keys.tsx dans source-sha256.json. Le format sépare maintenant path et sha256 ; les onze empreintes sont identiques et vérifiées contre les fichiers. Aucun secret réel ni règle/exception Gitleaks ajoutée. La détection initiale et le résultat après correction restent distingués.
