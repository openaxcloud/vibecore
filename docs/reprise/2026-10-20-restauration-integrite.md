# Restauration : contrat sûr, capacité complète encore indisponible

Base examinée : `e40edf3e04217e2d0e96ea1385c0420e18374bac`. Cette étape corrige des contrats dangereux ; elle ne livre pas une restauration physique ni une bascule applicative.

## Défauts reproduits et changement

- Les deux POST de restauration sélectionnent explicitement l'environnement. Le provisionneur conserve cet environnement dans la source CNPG. Les sauvegardes manuelles et automatiques visent également l'instance sélectionnée.
- La source Barman précise `serverName`, égal au cluster d'origine. Le précédent alias `-backup`, sans cette propriété, ne désignait pas nécessairement le répertoire de l'archive. La [documentation CNPG](https://cloudnative-pg.io/documentation/1.20/recovery/) précise que le nom de la source externe devient le nom de serveur par défaut ; aucun contenu d'archive existante n'a été inspecté.
- Aucun provider actuel ne réalise une bascule applicative vérifiée. Leur capacité de restauration reste donc fausse, indépendamment du droit commercial du forfait. Les deux POST renvoient `503 RESTORE_APPLICATION_CUTOVER_UNAVAILABLE` avant création d'une demande ou d'un cluster. Aucun nouveau flag d'exploitation ne peut activer artificiellement cette capacité.
- Pour une ancienne demande en cours dont le cluster devient sain, la maintenance signale `FAILED` avec cette raison ; elle conserve les ressources et la connexion existante. La santé seule ne produit plus `COMPLETED` ni date de réussite. Le compteur n'avance que si l'écriture du statut est confirmée.
- Les anciens enregistrements `COMPLETED` ne sont pas réécrits. La lecture précise l'absence de vérification applicative ; les deux interfaces affichent « Fin non vérifiée ». Les contrôles de restauration sont indisponibles et la fenêtre utilisable est nulle. Les lignes de snapshots restent un historique de demandes, pas une preuve d'archives récupérables.
- Le proxy IDE et la page dédiée conservent l'erreur métier avec un texte français/anglais. Une ancienne page encore ouverte ne peut contourner le refus backend.

## Reproduction versionnée

`services/api/src/tests/database-restore-integrity.spec.ts` exécute les vrais handlers Fastify, le provisionneur CNPG et son transport HTTP vers un serveur loopback explicite. Le store est un double mémoire, les réponses Kubernetes sont des fixtures. Tout HTTP extérieur est refusé ; chaque serveur est fermé après le cas. Aucun PostgreSQL, GCS, Kubernetes, PVC, secret client ou restauration réelle n'est exercé par cette suite.

Le 20 octobre, le test copié seul sur un checkout détaché de `e40edf3` a donné **11 échecs attendus et 34 témoins existants réussis**, en 34,05 s. Ce passage précède l'ajout des deux cas de sauvegarde manuelle ; il ne couvre donc pas ces deux nouveaux cas. Après les derniers correctifs : **80 tests API réussis** (67 dans trois fichiers puis 13 du service), et **26 tests UI/proxy distincts réussis** (24 au premier passage puis le proxy étendu à 4/4). Les builds web client/serveur et API passent. Le typage web et le lint applicatif passent ; le hook normal impose également le typage global et le lint avant commit. Fusion et livraison doivent être relevées séparément avant clôture.

Reproduction sans modifier main : créer un worktree détaché du SHA ci-dessus, y copier uniquement le nouveau fichier de test, utiliser les dépendances verrouillées du dépôt, puis exécuter depuis `services/api` :

```sh
../../node_modules/.bin/vitest --run --config vitest.config.ts \
  src/tests/database-restore-integrity.spec.ts \
  src/tests/database-provisioner.spec.ts --maxWorkers=1 --minWorkers=1
```

Les tests connus rouges restent uniquement dans ce checkout de contre-épreuve. La branche candidate doit être verte avant fusion. Les assertions ne remplacent aucune validation de données restaurées.

## Vérification locale intégrée du 20 octobre

Une base PostgreSQL QA isolée sur loopback a reçu les 100 migrations et le seed du dépôt. Un utilisateur, son organisation, son projet et des métadonnées de deux instances développement/production ont été créés exclusivement pour cette recette. L'état `ACTIVE` de ces fixtures n'est pas une preuve de provisionnement CNPG. Aucun secret projet n'a été créé : compte avant et après égal à zéro.

L'API réelle, son store Prisma et PostgreSQL passent huit contrôles : pour chaque environnement, lecture de la capacité et de l'historique, refus des deux POST en 503, et fenêtre de récupération nulle. La relecture Prisma confirme que les lignes de restauration et les secrets sont inchangés. Aucun provider, cluster ou volume payant n'a été appelé.

Le build de production local, relié à cette API, est ensuite parcouru en Chromium système 154.0.8037.57, aux formats 1440×1000, 820×1180 et 390×844. Les trois contextes authentifiés distincts rendent « Fin non vérifiée », le refus explicite de restauration et le bouton d'instantané conservé. Le rechargement conserve le résultat ; aucun débordement horizontal de page ni erreur JavaScript n'est observé. Les trois captures ont été inspectées après fermeture de la visite guidée par son bouton normal. Aucun bouton de sauvegarde ou restauration n'a été exécuté.

Les résultats JSON, les captures et les empreintes des sources sont dans [`2026-10-20-restauration-preuves/`](2026-10-20-restauration-preuves/). Cette preuve concerne l'indisponibilité honnête et la lecture persistée de métadonnées synthétiques. Elle ne démontre ni le panneau IDE complet, ni Safari/WebKit, ni HTTPS réel, ni une sauvegarde/restauration physique.

## Indispensables restant ouverts

La restauration commercialisable nécessite encore une chaîne de sauvegarde physique vérifiée, un pointeur durable vers la base restaurée, une bascule des processus/pools de l'application et une lecture de contrôle depuis celle-ci, puis un exercice de reprise et des durées mesurées. Copier une URI de secret ou constater un cluster sain ne prouve pas cette chaîne. La conservation et le nettoyage des anciens clusters doivent être explicitement traités.

Limites conservées dans ce lot : une ancienne demande dont le cluster n'est pas sain ou ne peut être lu reste en attente ; les textes existants des instantanés et le compteur `snapshotted` ne distinguent pas encore suffisamment la demande de la création physique réussie. Le listing seul ne garantit donc pas une archive. Le chemin distinct de reprise fichier+base peut restaurer les fichiers puis signaler le refus base : aucune atomicité globale n'est démontrée.

Les quatre autres critères restent également ouverts : parcours inscription → agent → exécution → persistance → URL publiée, isolation/quota avec inventaire des anciens workspaces, facturation Stripe TEST de bout en bout, et parcours authentifiés sur mobile/Safari réel. Le catalogue des panneaux n'est pas une recette terminée.

Au relevé du 20 octobre, GitHub est lisible ; main reste `e40edf3`. Le run E2E `39198013106` demeure rouge. La dernière livraison continue réussie reste `39193686200`, commit `bbbcf3239296dfa55d60160aba8e19742136a111`, terminée le 19 octobre à 04:42:20 UTC. Les trois requêtes HEAD vers e-code.ai, app.e-code.ai et api.e-code.ai sont bloquées au CONNECT par le proxy (403, origine non atteinte) : cela ne prouve ni panne applicative ni version servie. Les autorisations de paiement réel, ressource cloud payante et restauration destructive ne sont pas acquises.
