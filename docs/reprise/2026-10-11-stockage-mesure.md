# A-5 — octets réels et signatures sous quota, réserves maintenues

Fusion réelle de `fix/audx-023-real-gcs-inventory` sur `4f7c07f7`. Quatre conflits, tous dans le client Prisma généré. Ils ont été résolus par régénération avec Prisma 7.8 depuis le schéma fusionné, jamais par assemblage manuel des clients. La migration ajoute une table de comptage ; aucune migration de production n'a été exécutée ici.

L'inventaire lit toutes les pages GCS et comptabilise les octets réels. Le comptage est conservé avec son horodatage. Les signatures d'upload portent leur taille maximale ; les scopes des jetons de stockage sont vérifiés par route.

## Compléments trouvés à la reprise

La branche ne contrôlait pas les téléchargements et pouvait faire confiance à un comptage faible récent ou autoriser une signature après un échec d'inventaire. Les deux routes de signature contrôlent maintenant l'inventaire vivant quand un plafond est configuré. Dépassement : 507 sans signature. Mesure indisponible : 503 sans signature. Le téléchargement sous quota reste permis.

Quatre nouvelles assertions de routes échouaient avant ce complément ; le témoin de téléchargement sous quota passait. Après correction : 85 tests API verts dans six suites, sept tests SDK verts. La suite de stockage (39 tests) a repassé après correction du lint de son harnais. Types API/SDK et build API passent. Le client généré conserve le format de Prisma, y compris ses espaces de commentaire ; le contrôle de whitespace exclut ces sorties générées.

## Réserves pour clore A-5

- Aucun plafond d'objets n'est défini par défaut : `OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT` absent ou nul désactive la garde. La valeur à appliquer a été demandée ; les limites `storage.gb` des volumes de travail ne sont pas transformées en quotas commerciaux inventés.
- Plusieurs URL peuvent être signées avant la fin de leurs uploads : la mesure réelle à chaque signature ne réserve pas les octets des uploads encore en cours. Une réservation durable et une réconciliation restent nécessaires pour une limite exacte sous concurrence.
- Les nouvelles mesures locales ne prouvent ni l'inventaire de buckets GCS de production ni les signatures réelles. Cette branche n'est pas fusionnée ni servie.
