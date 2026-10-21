# Diagnostic d'export ZIP — dépendance de #749

Base `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`. PR #749 rapporte un GET `/projects/.../export/zip` en 8463,7 ms côté API, requestId `44e37806-3665-49c8-9bea-c30225ee0d3c` (1792566825372 → 1792566833836). Seuls le résumé et les sources publiés ont été accessibles ici ; les traces brutes de l'autre environnement ne sont pas présentes. Aucune attribution de ces 8,46 s n'est démontrée.

## Modification diagnostique

`services/api/src/app.ts` : route export/zip et mesure optionnelle de son helper de lecture/matérialisation. Un événement `project.export_zip.timing`, corrélé par le reqId existant du logger, donne les durées murales en ms de authorize, listFiles, ideState, materialize, zip, persist, activity, audit ; état success/failed, dernière étape, nombre de fichiers et octets ZIP. Aucune clé d'archive, chemin de fichier, contenu, session ou valeur d'erreur n'est ajoutée au log. Les opérations restent attendues dans le même ordre ; aucune écriture déplacée en arrière-plan, aucun timeout ou contrôle d'accès modifié.

Comparer cet événement avec le log Fastify de fin de requête du même reqId. `totalMs` couvre le handler, PAS les hooks précédents, la sérialisation et l'envoi de la réponse. Un grand écart oriente vers ces portions ; une étape longue oriente vers disque/état IDE/matérialisation/ZIP/DB. Une durée murale inclut aussi l'attente de l'ordonnanceur du processus : elle ne prouve pas à elle seule une lenteur propre au fournisseur. Aucun correctif de performance revendiqué à ce stade.

## Mesures réelles locales

Premier passage : 5 tests réussis, zéro saut. 14 exports réels et deux refus inter-organisations. Deux petits fichiers : première matérialisation 53,16 ms ; dix répétitions 11,36–18,87 ms ; nouvelle application et connexion 57,17 ms. Deux exports de 200 fichiers texte de 4096 octets : 470,86 ms à froid (matérialisation 398,58 ms), 232,04 ms à chaud (lecture disque 145,74 ms). Les valeurs sont conservées dans `initial-timings.json` et leur empreinte ; ce sont des observations, pas un seuil de réussite ni un benchmark représentatif de l'environnement #749.

HTTP réel sur socket, LocalProjectStorage et disque temporaire réels, Prisma/PostgreSQL local migré `panel_proof`, deux organisations et sessions synthétiques. Chaque ZIP est décodé et chaque fichier comparé au contenu attendu. Archive durable et SHA256 relus après déconnexion/recréation de l'application ; deux refus404 ne créent aucune archive. Un manifeste IDE de 200 fichiers est réellement matérialisé puis relu. Nettoyage limité aux IDs synthétiques et répertoire temporaire propres au test.

```sh
DATABASE_URL=postgresql://postgres@127.0.0.1:55438/panel_proof \
  sh services/api/scripts/verify-project-export-postgres.sh /tmp/export-proof
```

Le script exige cinq tests PostgreSQL réussis, zéro skipped/todo ; il produit rapport détaillé, empreintes des sources et des durées, reçu avec SHA Git/dirty/code sortie. Sans activation explicite, la CI générale saute ces cas : sa couleur ne vaut pas recette PostgreSQL. Aucun workflow modifié dans ce lot.

## Intégration à poursuivre

Appliquer ce lot diagnostique au serveur de recette #749, puis répéter les parcours sans modifier délais/assertions/retries. Conserver chaque événement et le log de fin du même reqId ; prendre en compte les charges concurrentes. Le lot est indépendant de #748/#751 ; leurs blocs app.ts sont distincts. Aucun fichier Monaco/layout ou orchestrateur de restauration modifié. Aucune fusion autonome, déploiement production ou certification de panneau.

Typecheck et build API réussis. Lint du test propre ; lint ciblé app.ts : 366 erreurs/13 avertissements identiques à la base exacte (règle/message/sévérité, lignes exceptées), aucun ajout d'exemption. Scanner anti-simulation réussi. Hooks non installés ; aucun contournement utilisé. Les résultats finaux et le SHA précis sont consignés dans la PR.
