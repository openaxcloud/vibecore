# Identité native des segments WAL PostgreSQL 16

Ce lot complète le téléchargement isolé de PR911 et le gate physique PostgreSQL de
PR913. Il n'active aucun coordinator, endpoint, basculement ou accès aux données de
production. `RESTORE_APPLICATION_CUTOVER_UNAVAILABLE` reste inchangé.

`withVerifiedPostgres16WalBytes` compose la vérification gzip/CRC32C/génération
existante avec l'en-tête long PostgreSQL 16. Il exige une identité système issue
de données de contrôle/backup vérifiées indépendamment, compare les 64 bits sans
conversion Number, la timeline, l'adresse du segment, le magic PG16, les flags et
les tailles de bloc/segment. Une archive CRC-valide d'un autre cluster est refusée
avant l'inspecteur. Les deux ordres des octets sont reconnus. Le fichier reste
privé et temporaire; nettoyage et annulation sont ceux du lecteur existant.

Ce contrôle ne prouve ni les CRC des records, ni l'historique des timelines, ni la
continuité complète, ni le replay jusqu'au timestamp. Les champs archiveVerified,
walRecordsVerified et walContinuityVerified restent false. L'en-tête seul n'est
pas une preuve cryptographique de provenance et ne produit pas ArchiveReceipt.

Le gate physique CI collecte 40 octets du segment archivé synthétique et les
compare, via ce même validateur TypeScript, à `pg_control_system()` et au nom/à la
taille de segment fournis par PostgreSQL. Il conserve les contrôles pg_waldump,
pg_verifybackup, récupération temporelle et redémarrage déjà présents. Son entrée
exige désormais explicitement production:false; il ne fabrique plus ce statut à
partir d'un champ absent ou true. Aucune donnée réelle n'est utilisée.

Validation locale : 64 tests WAL (21 nouveaux) et 4 tests du wrapper CI; lint,
strict TypeScript ciblé et syntaxe Bash. La preuve physique réelle du nouveau
contrôle dépend du run CI sur le SHA de la PR; ne pas la déclarer avant son succès.

Restent nécessaires avant activation : adaptateur de récupération physique cloud,
provenance indépendante complète, vérification native de tous les WAL nécessaires,
fencing durable des effets, drainage de tous les consommateurs et cutover/reprise
crash vérifiés. Aucun de ces points n'est marqué terminé par ce lot.

Les plans restent strictement mono-timeline; aucun historique de transition ne peut
être accepté par ce vérificateur. Revue indépendante : aucun bloquant trouvé.
