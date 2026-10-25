# Actions Facturation et titre lisible

À 640 px CSS, le titre français était limité à 211,56 px par les deux actions horizontales : quatre lignes, bloc de 314 px. Une contre-épreuve DOM séparée montre le gain, sans modification de SaaSLayout.

Le correctif produit, uniquement dans billing.tsx, empile les deux liens entre 640 et 1023 px. À 640 px sur le build final6199 : titre de 378,97 px, deux lignes et bloc de 194 px. Petit mobile reste repliable et desktop horizontal. Destinations, libellés et traitements financiers inchangés.

Preuves avant/contre-épreuve : probe.json, before-640.png, after-counterproof-640.png. Preuve compilée : final.json (36 observations = neuf largeurs320→1440 × FR/EN × clair/sombre), final-640.png ; les deux liens restent visibles, au moins44 px de hauteur, sans débordement. billing-final.json reprend les48 observations Facturation, y compris erreur503 répétée et conservation des valeurs. Le zoom desktop natif final est documenté dans ../native-zoom/.

67 tests ciblés passent (billing15 et audit52), lint ciblé vert, typage web strict et build verts. Revue indépendante du delta : seul un wrapper responsive remplace le fragment ; aucune modification du shell, de son menu bas ou d’une action métier. Aucun achat, abonnement, donnée réelle ou déploiement testé.
