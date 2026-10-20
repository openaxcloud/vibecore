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

Limites conservées dans ce lot : une ancienne demande dont le cluster n'est pas sain ou ne peut être lu reste en attente ; les textes existants des instantanés et le compteur `snapshotted` ne distinguent pas encore suffisamment la demande de la création physique réussie. Le listing seul ne garantit donc pas une archive. Le chemin combiné fichier+base, identifié par la contre-revue, est désormais refusé par le candidat avant toute écriture ; aucun coordinateur atomique n’est implémenté. Les reprises fichiers seules conservent leur endpoint existant. Une restauration de fichiers ou de mémoire physique n’a pas été exécutée dans cette recette.

Les quatre autres critères restent également ouverts : parcours inscription → agent → exécution → persistance → URL publiée, isolation/quota avec inventaire des anciens workspaces, facturation Stripe TEST de bout en bout, et parcours authentifiés sur mobile/Safari réel. Le catalogue des panneaux n'est pas une recette terminée.

Au relevé initial du 20 octobre, GitHub est lisible ; main était `e40edf3`. À 11:40:32 UTC, #744 est fusionnée normalement en `bc74c395` ; la CI de production réussit à 11:59:01 UTC, mais le verdict E2E agrégé puis la livraison échouent à 12:12 UTC. Les quatre tranches affichent un succès ; les journaux et rapports du verdict final restent refusés par le transport, donc sa cause détaillée reste inconnue. Aucun déploiement réussi déduit. Le run E2E `39198013106` demeure rouge. La dernière livraison continue réussie reste `39193686200`, commit `bbbcf3239296dfa55d60160aba8e19742136a111`, terminée le 19 octobre à 04:42:20 UTC. Les trois requêtes HEAD vers e-code.ai, app.e-code.ai et api.e-code.ai sont bloquées au CONNECT par le proxy (403, origine non atteinte) : cela ne prouve ni panne applicative ni version servie. Les autorisations de paiement réel, ressource cloud payante et restauration destructive ne sont pas acquises.

## Complément de contre-revue : reprise combinée

Le chemin initial du panneau Snapshots appelle le POST fichiers avant le POST base,
puis renvoie `ok:true` même lorsque la base refuse. Le client peut alors remplacer
sa conversation. Le candidat refuse désormais toute demande combinée par
`503 CHECKPOINT_DATABASE_RESTORE_UNAVAILABLE` après la lecture autorisée du projet,
avant les POST fichiers, base ou mémoire. Une capacité PITR isolée ne suffit pas à
prouver un coordinateur fichiers/base ; aucun drapeau n'active ce parcours non livré.

Le parcours fichiers seuls conserve son endpoint autorisé. Lorsque la mémoire est
aussi demandée, sa date est validée avant toute écriture. Si les fichiers sont restaurés
mais que l'appel mémoire échoue, le résultat est `ok:false`, `outcome:partial`, HTTP502,
avec états explicites par opération. Le client n'écrase donc plus sa conversation sur
ce résultat. Les erreurs de transport inconnues ne promettent plus « aucune modification ».
La boîte de dialogue indique l'indisponibilité combinée et oriente vers les points de
restauration pour les fichiers seuls. Sa fonction combinée reste indisponible.

La nouvelle suite d'orchestration donne 14 assertions rouges et un témoin vert sur
l'ancien chemin, puis 15/15 sur le candidat. Dix rouges portent sur la sécurité et
quatre sur le nouveau format du résultat : ce total ne représente pas quatorze défauts
distincts. Les frontières API de ces tests sont contrôlées ; aucun serveur cloud ni
fichier client n'est modifié. Avec les helpers, les messages et la garde de typage,
55 tests passent dans cinq fichiers, à nouveau après recompilation (20,85 s).

Le nouveau build web client/serveur du 20 octobre utilise explicitement le mode
`remote-kubernetes`, relié exclusivement à l'API QA locale. Le BFF compilé refuse
quatre requêtes combinées réelles (EN/FR, formulaire et booléen JSON) à 11:12 UTC.
Les empreintes avant/après des métadonnées de snapshots, contenu synthétique stocké,
état IDE, restaurations DB, métadonnées mémoire et nombre de secrets sont identiques.
La table mémoire de cette fixture est vide ; ce cas ne prouve pas une restauration
physique de mémoire ni de fichiers. Les objets synthétiques ajoutés par la sonde sont
supprimés après vérification.

La recette Chromium 154 repasse aux formats 1440, 820 et 390 : historique non vérifié,
refus affiché, contrôle d'instantané conservé et résultat maintenu au rechargement.
Les pages tarifaires locales n'affichent plus la promesse de restauration 28 jours ;
leur catalogue est celui de la QA, pas un catalogue Stripe de production.
Six captures ont été inspectées ; aucun débordement horizontal de page ni erreur
JavaScript relevé. Dix-huit requêtes navigateur externes ont été bloquées sans
substitution de réponse. Les preuves complémentaires portent le préfixe `checkpoint-`
dans le répertoire de preuves. Cette recette ne valide pas les fournisseurs,
les runtimes distants, Safari ou la production.

La promesse « 28-day database rollbacks » a aussi été retrouvée dans la carte tarifaire
Pro et la liste descriptive du catalogue de crédits. Le candidat retire cette promesse
non réalisable. Prix, crédits, limites, droits `dbRollbackDays`, produits/prix Stripe et
abonnements restent inchangés. Le droit contractuel de rétention ne constitue pas une
preuve de restauration disponible ; il reste à réconcilier l'offre livrée et les parcours
Stripe TEST avant lancement. Aucun paiement ni modification de catalogue Stripe exécuté.


## Contre-revue complémentaire : checkpoint sans snapshot

Le callback client pouvait sauter le POST lorsqu’un checkpoint ne possédait aucun
snapshot, puis remplacer la conversation avec `clearMessages:true`. Les deux listes
rendaient encore son action disponible dès qu’il contenait des messages. La garde
BFF ne protégeait donc pas ce chemin. Le candidat exige maintenant un identifiant
de snapshot avant toute requête, état occupé ou écriture mémoire ; les deux actions
et la confirmation sont désactivées lorsque cet identifiant manque.

Le test exécute le callback et les expressions de disponibilité réels extraits de
BaseChat, avec frontières réseau/mémoire contrôlées. Sur le source publié `7c103096` :
12 cas rouges, deux témoins verts. Après correction : 14/14 verts. Le refus du serveur
conserve la conversation et le témoin fichiers seuls reste opérationnel dans ce test.
Après rebase sur `bc74c395`, 90 tests ciblés passent dans huit fichiers (dont les
14 du callback et les 16 du lot Sync fusionné) ; six contrôles d’index passent.
Les 208 catalogues alignent 18 795 clés par langue. Le build client/serveur termine
à 12:32:23 UTC en 620,72 s, avec un pic de mémoire commun de 10,73 Go et aucun OOM.
Les contrôles globaux du hook normal restent obligatoires avant le prochain commit.

La recette du build sur API/Prisma/PostgreSQL réels réussit à 12:42 UTC aux formats
1440, 820 et 390. Quatre messages synthétiques comprennent un checkpoint ancien et
des messages plus récents à préserver. Son action est désactivée ; l’activation
native du bouton désactivé n’ouvre pas de dialogue et ne déclenche aucun POST de
restauration. Les quatre messages et leur empreinte restent identiques après
relecture persistée. Le harnais distingue les autosauvegardes identiques d’un
remplacement de conversation ; aucune des deux n’est observée dans ce dernier
passage. Aucun débordement horizontal de page ni erreur JavaScript constaté.

Les trois captures ont été inspectées. La troisième action de l’historique présente
encore un libellé tronqué dans les rangées étroites ; cette recette ne certifie donc
pas une parité visuelle complète. La capture tablette inclut aussi des conversations
synthétiques archivées du même projet QA. Six requêtes externes sont refusées sans
substitution de réponse. Le runtime de cette QA reste indisponible, comme affiché :
aucune génération d’agent ni exécution d’application n’est revendiquée.

Les tentatives précédentes restent archivées : enveloppe de fixture initialement
erronée, comptage trop large des autosauvegardes, historique non ouvert après clic
précoce, puis serveur local arrêté lors d’une reconnexion. Le scénario final attend
le chargement de la conversation réelle avant l’action, sans délai augmenté. Il ne
prouve pas la réactivité d’un clic avant la fin de ce chargement.

La sonde BFF compilée repasse ensuite quatre refus combinés réels EN/FR et
formulaire/JSON à 12:43 UTC : HTTP503 avant écriture, empreintes PostgreSQL inchangées.
Les objets de sonde sont supprimés. La contre-revue du callback ne relève pas de
P0/P1 dans ce périmètre ; elle ne couvre pas l’action distincte de consultation d’une
conversation archivée. Les résultats, captures et hashes exacts portent le préfixe
`nosnapshot-` dans le répertoire de preuves. Fusion, CI du prochain SHA, livraison et
validation HTTPS/Safari restent des étapes séparées.
