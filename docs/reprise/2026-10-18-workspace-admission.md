# Admission coordonnée des workspaces — 18 octobre 2026

État : candidat local validé, non fusionné et non activé. Branche
`codex/workspace-admission-20261018`. La production
attestée par la dernière livraison GitHub reste celle de #733. Ce document ne
certifie aucun parcours utilisateur live.

## Défaut reproduit et périmètre corrigé

Rendre `updatedAt` au consommateur historique aurait activé une libération
incorrecte après dix minutes : un pod peut exister derrière STARTING, ou un
second réplica peut rouvrir l'espace après la lecture. Deux reproductions avec
API, manager HTTP et PostgreSQL réels obtenaient deux pods instrumentés pour
un quota de un. Le correctif d'horodatage seul a donc été retenu hors de main.

Le nouveau contrat utilise les données PostgreSQL existantes et quatre
migrations additives, sans nouvelle infrastructure ni droit supplémentaire :

- Une génération de réservation et un identifiant de tentative protègent les
  transitions RESERVED → PROVISIONING → ACTIVE → STOPPING → RELEASED par CAS.
  Une continuation ancienne ne peut ni créer ni nettoyer la tentative suivante.
- Toutes les réouvertures passent par le verrou d'organisation. Le comptage
  additionne les admissions détenues et les lignes API non déjà représentées.
  Une ligne API inactive depuis six heures ne masque plus une admission V2.
- Libérer une réservation périmée exige une absence de pod confirmée et un CAS.
  Une erreur Kubernetes, une création incertaine ou un provisionnement en cours
  conserve le quota. Cette opération ne supprime jamais de PVC.
- Un registre d'appels de réservation non confirmés, indépendant du statut UI,
  et le même verrou de ligne Project empêchent un transfert pendant un appel
  tardif, même lorsque le verrou advisory d'origine a expiré.
- Une suppression définitive ferme durablement le projet avant tout HTTP.
  Restauration, transfert et nouvelle réservation sont refusés. Les ressources
  sont démontées avant les lignes ; tout échec conserve les références pour
  reprise. DELETE V2 ne supprime un PVC que sur demande explicite, après arrêt
  confirmé et transition exclusive. Aucun espace client n'a été supprimé ici.
- GET V1 masque toujours `updatedAt` : un ancien consommateur ne reçoit pas le
  signal qui rendrait sa règle de dix minutes dangereuse.

## Validation et limites

Les tests utilisent PostgreSQL 16.15 local dans un conteneur limité à 512 MiB,
les vrais stores Prisma, deux API et le manager HTTP. Kubernetes est instrumenté
localement ; le serveur agent de test n'est pas une application générée. Les
comptages de pods dans ces tests ne sont donc pas des mesures du cluster.
Les preuves détaillées et empreintes figurent dans le
[relevé de validation](mesures/2026-10-18-workspace-admission-validation.json).
Suite manager : 144 succès, zéro saut ; puis 98 tests après corrections de
style. API : 44 tests distincts ciblés, dont dix courses PostgreSQL. Typecheck
et build API/manager réussis, cinq gardes de livraison réussies. Aucun nouveau
diagnostic lint ; dette historique explicitement conservée.

Les cas couvrent notamment pod vivant avec STARTING ancien, réouverture
concurrente, start déjà envoyé puis invalidé, erreur de lecture Kubernetes,
inactivité API de sept heures, expiration réelle d'une transaction advisory,
transfert concurrent et suppression. La contre-revue n'a pas relevé de nouveau
P1 dans ce contrat local ; elle ne vaut pas validation de production.

Les anciennes lignes sans génération restent legacy. Leur limite de comptage
API de six heures et leurs démarrages sans jeton ne sont pas transformés en
admissions sûres par ce changement. Aucun backfill ni libération forcée n'est
ajouté. Leur inventaire et leur réconciliation réelle restent nécessaires.

## Livraison en deux étapes

1. Appliquer les migrations 0087–0090 via le mécanisme de livraison existant.
   Livrer tous les lecteurs de quota et les managers, avec
   `WORKSPACE_ADMISSION_V2_QUOTA_ENABLED=true` et
   `WORKSPACE_ADMISSION_V2_ENABLED=false`. Les valeurs sont réaffirmées dans
   le workflow Helm malgré `--reuse-values` ; une vérification du ConfigMap
   vivant refuse une valeur manquante ou une activation prématurée.
2. Avant toute activation, prouver l'absence de pods API/manager de l'ancienne
   révision, y compris ceux en terminaison, et des anciens appels Kubernetes
   encore en vol. `rollout status` et la comparaison des imageIDs du seul
   ReplicaSet courant ne prouvent pas ce drainage. Inventorier et traiter les
   runtimes legacy dans une intervention autorisée, sans suppression implicite.
3. Activer la création de réservations dans une livraison séparée, avec preuve
   du parcours réel et des cas de reprise. Ne pas revenir à des binaires qui
   ignorent les admissions tant que des réservations V2 existent. Désactiver
   leur création conserve les lecteurs et le protocole d'arrêt/suppression.

L'accès opérateur et HTTP production manque dans cet environnement : proxy
CONNECT 403 vers e-code.ai, app.e-code.ai et api.e-code.ai ; aucun accès cloud
utilisable. La phase d'activation ne peut donc pas être attestée ici.

## Réconciliation d'une issue incertaine

Un appel reserve sans succès confirmé laisse son UUID dans le registre ; un
refus HTTP non distingué d'une issue incertaine peut également le conserver.
Cela bloque transfert/suppression de façon conservatrice. Ne pas effacer ces
UUID ou forcer RELEASED sur la seule base du temps écoulé. Une intervention
opérateur doit d'abord prouver que les anciennes requêtes sont terminées,
identifier génération/tentative et vérifier le pod réel. Aucune mutation de
production destinée à cette réconciliation n'est autorisée par ce document.

Autre défaut préexistant relevé : `waitForAgentReachable` journalise la fin de
son délai puis laisse poursuivre vers RUNNING. Les tests du présent protocole
prouvent l'admission des ressources, pas la disponibilité de l'agent. Ce point
reste à corriger et à vérifier avant de certifier l'exécution d'une application.

Un P2 d'état API reste ouvert : une réponse d'arrêt tardive peut écrire STOPPED
après un nouveau démarrage. La génération protège le pod et le comptage V2
conserve son quota ; l'affichage/API peut toutefois être décalé. Les preuves de
ce lot ne le présentent pas comme corrigé.
