# Commercialisation — preuves du 20 octobre 2026

Le lancement commercial complet **n'est pas démontré**. Ce relevé distingue
livraison technique, tests locaux et preuve du service réellement utilisé.
Il remplace les inventaires anciens comme point de départ de cette reprise,
sans supprimer leur historique.

## État établi

- Main : `9c8f6bc6d95a97ddf54a52a932a6c07aff4f2828`, fusion protégée de
  [#743](https://github.com/openaxcloud/vibecore/pull/743) à 13:31:39 UTC.
  CI réussie à 13:52:43 ; E2E réussies à 13:58:57 : 456 tests rapportés,
  zéro échec persistant, une instabilité, six dérogations préexistantes.
- [Déploiement 39431157717](https://github.com/openaxcloud/vibecore/actions/runs/39431157717)
  réussi à 14:58:11 UTC : quatre builds, contrôles de sécurité, Helm, rollout
  et comparaison des imageIDs au manifeste. Les détails et limites sont dans
  [la preuve structurée](mesures/2026-10-20-deployment-9c8f6bc6.json).
  #744 est incluse dans cette livraison ; son premier déploiement avait été
  refusé par les E2E.
- `e-code.ai`, `app.e-code.ai` et `api.e-code.ai/health` sont inaccessibles
  depuis cet environnement : refus du proxy au CONNECT à 13:18:54 UTC.
  L'origine n'a pas été atteinte. La version publique réellement servie reste
  inconnue ; aucune panne d'origine n'est déduite de ce refus. Les captures
  CI ne sont pas accessibles non plus et ne sont pas prétendument inspectées.
- [#745](https://github.com/openaxcloud/vibecore/pull/745) est ouverte,
  **non fusionnée**. Son premier commit `89019cdf` échoue en CI sur trois
  dépendances workspace absentes du manifeste racine. La revue a aussi
  reproduit une perte d'exclusion entre deux reprises de restauration et
  identifié une incohérence de propriétaire DB après transfert de projet.
  Les corrections locales passent 64 tests API, 29 tests du lanceur CI et
  [31 tests sur PostgreSQL réel](mesures/2026-10-20-restore-ci-postgresql-local.json),
  sans test ignoré dans ce dernier banc. La résolution des dépendances est
  vérifiée sur installation propre avec contre-épreuve du manifeste ancien.
  Les typages API/scripts et le build API sont verts ; le
  [nouveau banc physique](mesures/2026-10-20-restore-physical-review-final.json)
  réussit à 16:47:01 UTC sur les sources corrigées, après un premier essai
  rouge dû au drapeau QA omis par le lanceur. Le commit de revue, ses contrôles
  CI et sa fusion restent à terminer ; aucune preuve cloud n'est ajoutée.
- 22 anciennes PR en brouillon restent séparées. Les suppressions ont été
  inspectées : #324 supprime notamment cinq chemins encore présents sur main.
  Aucun de ces anciens lots n'a été fusionné ni écrasé.

## Indispensables avant vente de la plateforme complète

| Critère                    | Preuve encore requise                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Parcours central           | Inscription réelle, création par agent, exécution, persistance après réouverture et URL publiée utilisable ; erreurs et annulation réelles. |
| Isolation et limites       | Deux identités, droits et refus, séparation des workspaces, quotas et réconciliation préalable à l'activation V2.                           |
| Facturation                | Parcours Stripe TEST, correspondance prix/droits, mensualité/annualité, webhooks idempotents, refus, changement et résiliation.             |
| Sauvegarde et restauration | Archive/WAL cloud, arrêt des écritures de tous les consommateurs, bascule, relecture indépendante et reprise après panne.                   |
| Service livré              | Parcours HTTPS sur mobile et Safari, erreurs honnêtes, version publique reliée à la livraison.                                              |

Le banc PostgreSQL/WAL local a réussi sur le candidat corrigé de #745.
Le coordinateur reste désactivé dans le serveur de production : ses pilotes
CNPG/GCS/runtime et le cycle de vie après bascule restent à réaliser et prouver.
Ni ce banc ni la CI générale ne prouvent une restauration cloud.

Le workflow Runtime `39370084898` est reporting-only : son workflow vert
contient un job avec 18 échecs. Il ne démontre pas le parcours central.

## Moyens de recette retrouvés et accès actuels

[L’inventaire du 20 octobre](2026-10-20-moyens-recette-existants.md) identifie le
banc `vibecore-audit-test-20260807`, son cluster et un compte QA historique.
L’existence actuelle, le solde des quotas et les archives synthétiques restent
non vérifiés : le HEAD du banc est refusé au CONNECT et aucune session opérateur
cloud n’est exposée dans cet environnement. Les emplacements exacts et les
lectures nécessaires sont désormais connus ; il n’est pas demandé à
l’utilisateur de rechercher de nouveau ces coordonnées.

Aucun sandbox Stripe TEST n’a été identifié. Le runbook retrouvé concerne
LIVE ; les variables absentes du processus ne prouvent pas l’absence d’une
configuration chiffrée en base. Aucun paiement, changement LIVE ni nouvelle
ressource payante n’a été déclenché.

Un défaut du chart est confirmé sur main : les overrides de sauvegarde audit
sont ignorés au profit de coordonnées de production. Un correctif séparé est
préparé ; aucune restauration ni réactivation du banc n’est autorisée par cette
simple découverte. Les noms identiques de release/namespace imposent aussi
l’épinglage explicite du projet et du cluster.

L’accès GitHub et le pipeline de livraison existant fonctionnent. Les corrections
et recettes locales continuent sans droit permanent supplémentaire. La matrice
fonctionnelle est réconciliée avec les **31 panneaux adressables** du registre
actuel, leurs sous-vues et handlers ; une capacité désactivée n’est pas une
fonction achevée. La [matrice des actions et preuves](2026-10-20-matrice-panneaux.md)
ne certifie aucun panneau complet. Les quelques actions documentées sont
distinguées des recettes Monaco échouées, des refus sûrs et des actions sans
reçu. Les gardes d'ouverture/GET ne sont pas comptées comme des clics métier.

## Reports possibles et estimations

Desktop natif, SSO Enterprise, connecteurs secondaires et parité visuelle
exhaustive peuvent être reportés seulement s'ils sont exclus de l'offre vendue.
Les corrections d'intégrations et de persistance UI restent des candidats
distincts, sans revendication de livraison.

Aucune date globale ni RTO commercial n'est justifiable avant la recette
centrale et cloud. Les durées de petits bancs locaux sont des observations de
test, pas des estimations de disponibilité commerciale.
