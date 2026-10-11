# Actualisation réelle et partage de panneau conservé — A-16

La fusion réelle de la branche de #559 sur la reprise de persistance est sans conflit à cette date. Elle porte cependant 54 fichiers de travaux historiques : fusion interrompue, seuls les changements d’actualisation et de disposition ont été repris. Le correctif de raccourci Échap et les autres dérives ont été exclus. Les protections de persistance A-8, A-11, A-12 et A-14 du parent sont conservées.

« Actualiser les fichiers » et la reconnexion demandent explicitement la réconciliation du pod depuis le stockage durable. Les relectures ordinaires ne portent pas cette demande. L’API attend la réparation au plus huit secondes, avec une limitation de dix secondes ; passé la borne, la réparation poursuit en arrière-plan. Un lecteur peut lister mais ne déclenche aucune écriture, y compris à la première ouverture automatique : cette seconde porte a été trouvée par deux nouveaux tests rouges avant correction.

La disposition est conservée hors du composant pendant le remplacement des coquilles de chargement, par projet et fenêtre, avec expiration de trente secondes. La branche conserve un scénario navigateur de partage pendant une lecture IDE retardée ; ce scénario n’a pas été exécuté localement et reste à faire tourner en CI.

Mesures locales du 11 octobre : 24 tests application dans trois suites, 15 tests API dans deux suites, un test runtime distant sur les paramètres HTTP réellement émis. Retirer uniquement la garde d’écriture à l’ouverture rend deux tests API rouges (deux restent verts). Retirer la réparation explicite rend les quatre scénarios API rouges. Retirer la transmission HTTP de la réparation rend le test de transport rouge. Sources restaurées après chaque contre-épreuve.

Types web, API, runtime-contract et runtime-remote : verts. Constructions web, API et des deux packages runtime : vertes. Lint des ajouts : aucune erreur nouvelle ; le fichier API conserve ses 327 erreurs antérieures, runtime-remote conserve deux erreurs antérieures (nom WebSocketImpl et timer). Ces dettes ne sont pas présentées comme un lint global vert.

Cette branche est préparée, pas servie. La preuve utilisateur du partage pendant le chargement et celle de la réparation en production restent à établir après livraison.
