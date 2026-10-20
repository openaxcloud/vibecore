# Transfert et réconciliation du provisioning — candidat local

Référence de lecture : `89019cdf1cdbbd622179fdc4b2b4a68ab3219fef`.
État au 20 octobre 2026, **16:17 UTC** : correctif non committé, non fusionné,
sans preuve de déploiement. Deux cas PostgreSQL ont une contre-épreuve
rouge→verte ; la suite complète ultérieure passe les dix cas de transfert.

## Défaut et correction proposés

`PrismaApiStore.transferProject` déplace le projet vers l'organisation B mais
laisse ses `DatabaseInstance.organizationId` sous A. Pour une instance encore
`PROVISIONING`, la garde de `reconcileDatabaseProvisioning` compare alors B et A
et refuse la transition. Une nouvelle lecture ne peut plus terminer le
provisioning.

Le candidat met à jour l'organisation de toutes les instances du projet, dans
la transaction existante de transfert, avant l'écriture du projet. Il conserve
le verrou `Project`, les refus pour restauration active et cible restaurée,
ainsi que les protections de transfert du runtime et la révocation des anciens
liens de partage. Il ne modifie ni les références physiques, ni les secrets,
ni le statut des instances.

Une ancienne continuation capturée sous A reste refusée. Une nouvelle lecture
sous B obtient l'identité cohérente nécessaire à la réconciliation. Les chemins
de réconciliation et de restauration prenant également le verrou `Project`,
ils ne peuvent intercaler leur écriture dans ce transfert.

La création initiale prend désormais le même verrou `Project` avant de relire
son organisation et son état de suppression. Une demande capturée sous A est
refusée après transfert vers B, avec le code existant
`409 DATABASE_PROVISION_STATE_CHANGED`, avant tout `INSERT`. Une nouvelle demande
autorisée sous B peut créer l'instance. Aucun changement silencieux de propriétaire
de la demande n'est effectué.

## Contre-épreuve PostgreSQL locale

Fichier :
`services/api/src/tests/database-provisioning-transfer.prisma.spec.ts`.

La suite utilise les transactions réelles de Prisma/PostgreSQL, deux clients
indépendants et des organisations synthétiques propres à chaque fixture :

1. Développement : ancienne réponse A refusée, lecture B réconciliable.
2. Production : même contrat, autre environnement conservé.
3. Écritures des deux instances et du projet invisibles avant le commit, puis
   propriétaires B visibles ensemble.
4. Erreur injectée après le vrai `UPDATE Project` : rollback réel des trois
   propriétaires.
5. Admission de restauration active : transfert toujours refusé et verrou
   conservé.
6. Cible restaurée sans support de son cycle de vie : transfert toujours refusé.
7. Création initiale développement sous A après transfert : refus sans ligne ;
   nouvelle demande sous B acceptée.
8. Même contrat pour la création initiale production.
9. Projet supprimé : création initiale refusée sans ligne.
10. Suppression définitive en cours : même refus.

La variable `RESTORE_TEST_DATABASE_URL` doit désigner une base de contrôle
loopback dédiée et migrée. Le port QA partagé `55439` est explicitement refusé.
Le nettoyage ne supprime que les identifiants créés par cette suite.

Le passage ciblé du **20 octobre, 16:12:00–16:13:36 UTC**, utilise une base propre
sur PostgreSQL 16 local, port55432, après migrations. Seuls les cas 1 et 2
ci-dessus sont exécutés : ancien store `89019cdf1` **deux échecs de
`organizationId`**, candidat **deux réussites**, huit cas filtrés dans les deux
passages. La garde rejette toujours l'ancienne continuation A ; la nouvelle
lecture B peut terminer la réconciliation. Les appels testés sont les vraies
méthodes `PrismaApiStore` avec PostgreSQL, pas les handlers HTTP ni un fournisseur.

Le lanceur sauvegarde le candidat, substitue l'ancien store pour le témoin rouge,
restaure le candidat en `finally` et vérifie son empreinte avant le passage vert.
La source est ensuite vérifiée byte pour byte ; la base propre est supprimée et
son absence confirmée. Le conteneur appartient à l'autre agent et reste intact
pour la suite coordonnée. Mémoire commune avant6,052 Go, pic6,955 Go, après6,381 Go ;
zéro événement OOM. Aucun accès au PostgreSQL partagé55439.

Le premier passage **16:09:29–16:10:56 UTC** est conservé en échec du lanceur :
les deux assertions de transfert étaient rouges, mais le reporter JSON omettait
le détail d'objet attendu par le vérificateur. Aucun passage vert n'a alors été
lancé. La source et la base avaient déjà été restaurée/nettoyée. Une assertion
explicite supplémentaire sur le propriétaire a permis le second passage
discriminant ; les assertions précédentes restent présentes, sans changement de
délai ni de politique de retry.

Les valeurs de secret des fixtures sont des métadonnées synthétiques opaques :
elles ne prouvent aucune connexion à une base applicative, ni aucune opération
Kubernetes. Le runner complet exécuté ensuite par l’autre agent,
**16:14:58–16:15:44 UTC**, passe **31/31 cas**, dont **10/10 transferts**, sans
filtre, saut ou todo ; les sources sont inchangées. Le conteneur propre a été
nettoyé par son propriétaire. [Preuve du runner complet](mesures/2026-10-20-restore-ci-postgresql-local.json).
[Résultat structuré et empreintes](mesures/2026-10-20-database-transfer-provisioning.json).

## Contrats des appelants et limite du provisionnement externe

La création initiale peut attendre le provisionneur avec une organisation A
capturée, puis appeler `createDatabaseInstance` après un transfert vers B.
Le nouveau garde transactionnel refuse cette écriture obsolète. Sa preuve
PostgreSQL de ce chemin de création est couverte par les dix cas complets ;
le contrôle des deux appelants reste une lecture source de `services/api/src/app.ts`.

Sur le POST de provisioning direct, l'appel au fournisseur précède actuellement
cette insertion. Le garde protège les métadonnées ; il ne constitue pas une
preuve d'annulation d'une mutation de cluster déjà acceptée. L'exception
structurée remonte par le gestionnaire d'erreurs existant : réponse 409 et
message localisé déjà catalogué. Sur le chemin de publication, la création
précède le provisionneur et son refus est déjà capturé comme incident non fatal
de préparation de base ; le provisionneur n'est alors pas appelé.
L'activation cloud et la suppression d'une ressource externe ne sont pas
revendiquées dans cette tranche.

La recherche des fixtures existantes n'a trouvé aucun mock partiel de
`PrismaApiStore.createDatabaseInstance` à adapter au passage en transaction.
Les suites d'API avec `TestApiStore` utilisent une implémentation en mémoire
distincte ; elles ne constituent pas une preuve de ces verrous SQL.
