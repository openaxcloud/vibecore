---
id: BUG-WORKSPACE-MANAGER-TIMESTAMP-001
section: "2026-10-18 — Vérification avant commercialisation"
---

## Bug

Le stockage Prisma du workspace-manager retire `updatedAt` de sa réponse,
alors que la colonne existe dans `WorkspaceRuntime`. La route HTTP transmet
ce résultat tel quel. L'API ne peut donc pas appliquer sa borne de dix minutes
aux démarrages périmés et conserve leur créneau de quota actif. Sur une offre
limitée à un workspace, ce créneau peut bloquer l'ouverture d'un autre projet.
Le comptage Prisma possède par ailleurs une borne de fraîcheur de six heures ;
le défaut n'établit donc pas un blocage permanent de tous les quotas.
Les tests isolés de l'API fournissaient le champ manquant dans leurs fixtures.
Défaut reproduit sur main `615b3fcfb59c0c42cd211536ed2b2675fe72fa5f`.

## 📤 Dispatché

☑ Reprise du 18 octobre 2026, après vérification de #708. Sa garde supposait
elle aussi la présence de ce champ ; sa branche n'est pas modifiée.

## 💻 Codé

☐ Le correctif d'horodatage seul reste interdit de livraison. Une correction
coordonnée remplace cette proposition sur `codex/workspace-admission-20261018` : contrat V2,
générations et tentatives CAS, comptage des admissions détenues, verrouillage
des transferts et fermeture durable avant suppression. GET V1 masque la date
pour ne pas activer le consommateur ancien. Quatre migrations additives ;
aucun forfait modifié. Voir le [contrat et les phases de livraison](../reprise/2026-10-18-workspace-admission.md).
Ni fusion ni activation de ce protocole ne sont attestées à ce stade.

Contre-revue de #735 : une course de première réservation permettait à
stop/delete V1 de charger une admission V2 après une première lecture absente,
puis d'en supprimer les ressources sans génération. Restart pouvait refuser
l'appel après avoir déjà supprimé le pod. Trois régressions reproduisent ce
P1 ; le candidat valide la ligne effectivement utilisée et conserve les lignes
legacy sans conversion implicite. Le drainage des anciens binaires ne suffit
pas à lui seul : les nouvelles API peuvent encore choisir V1 après une lecture
absente. Le SHA livré doit inclure ce correctif et sa validation avant activation.

## ✅ Testé live

☐ Aucun parcours live ni pod réel vérifié. Le proxy refuse l'accès aux domaines
de production ; aucune mesure de créneau client n'est effectuée.

## Preuve historique du candidat d’horodatage seul

Épinglé par `services/workspace-manager/src/prisma-store.spec.ts` : base
PostgreSQL locale isolée, stockage Prisma réel, route HTTP du manager et
fonction de décision de quota de l'API. Trois cas : STARTING depuis onze
minutes libérable, STARTING depuis neuf minutes conservé, RUNNING ancien
conservé. `services/workspace-manager/src/manager.spec.ts` couvre création,
mutation, revendication de fenêtre de metering et lecture d'un ancien JSON.

Avant correction : six échecs et un succès dans les sept nouveaux cas.
Après correction : sept succès. Suite complète du manager : 107 tests
réussis, aucun saut, avec PostgreSQL réel ; 30 tests API voisins réussis.
Contre-épreuve complémentaire : neutraliser la décision de libération fait
échouer le cas STARTING périmé ; les deux cas conservés restent verts.
Typecheck et build du manager réussis. Lint différentiel : aucun diagnostic
ajouté (77 avant, 72 après ; le lint global de ces fichiers n'est pas propre).
Cette preuve ne concerne pas
Kubernetes, une restauration de données client ou les abonnements Stripe.
Commandes, environnement et empreintes :
`docs/reprise/mesures/2026-10-18-manager-timestamp-validation.json`.

Effet de la correction : rendre utilisable l'information déjà attendue par
la réconciliation du quota. Les opérations d'arrêt et de suppression de pods,
les délais de GC et le metering ne sont pas modifiés. Un heartbeat récent
peut renouveler `updatedAt` ; ce champ est une date de mutation persistée,
pas une date dédiée de début de provisionnement. Ces résultats historiques ne sont pas la validation du protocole coordonné
décrit ci-dessus.

## Réserve de livraison découverte par la contre-revue

Le correctif de contrat rend opérante une décision de quota dangereuse dans
deux cas établis par le code, sans prétendre les avoir observés en production :

1. Le manager écrit STARTING, crée le pod, puis écrit RUNNING. Un crash avant
   la dernière écriture laisse un pod vivant et un STARTING ancien. Le GC ne
   traite cet état qu'après son délai de suppression (24 heures par défaut).
   Libérer son créneau après dix minutes permettrait de sous-compter le calcul.
2. Même si une sonde confirmait l'absence du pod, une réouverture peut démarrer
   après cette observation. Les chemins `dejaCompte` et `countsAsActive`
   contournent le verrou d'organisation pour les workspaces déjà comptés.
   Une relecture de l'horodatage ne ferme pas la fenêtre après la lecture.

Le merge et le déploiement de `638c1d652` ne sont pas tentés. Les tests verts
prouvent le transport de l'horodatage, pas une admission sûre de pods concurrents.
Le seul ajout d'un champ `podExists === false` ne suffit pas.

Conditions minimales de clôture : exclusion partagée pour toutes les
réouvertures et la libération, protection d'une réservation renouvelée depuis
l'observation, et impossibilité pour un démarrage retardé de créer un pod
après restitution de son créneau sans reprendre une réservation valide.
Le test doit imposer l'entrelacement entre deux projets d'une organisation
limitée à un workspace, avec pod présent, absent, erreur Kubernetes et
génération modifiée. Aucun PVC ne doit être supprimé pour libérer ce quota.

La correspondance starter/core reste elle aussi non modifiée : les fonctions
de migration distinguent l'ancien pro du nouveau pro, sans accès ici au
catalogue et aux abonnements réels permettant de choisir une migration.
