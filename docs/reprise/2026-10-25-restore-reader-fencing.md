# Lecteur d'archives et décision de fencing — continuation locale

Base locale : `6a70bcce40dc681d56e31568c521a30abba4cb60`, sur la suite #785. Ni promotion, ni push, ni substitution de #782. Aucun appel cloud ou accès nouveau.

## Implémentation utilisable et portée

`createRestoreObjectReader` utilise le SDK GCS déjà installé. Le bucket, projet et serveur proviennent de la configuration de confiance ; chaque objet doit appartenir exactement à `db/<projet>/<serveur>/`. Chaque lecture épingle une génération, exige une taille et un SHA-256 attendus, vérifie CRC32C via le SDK et conserve les octets compressés (`decompress:false`). Une erreur ne retourne jamais de contenu partiel. Aucun fallback vers la génération courante. Taille bornée à 64 MiB : métadonnées et objets WAL, pas les grandes archives de base. Le raccordement à une identité cloud n'est pas effectué.

**Contre-épreuve de revue :** le SDK installé convertit la génération en Number. Le constructeur réel, exécuté hors réseau, arrondit `9007199254740993123` en `9007199254740993000`. La première fixture de flux ne détectait pas cela. Correction : refus avant I/O des générations hors entiers sûrs, avec régression sur le véritable constructeur SDK. Une génération uint64 non représentable exige ultérieurement un transport exact approprié ; elle n'est pas silencieusement arrondie.

`requiredWalSegments` calcule les noms PostgreSQL pour un intervalle LSN semi-ouvert sur une seule timeline, avec taille de segment PostgreSQL explicite. Il couvre les frontières de segment et de journal 4 GiB, borne le travail à 4096 segments et refuse une géométrie invalide. Il ne transforme pas une date en LSN et ne prouve pas la disponibilité, l'intégrité ou le rejeu de ces segments. Un changement de timeline exige la validation des fichiers history, absente ici.

Les tests du lecteur utilisent des flux synthétiques et le constructeur réel du SDK hors réseau. Ceux du calcul WAL sont déterministes. Ils ne constituent pas une recette GCS. La recette physique locale précédente reste distincte et documentée dans `2026-10-25-restore-archive-verification.md`.

## Consommateurs réellement présents

| Chemin                                                          | Connexion actuelle                              | Condition nécessaire avant bascule                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `services/api/src/app.ts`, `inspectPostgresSchema`              | Client PostgreSQL direct par requête            | Admission liée au binding et drainage des requêtes acceptées sur toutes les répliques API          |
| Même fichier, `runDatabaseQuery`                                | Client direct, transaction SQL lecture/écriture | Même admission, fin confirmée des transactions en vol                                              |
| Même fichier, serveur généré, `pg.Pool`                         | Pool autonome max 3                             | Enregistrement du déploiement, arrêt/drainage confirmé, reconnexion au nouveau binding             |
| `services/workspace-manager/src/manager.ts`, workloads déployés | DATABASE_URL injectée par Secret                | Inventaire des workloads et remplacement/reconnexion confirmé, pas seulement mise à jour du Secret |
| Même manager, runtimes de workspace                             | Environnement de pod indépendant                | Arrêt/drainage puis reprise contrôlée ; les clients arbitraires ne coopèrent pas automatiquement   |
| `database-restore-consumer.ts`                                  | Pool coopérant de la recette                    | Déjà testé localement, mais ne représente pas les clients ci-dessus                                |

Le journal durable conserve `pendingFenceTokens`. Le coordinateur exige `fenceAttempt` avant reprise. Il n'existe pas encore d'implémentation production démontrant que les anciens workers et leurs effets externes sont effectivement exclus. Ni expiration du bail, ni silence d'un processus, ni seul arrêt d'un client local ne satisfont ce contrat.

## Décision recommandée avant raccordement production

**Option recommandée :** inventaire durable par projet/environnement/binding de chaque consommateur géré et worker de restauration, admission atomique empêchant tout nouveau consommateur pendant la restauration, puis accusés de drainage/arrêt attachés aux identités immuables et générations. Ne basculer que lorsque tous les participants connus et anciennes tentatives sont exclus. Tout consommateur inconnu ou non contrôlable bloque la capacité. Cette option nécessite de modifier les chemins d'admission API/workspace/déploiement, pas seulement l'adaptateur.

**Alternative plus large :** proxy obligatoire devant toutes les connexions applicatives, avec admission et drainage centralisés. Cela impose architecture réseau et migration des clients ; ce lot n'en crée pas et n'en demande pas les permissions implicitement.

Les gardes et refus actuels restent en place ; aucune fermeture d'un client utilisateur réel, aucune modification d'accès.

## Prérequis externes minimaux

1. Accès en lecture déjà autorisé au bucket Barman depuis un worker existant et inventaire fiable liant projet, UID source, backup et générations/empreintes ; aucun nouvel accès n'a été créé ni testé.
2. Staging immuable et outil Barman compatible pour extraction des grandes archives compressées et WAL/history ; l'image historique épinglée manque toujours. Le test physique utilise exclusivement l'image locale explicitement documentée.
3. Cible isolée contrôlable et preuve PostgreSQL de cible atteinte après replay, puis lecture applicative attendue. Une date dans un nom ou une liste d'objets n'est pas cette preuve.
4. Décision sur l'inventaire/admission des consommateurs et moyens existants de confirmer leur arrêt ainsi que celui des anciens workers. Sans ces garanties, le coordinateur reste non injecté et la restauration cloud refusée.

## Résultats du lot

Commande ciblée : `pnpm --dir services/api exec vitest run src/tests/database-restore-object-reader.spec.ts src/tests/database-restore-wal.spec.ts`. Résultat : **21/21**, zéro échec/omission/retry, 14 cas lecteur et 7 cas WAL, 417 ms. Typage API et compilation des deux modules réussis. Revue indépendante favorable après correction du défaut réel de coercition SDK. Aucune suite globale locale de tests relancée.
