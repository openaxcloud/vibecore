# Exécuteur de restauration — candidat local du 20 octobre 2026

Branche `codex/database-restore-executor-20261020`, PR
[#745](https://github.com/openaxcloud/vibecore/pull/745), base actuelle
`9c8f6bc6d95a97ddf54a52a932a6c07aff4f2828`. La première version `89019cdf`
est poussée mais non fusionnée ; ses contrôles CI ont révélé des dépendances
workspace absentes. La révision de revue `01cf9e90` a ensuite été poussée à
17:04:28 UTC. Les compléments d'autorisation et de rotation décrits ci-dessous
sont locaux, non fusionnés, au relevé de 18:09 UTC.

## Complément vérifié à 18:09 UTC

La portée d'organisation autorisée par HTTP est désormais conservée après
un transfert concurrent et vérifiée sous verrou à l'admission. Les lectures
de connexion la revérifient après les dernières attentes. Les tests donnent
42/42 routes/transfert, puis 30/30 repository PostgreSQL dans un passage
distinct, sans saut. La rotation des clés inclut les deux colonnes du journal,
préserve une valeur modifiée en parallèle et accepte des ciphertexts différents
de même valeur, sans retirer les autres gardes.

Le build API termine à 17:58:53 UTC. Le banc physique de 18:02 termine rouge :
les 30 tests repository passent, mais son assertion exige encore 21 cas.
Après correction de ce nombre attendu, le passage **18:08:04–18:09:30 UTC**
réussit : archive/WAL, refus d'altération, admission 202/refus concurrent 409,
quiescence 503, bascule, deux lignes exactes relues, reprise 200 et persistance
après redémarrage. Nettoyage confirmé ; pic partagé 8 213 843 968 octets.
Les reçus rouge/vert et les 36 empreintes sources sont publiés dans les
[preuves d'autorisation et rotation](mesures/2026-10-20-restore-auth-rotation.json).

Cette validation reste locale et synthétique. Les contrôles du nouveau commit,
le raccordement des pilotes cloud et la preuve d'exclusion de tous les
consommateurs restent requis. Les paragraphes suivants conservent l'historique
des étapes antérieures ; leurs compteurs ne remplacent pas ce complément.

## Révision antérieure de revue

La revue a aussi reproduit la perte d'une ancienne tentative entre deux
reprises et l'incohérence d'organisation d'une DB après transfert de projet.
La migration additive 0092 conserve désormais la dette d'exclusion jusqu'aux
reçus confirmés. Les sources corrigées passent 64 tests API, 29 tests du
lanceur CI et [31 tests PostgreSQL réels](mesures/2026-10-20-restore-ci-postgresql-local.json).
La [résolution des dépendances](mesures/2026-10-20-restore-workspace-dependencies.json)
est vérifiée sur installation propre, avec contre-épreuve du manifeste ancien.
Les typages API et scripts, puis le build API, sont verts. Un premier banc
physique a passé ses 21 tests PostgreSQL mais échoué avant l'admission HTTP
car le lanceur n'avait pas transmis le drapeau local exigé par sa fixture.
Ce premier résultat reste rouge ; aucun succès de restauration n'en est déduit.
Le [reçu de cet échec de préparation](mesures/2026-10-20-restore-physical-review-setup-failure.json)
est conservé. L'assertion reste en place ; la commande correcte pour ce banc
local explicitement isolé est :

```sh
NODE_ENV=test DB_ROLLBACK_ENABLED=true \
  RESTORE_QA_OUTPUT=".vibecore/qa-physical-restore-$(date -u +%Y%m%dT%H%M%SZ)" \
  node --import tsx scripts/qa/database-restore-physical.ts
```

Cette commande utilise uniquement l'image PostgreSQL déjà en cache, ses
conteneurs/volumes propres et une API locale. Elle n'active aucun serveur
de production.

Le passage corrigé est **vert à 16:47:01 UTC**, sur les 34 sources revérifiées
identiques. Il comprend 21 tests PostgreSQL, une vraie sauvegarde physique et
les WAL, le refus d'une archive altérée, l'admission HTTP 202 et le refus
concurrent 409, la quiescence 503, la bascule et la relecture applicative,
la reprise 200, la lecture SQL API puis le redémarrage et la reconnexion.
Les conteneurs et volumes propres sont absents après nettoyage ; le conteneur
QA partagé conserve son identifiant et reste actif.

Le processus complet dure 136,17 secondes, avec un pic cgroup partagé de
7 959 773 184 octets et aucun OOM. Ces valeurs décrivent ce banc synthétique ;
elles ne constituent pas un RTO commercial.
[Preuve physique après revue](mesures/2026-10-20-restore-physical-review-final.json)
et [typages, build et tests ciblés](mesures/2026-10-20-restore-review-local-checks.json).
Le pilote QA ne prétend toujours pas exclure un worker distribué après crash.

L'historique ci-dessous part de la base antérieure `e8ede226` et conserve ses
échecs puis ses validations. Ses preuves physiques antérieures ne valident
pas automatiquement les corrections de revue. Ce document ne constitue
jamais une preuve de restauration cloud ou de parcours IDE complet.

## Contrat intégré

Les deux POST existants de restauration conservent l'autorisation, le droit du
forfait et la validation du point demandé. Ils n'admettent un travail que si un
coordinateur injecté dispose d'un pilote disponible pour cette instance.
Le factory de production n'en injecte aucun : refus 503 avant ligne ou ressource.
La maintenance ne déduit jamais la réussite de la santé du cluster.

Le journal `DatabaseRestoreExecution` est lié à l'instance et à l'environnement.
Une admission exclusive sous verrou Project puis DatabaseInstance exige le
secret géré et refuse une variable d'environnement homonyme. Chaque tentative
possède un token conditionnant les écritures suivantes.

| Étape        | Preuve ou effet requis                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Validation   | Archive identifiée, empreinte du manifeste, source PostgreSQL, timestamp exact et digest de lecture attendu.            |
| Préparation  | Cible identifiée durablement ; identité PostgreSQL identique à celle de l'archive. L'URI est chiffrée dans le journal. |
| Quiescence   | Reçu du pilote pour le même projet, instance, environnement et token ; trafic ordinaire arrêté avant bascule.           |
| Bascule      | Transaction sur référence cible, version de liaison et secret chiffré, sous CAS de propriété et de liaison précédente.  |
| Vérification | Ancien pool fermé, nouvelle connexion, identité/version cible et digest applicatif exacts.                              |
| Reprise      | Confirmation explicite du trafic applicatif sur la liaison vérifiée.                                                    |
| Achèvement   | Reçus durables et liaison encore courante avant `COMPLETED`.                                                            |

Un échec `PENDING` ou `VALIDATING` peut libérer l'admission si aucune exclusion
ne reste à confirmer. Dès `PREPARING`,
une ressource peut exister malgré l'échec de sa réponse : `RECOVERY_REQUIRED`
conserve verrou, token et identifiant de cible. La reprise explicite exige
l'exclusion réelle de tous les anciens pilotes encore inscrits au journal ;
aucune expiration de délai ne la remplace. Une nouvelle reprise conserve
cette liste et y ajoute son prédécesseur. Seul le propriétaire courant peut
confirmer une exclusion. Aucun nettoyage ou rollback automatique de la cible
n'est revendiqué.

Pendant l'opération, les mutations de liaison et le transfert/suppression du
projet sont bloqués. Après bascule, sauvegardes héritées, transfert et suppression
définitive restent explicitement refusés tant que le cycle de vie de la cible
restaurée n'est pas implémenté. Une sauvegarde de l'ancien cluster ne peut pas
être présentée comme celle de la nouvelle cible.

Les deux GET de connexion et le POST de reprovisionnement utilisent une
réconciliation atomique des données observées avant leur attente : instance
encore `PROVISIONING`, version zéro, aucune cible restaurée, même horodatage et,
pour l'activation, même secret. Un résultat ancien ne peut donc pas réécrire la
connexion ou le statut après la restauration. Les écritures utilisateur
explicites restent distinctes.

## Validation locale

- 20 octobre, 12:01:20–12:01:42 UTC : réintroduction temporaire des trois anciennes
  écritures dans les handlers réels ; trois échecs attendus. Le fichier est
  restauré octet pour octet dans un `finally`.
- 12:01:48–12:02:20 UTC : 56/56 tests, quatre fichiers, zéro saut, un worker.
  Coordinateur avec ports/journal mémoire explicites ; handlers Fastify par
  injection ; réponses HTTP loopback retenues ; persistance TestApiStore.
  Pic de mémoire cgroup partagé : 5 147 160 576 octets.
- 12:02:37–12:05:03 UTC : typage intégral API et quatre scripts QA, TypeScript
  5.8.3, exit0, zéro diagnostic. Pic cgroup partagé : 6 142 984 192 octets.
- Le repository utilise Prisma/PostgreSQL réels dans une base de contrôle
  dédiée, jamais le PostgreSQL QA partagé. Les 11 cas antérieurs ont passé
  lors du premier banc ; 14 cas sont maintenant préparés pour le prochain
  passage, après les corrections des courses.
- Le premier banc physique a validé la sauvegarde, le WAL, le rejet d'une
  archive altérée et l'admission HTTP 202/refus concurrent 409, puis a échoué
  pendant la préparation de cible. Il ne prouve pas une restauration complète.
  Les ressources propres au banc ont été supprimées. Le prochain résultat
  doit être publié séparément avec ses empreintes exactes.

### Évolution après le relevé gelé de 12:06 UTC

Un passage ultérieur a achevé la chaîne réelle et la lecture SQL, puis échoué
au redémarrage de cible : le port Docker dynamique avait changé. Cela reste
un résultat global rouge. Le banc utilise maintenant un port explicite et
exige l'identité de l'URI après redémarrage.

L'essai suivant a échoué plus tôt, au test d'admission concurrente PostgreSQL :
`P2028` au lieu de `RESTORE_ALREADY_RUNNING`. Le message et les métadonnées de
cette erreur n'ont pas été conservés ; son mécanisme précis n'est donc pas
attribué. La transaction était bornée à 30 secondes, sans hausse de délai.

Le candidat suivant distingue une portée verrouillée (`RESTORE_ADMISSION_BUSY`,
409 avant écriture, acquisition `FOR UPDATE SKIP LOCKED`) d'une restauration
déjà persistée (`RESTORE_ALREADY_RUNNING`, lecture sous verrou). Il ne convertit
jamais `P2028` en résultat métier. Les nouveaux tests PostgreSQL retiennent un
vrai INSERT avant commit et un verrou de projet sans restauration, puis exigent
une reprise sûre et une seule admission durable. Ces changements, ainsi que la
mise en forme du noyau, ont reçu la validation ciblée suivante ; le typage
ci-dessus atteste toujours leur source antérieure exacte.

- 12:45:15–12:45:54 UTC : ancien verrou bloquant réintroduit temporairement,
  verrou PostgreSQL de projet retenu par une connexion distincte. Le nouveau
  test échoue comme attendu : `P2010` / SQLSTATE `57014` (« statement timeout »)
  au lieu de `RESTORE_ADMISSION_BUSY`. Ce mécanisme contrôlé **n'attribue pas**
  le `P2028` de l'essai physique antérieur. Le fichier candidat est restauré
  octet pour octet dans un `finally`.
- 12:45:55–12:46:07 UTC : **15/15 tests Prisma/PostgreSQL**, zéro saut. Une
  barrière après le vrai INSERT conserve la transaction non committée :
  seconde admission `BUSY`, zéro ligne visible, puis `ALREADY_RUNNING` après
  commit et une seule cible durable. Un verrou de projet sans restauration
  prouve séparément le refus sans écriture et la reprise après libération.
- 12:46:07–12:46:46 UTC : **58/58 tests ciblés**, quatre fichiers, zéro saut,
  un worker. Les deux handlers Fastify, testés par injection avec journal
  mémoire explicite, conservent 409 sans travail démarré sur contention, puis
  acceptent une nouvelle demande 202 quand le repository n'émet plus ce refus.
- 12:46:48 UTC : conteneur PostgreSQL dédié et volumes propres supprimés,
  absence et port fermé vérifiés ; fichier de credentials éphémère retiré.
  Aucun accès au PostgreSQL QA partagé. Pic cgroup partagé : 6 380 163 072 octets.

[Relevé structuré et empreintes de cette étape](mesures/2026-10-20-restore-admission-contention.json).
Le lint des huit nouveaux fichiers ne relève plus que neuf imports relatifs
dans les specs et le helper QA : la règle web réclame `~/`, absent du contrat
de résolution NodeNext de l'API. Aucune exemption ou alias artificiel n'a été
ajouté ; aucun lint global propre n'est revendiqué.

### Gel après typage et build API

- 12:54:32–12:57:17 UTC : typage intégral API et quatre scripts QA avec
  TypeScript 5.8.3, exit0, zéro diagnostic. Le fixture au port explicite stable
  et le runner attendant quinze tests PostgreSQL sont inclus.
- 12:57:38–12:59:23 UTC : script normal `pnpm --filter @vibecore/api build`,
  exit0, zéro diagnostic TypeScript. Aucun build web ou image de production.
- Tas Node limité à 4 Gio, exécutions séquentielles ; pic cgroup partagé
  de 7 765 008 384 octets, aucun OOM. Aucune source modifiée pendant ces
  validations, aucun nouveau test PostgreSQL ou banc physique exécuté.

[Manifeste gelé des vingt-six sources](mesures/2026-10-20-restore-executor-preflight.json).
Le banc physique complet reste à exécuter sur ces empreintes ; le typage et le
build ne changent pas l'état rouge du dernier banc complet. Aucun commit,
fusion ou déploiement de l'exécuteur n'est effectué à ce relevé.

Les tests de routes à transport loopback sont dans
`services/api/src/tests/database-restore-integrity.spec.ts` ; les transactions
réelles dans `services/api/src/tests/database-restore-repository.spec.ts`.
Les scripts `scripts/qa/database-restore-physical*.ts` et
`database-restore-qa-app.ts` constituent le banc physique isolé, avec
`database-restore-api-fixture.ts` pour l'identité, le RBAC et le serveur API.

## Premier banc physique complet vert — 13:05:03 UTC

Le passage du 20 octobre terminé à **13:05:03 UTC** est réussi sur les
vingt-six sources du manifeste gelé `490427feb4c506854c88252b1b49c1a82a2acc4977152ca567f741cbc79073e1`,
revérifiées identiques après exécution. Il comprend :

- Sauvegarde physique et WAL PostgreSQL 16.15 réels, empreinte et identité
  source vérifiées ; archive volontairement altérée rejetée, puis restaurée.
- Quinze tests Prisma/PostgreSQL sans saut ; admission HTTP authentifiée 202
  et refus concurrent 409, journal relu par un client indépendant.
- Cible promue au point demandé : deux lignes attendues présentes, écriture
  postérieure exclue ; ancien pool fermé, application quiescée (HTTP 503),
  nouvelle connexion et relecture avant reprise (HTTP 200).
- Journal `COMPLETED`, bascule applicative vérifiée, version de liaison 1,
  verrou libéré et secret de l'autre environnement inchangé ; vraie route SQL
  API HTTP 200, deux lignes avec digest exact.
- Redémarrage du conteneur cible : URI strictement identique, cible toujours
  primaire et données inchangées. Client de contrôle rouvert, référence/version
  persistées, pool applicatif reconnecté puis trafic repris.
- Suppression vérifiée des seuls conteneurs, volumes et credentials propres au
  banc ; le PostgreSQL QA partagé n'a pas été utilisé ou arrêté.

Durée interne : **96,402 s** ; processus complet : **105,70 s**. Mémoire cgroup
avant : 4 135 518 208 octets ; pic partagé : **6 893 682 688 octets**, aucun OOM.
Ces durées sont celles de ce petit banc local, pas un RTO ou RPO commercial.
[Résultat, ressources, limites et empreintes exactes](mesures/2026-10-20-restore-physical-local.json).
Les trois essais rouges antérieurs restent conservés dans les artefacts de la
session ; ils ne sont pas renommés en succès.

Une relecture a trouvé après le gel un client SQL emprunté non libéré si la
lecture d'identité échoue dans le petit processus QA. Le chemin réussi ci-dessus
n'exerce pas cette erreur. Sa correction et une contre-épreuve dédiée sont
encore requises ; elles auront leurs propres empreintes. Aucun adaptateur cloud
ou runtime de production n'est ajouté par cette validation.

## Bloquants de disponibilité

- Aucun port CNPG/GCS/runtime de production fourni ; aucun accès nouveau créé.
- Tous les consommateurs SQL, workspaces, applications publiées et répliques
  doivent être effectivement quiescés et reconnectés. Le petit processus QA et
  une lecture SQL après bascule ne prouvent pas cette exclusion globale.
- Le pilote physique QA refuse l'exclusion distribuée après crash. Les tests
  unitaires valident son contrat, pas cette capacité en production.
- Pas de sauvegarde post-bascule ni de transfert/suppression de cible restaurée
  pris en charge ; pas de nettoyage automatique des cibles incertaines.
- Aucun catalogue ne prouve une couverture PITR continue : la fenêtre reste
  nulle. Aucun RPO/RTO de production, Safari ou parcours client complet prouvé.
- Tous les écrivains doivent être déployés avec les nouvelles gardes avant une
  activation future. Les anciennes répliques et les mutations SQL hors protocole
  ne sont pas rendues sûres par la seule migration.

Aucun succès global, donnée client, paiement, ressource cloud ou disponibilité
de production n'est revendiqué.

## Contre-épreuve du client SQL QA — 13:22:10 UTC

Cette étape est distincte du premier drill physique vert. Le seul delta parmi
ses vingt-six sources gelées est `scripts/qa/database-restore-qa-app.ts` :
le SELECT d'identité utilise désormais `Pool.query`, qui rend son client
interne en cas d'erreur avant que le `catch` attende `Pool.end`. Le SQL, le
contrat d'erreur et le délai IPC de 15 secondes restent identiques. Les
vingt-cinq autres sources, dont toutes les sources produit, sont inchangées.

Trois échecs de préparation du nouveau banc sont conservés séparément :
expiration du lancement Docker à 30 secondes, précondition SQL `42501` non
établie, puis échec de connexion administrative avant création du rôle.
Les deux derniers essais ne consignaient pas le code SQL exact et ne prouvent
pas le défaut IPC. Le lancement Docker a ensuite été aligné sur les
120 secondes du fixture physique existant ; la préparation attend une vraie
connexion TCP authentifiée et `SELECT 1` dans sa borne existante de 30 secondes.
Aucun délai IPC ou assertion n'a été augmenté.

La contre-épreuve suivante utilise un nouveau cluster PostgreSQL jetable
de 512 Mio. Un rôle synthétique sans droit d'exécuter `pg_control_system`
produit réellement `42501`, vérifié directement avant chaque processus QA :

- Ancienne source : la commande de connexion ne répond pas en **15 006 ms** ;
  le processus est arrêté par `SIGTERM`.
- Source corrigée : réponse explicite `QA_APPLICATION_COMMAND_FAILED` en
  **269 ms**, commande d'arrêt acquittée, processus sorti avec le code 0.
- Dans les deux cas : zéro connexion du rôle après sortie, rôle supprimé.
  Le conteneur propre et son fichier de credentials sont supprimés à
  **13:22:10 UTC** ; à **13:23:44 UTC**, aucun conteneur du banc ne subsiste
  et son port 32784 refuse les connexions. Le PostgreSQL QA partagé n'a pas
  été modifié.

Typage strict du script QA avec TypeScript 5.8.3 :
**13:23:55–13:24:06 UTC**, exit0, zéro diagnostic ; contrôle Prettier vert.
Mémoire partagée avant le banc : 4 609 867 776 octets. Le banc IPC ne mesure
pas de pic continu ; le relevé de nettoyage est à 6 385 168 384 octets, sans OOM.
Le typage mesure un pic partagé de 6 577 844 224 octets.

[Preuves, préparations rouges et limites](mesures/2026-10-20-restore-qa-pool-error.json).
[Nouveau manifeste de vingt-six sources](mesures/2026-10-20-restore-executor-qa-pool-preflight.json),
empreinte `b8e28307c6d402fe5937804871c3508c4ae1a3519e8f6d0776bf54a7a93b59e3`.
Le premier drill physique demeure rattaché à son manifeste précédent ; un
nouveau passage complet reste à exécuter sur ce delta QA. Aucun nouveau succès
physique, commit, fusion ou déploiement n'est revendiqué par cette contre-épreuve.


## Dernier drill physique complet — 20 octobre, 13:53:47 UTC

Après la correction `Pool.query` du seul banc QA, la chaîne complète a été exécutée
une nouvelle fois sur les 26 sources gelées du manifeste `b8e28307…`. Le premier
essai vert et les tentatives rouges sont conservés séparément.

[Preuve structurée finale](mesures/2026-10-20-restore-physical-final.json) :
15 tests PostgreSQL réussis, sauvegarde physique et WAL vérifiés, archive altérée
refusée, admission HTTP202/concurrence409, quiescence503, bascule avec ancien pool
fermé, lecture applicative des deux lignes attendues, reprise200, journal durable
COMPLETED et verrou libéré. L’API SQL relit deux lignes avec le digest attendu ;
la cible redémarre sur la même URI, un nouveau client de contrôle et le pool
applicatif retrouvent les données. L’autre environnement reste inchangé.

Durée interne 178,360 s, initialisation comprise (84,193 s) ; enveloppe complète
216,28 s. Mémoire commune avant 3 609 255 936 octets, pic 6 253 109 248 octets,
zéro OOM. Ce petit banc synthétique local ne mesure aucun RTO commercial.

À 13:54:19 UTC, les 26 empreintes sont inchangées ; les conteneurs et volumes
propres ont disparu, les fichiers privés sont supprimés par le banc, et le cluster
QA partagé 55439 reste disponible. L’exécuteur demeure un candidat local non
commité/non fusionné ; la capacité production reste désactivée. Ce test ne
prouve ni CNPG/GCS ni le runtime cloud, ni l’exclusion de tous les consommateurs
SQL, ni le fencing distribué.

## Rebase sur main après le drill

À 13:57:23 UTC, le candidat a été replacé sur main
`9c8f6bc6d95a97ddf54a52a932a6c07aff4f2828`, avec sauvegarde du patch et des fichiers
nouveaux. Le seul conflit était l’index dérivé : régénéré depuis les fiches,
445 entrées. Aucun fichier supprimé, les 26 sources du drill restent identiques
octet pour octet. [Comparaison complète](mesures/2026-10-20-restore-executor-rebase.json).
Les sources API et base de données des deux bases Git étaient elles-mêmes identiques ;
le test reste daté de son exécution, pas présenté comme une nouvelle exécution après rebase.
Le client Prisma conserve la sortie brute de sa génération officielle, dont les espaces
de commentaires générés ; aucune fusion ou remise en forme manuelle de cet artefact.
Le hook global et la CI du futur commit restent à exécuter.


## Contre-relecture statique avant commit

Le 20 octobre, une relecture séparée de la migration, des verrous/CAS, des
continuations de provisionnement et du câblage de production n’a relevé aucun
nouveau défaut bloquant dans ce périmètre. `server.ts` appelle toujours
`buildApiApp()` sans coordinateur ; les deux POST refusent avant admission
sans pilote injecté. Les gardes de sauvegarde, suppression et transfert des
cibles restaurées restent explicites. Il s’agit d’une lecture statique,
pas d’une nouvelle exécution ni d’une preuve cloud.


## Fichiers dérivés avant commit — 14:24 UTC

La commande officielle `pnpm --filter @vibecore/database db:generate` a réussi
en 17,07 s ; ses six fichiers sont identiques octet pour octet à ceux du banc.
Les 26 empreintes source sont toujours identiques, sans suppression ni conflit.
L’index des bugs a été régénéré avec `--index` après report des trois fiches
de #743 ; ses six tests passent. Les journaux datés de #743/#744 sont inclus
sans convertir leur fusion en preuve HTTPS publique.
[Relevé de génération et contrôle](mesures/2026-10-20-restore-executor-generated.json).


## Premier hook global et installation locale

Le hook normal du 20 octobre, 14:25:27–14:36:47 UTC, a refusé le commit :
le répertoire de dépendances du package mobile n’était pas installé dans
ce worktree, d’où les imports Capacitor introuvables. Web, scripts Node et
helpers navigateur avaient passé ; ce refus ne constitue pas un hook vert.
Durée 679,47 s, pic partagé 5 551 628 288 octets, aucun commit créé.

Les deux répertoires de dépendances manquants disponibles dans le worktree
précédemment validé ont été reproduits localement, avec lockfile et manifestes
identiques. Une cible de lien workspace a été ajustée vers ce worktree ;
aucun lien cassé, source produit ou installation d’autrui modifiés.
La reprise du hook complet reste requise après cette réparation locale.
[Résultat et préparation](mesures/2026-10-20-restore-executor-hook-preparation.json).

Le typage mobile isolé après réparation a réussi à 14:47:29 UTC en 10,07 s,
sans diagnostic. Cette contre-vérification confirme la résolution des imports
manquants ; elle ne remplace pas la reprise du hook global complet.
