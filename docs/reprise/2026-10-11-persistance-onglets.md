# A-11 — persistance au clic d’onglet

Base de travail : main c7a6fa5025c18419988173179f8f30044d0253b3. Pas encore fusionné ni servi.

Le mécanisme mesuré dans le code réunissait l’état UI et la conversation complète avant chaque PUT. La proposition #666 ne garde que les écritures de proposition pendant un flux ; elle ne couvre pas les changements d’onglet.

La reprise envoie uniquement les domaines modifiés (UI ou conversation), ignore les écritures identiques et réunit les domaines en attente pendant le délai de regroupement. Une sauvegarde déjà vidée ne renvoie plus la copie complète depuis le cache. Le drapeau de remplacement des messages est maintenu lors du regroupement et après un conflit ETag 412. Le cache local conserve la conversation.

Quatre tests observent le corps réel envoyé à fetch : changement d’onglet avec conversation de 490 Ko donnant moins de 1 Ko sans conversation ; aucune requête pour un état identique, puis une requête pour un état différent ; regroupement UI/conversation avec remplacement explicite conservé ; deux appels simultanés ne produisent qu’un PUT.

Validation locale : 128 tests dans 13 fichiers de persistance/hooks verts, lint des deux fichiers changé vert, vérification complète des types verte et build React Router réussi. Contre-épreuve : les mêmes quatre nouveaux tests sur le code main échouent dans trois cas. Aucun contrôle CI ni mesure réseau en production n’est revendiqué ici.
