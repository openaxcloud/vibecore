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
  **non fusionnée**. Le commit de revue `01cf9e90` a été poussé à 17:04:28 UTC.
  La CI confirme la correction des dépendances workspace absentes de la
  première version `89019cdf` : installation, typage et génération Prisma
  réussis. Elle refuse toutefois le registre de rotation des clés, qui
  n'inclut pas les deux nouveaux champs chiffrés du journal. L'étape PostgreSQL
  suivante est donc sautée, pas réussie. Quality Gates échoue séparément sur
  une réponse HTTP 500 de l'API GitHub. Le gate E2E termine aussi en échec :
  456 cas rapportés, quatre échecs persistants, quatre instabilités et six
  exemptions, 75/75 fichiers. Le chargement de l'éditeur, le rechargement
  français et le retour mobile restent à diagnostiquer ; aucune augmentation
  de délai ni exemption nouvelle n'est appliquée.
  [Relevé exact](mesures/2026-10-20-pr745-01cf-ci.json).
  La revue avait aussi
  reproduit une perte d'exclusion entre deux reprises de restauration et
  identifié une incohérence de propriétaire DB après transfert de projet.
  Les corrections locales passent 64 tests API, 29 tests du lanceur CI et
  [31 tests sur PostgreSQL réel](mesures/2026-10-20-restore-ci-postgresql-local.json),
  sans test ignoré dans ce dernier banc. La résolution des dépendances est
  vérifiée sur installation propre avec contre-épreuve du manifeste ancien.
  Les typages API/scripts et le build API sont verts ; le
  [nouveau banc physique](mesures/2026-10-20-restore-physical-review-final.json)
  réussit à 16:47:01 UTC sur les sources corrigées, après un premier essai
  rouge dû au drapeau QA omis par le lanceur. Ces preuves concernent la
  révision de revue antérieure ; aucune preuve cloud n'est ajoutée.
  Une nouvelle contre-revue a reproduit une perte de portée d'autorisation
  après transfert A vers B dans les deux routes de restauration, ainsi que
  dans les lectures/reprovisionnements de DB. Les correctifs locaux donnent
  42/42 tests routes/transfert verts puis, dans une autre exécution, 30/30
  tests PostgreSQL verts à 17:56:18 UTC, sans saut. Ce dernier passage vérifie
  aussi une rotation réelle avec conflit SQL pendant la bascule et reprise
  sans ancienne clé. Le build API termine avec succès à 17:58:53 UTC.
  [Preuves et empreintes](mesures/2026-10-20-restore-auth-rotation.json).
  Le banc physique suivant termine rouge à 18:06:43 : ses 30 tests repository
  passent, mais son lanceur exige encore 21 cas ; les ressources sont nettoyées.
  Ce compteur est corrigé sans retirer l'assertion. Le passage physique
  suivant termine vert à **18:09:30 UTC** : 30 tests PostgreSQL, point de
  restauration exact, quiescence, nouvelle connexion, relecture SQL et
  redémarrage de cible. Les 36 empreintes sources et le nettoyage sont
  conservés avec le premier rouge. Les contrôles du nouveau commit et sa
  fusion restent requis.
  L'ancienne tête `01cf9e90` ne doit pas être fusionnée.
  Aucun incident de production n'est allégué.
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

Le banc PostgreSQL/WAL local a réussi sur la révision de revue antérieure de #745.
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

La recette réelle locale a vérifié la sauvegarde sur disque et dans deux
archives relues, les refus pour une autre identité, les sorties de commande
0/7 et une preview HTTP inspectée. Elle reste globalement rouge. Une sonde
ultérieure reproduit un défaut d'exécution : un unique POST d'une commande de
16 secondes lance trois processus, à environ 0, 15 et 30 secondes, puis le
client expire à 35 secondes. Le correctif est préparé séparément ; aucun succès
du parcours exécution complet, du clic Enregistrer ou de la publication cloud
n'est déduit des étapes déjà passées.

## Reports possibles et estimations

Desktop natif, SSO Enterprise, connecteurs secondaires et parité visuelle
exhaustive peuvent être reportés seulement s'ils sont exclus de l'offre vendue.
Les corrections d'intégrations et de persistance UI restent des candidats
distincts, sans revendication de livraison.

Aucune date globale ni RTO commercial n'est justifiable avant la recette
centrale et cloud. Les durées de petits bancs locaux sont des observations de
test, pas des estimations de disponibilité commerciale.
