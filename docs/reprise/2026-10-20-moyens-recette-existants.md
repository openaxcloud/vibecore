# Moyens de recette retrouvés — 20 octobre 2026, 16:05 UTC

Un banc cloud et un compte QA ont bien existé. Leurs coordonnées sont retrouvées
dans le dépôt ; **leur existence et disponibilité actuelles restent non vérifiées**.
Aucun sandbox Stripe TEST ni cible cloud préallouée pour une restauration
synthétique n'est actuellement attesté.

## Où les moyens sont documentés

| Moyen | Référence non secrète retrouvée | État établi |
| --- | --- | --- |
| Banc audit | Projet `vibecore-audit-test-20260807`, cluster `vibecore-audit-cluster`, zone `europe-west9-a`, application `https://app.34.163.208.161.sslip.io`. | [Runbook](../audit/TEST_ENV_RUNBOOK.md), [génération mesurée le 7 septembre](../audit/evidence/2026-09-07-banc/GENERATION-REELLE-MESUREE.md). Preuve historique, pas constat du 20 octobre. |
| Identité QA | Compte `qa-loop-1786822972@local.test`, projet `cmsusbw8q00040nbf7dddmsq1`, workspace `ws-8837656e73850f1c`. | [BUG-AGENT-001](../bugs/BUG-AGENT-001.md). Session, organisation et quotas actuels inconnus. |
| SQL et stockage audit | Cloud SQL `vibecore-audit-postgres` ; buckets `vibecore-audit-test-20260807-{snapshots,exports,deployments,backups,logs}`. | Coordonnées historiques du runbook. Aucun objet synthétique identifié aujourd'hui par génération/manifeste ni cible CNPG préallouée attestée. |
| Staging générique | Environnement GitHub `staging` ; références `STAGING_APP_CLUSTER`, `STAGING_WORKSPACE_CLUSTER`, `STAGING_APP_DOMAIN`, `STAGING_PREVIEW_DOMAIN`. | Déclarations dans `deploy-staging.yml` et `staging-runtime-validation.yml`, distinctes du banc audit nommé. Valeurs et ressources actuelles non accessibles par le connecteur. |
| Stripe | Configuration chiffrée singleton `StripeConfig`, prioritaire sur les variables d'environnement ; secret Kubernetes référencé `vibecore-platform-secrets`. | Le runbook audit indique historiquement TEST non configuré. [Le runbook de mise en service](../STRIPE_GO_LIVE_RUNBOOK.md) concerne LIVE. Aucun sandbox ou catalogue TEST effectif identifié. |

Le TTL initial du banc annonçait un démontage le 14 août, mais une preuve
d'utilisation existe le 7 septembre. Aucun reçu de démontage actuel n'a été
retrouvé : le TTL ne permet donc pas de conclure que les ressources ont disparu.

Le seed standard ne crée aucun utilisateur ni organisation QA. Les helpers E2E
créent leurs propres identités jetables. Un quota effectif dépend de
l'abonnement, du plan enregistré, des overrides et de l'usage ; le catalogue
du code ne constitue pas un solde. Le crédit du fournisseur de modèle reste
également distinct.

## Vérification actuelle et blocage exact

- À **15:58:07 UTC**, un seul HEAD vers l'application du banc, avec le proxy
  existant inchangé, reçoit **CONNECT 403**. L'origine n'est pas atteinte.
  Aucun autre chemin réseau n'a été essayé.
- `gcloud`, `kubectl` et `stripe` ne sont pas présents dans le PATH. Aucun outil
  GCP/Kubernetes ni variable de session QA/cloud/Stripe n'est exposé ici.
- À **16:00:33 UTC**, les emplacements ADC, base de comptes gcloud et kubeconfig
  du HOME effectif `/home/agent`, ainsi que `/workspace/.kube/config`, sont
  absents. Seule leur présence a été vérifiée. Une tentative préalable de
  métadonnées sous `/root` a été refusée par le système de fichiers ; elle n'a
  pas été réessayée et aucun contenu de credentials n'a été lu.
- Le catalogue d'environnements Codex accessible à cette tâche retourne zéro
  environnement enregistré. Cela ne prouve pas l'absence de configurations
  sauvegardées ailleurs ou de ressources cloud.
- Les endpoints GitHub `environments` et l'historique par fichier de workflow
  sont refusés par le connecteur comme non pris en charge, HTTP 400. Ce n'est
  pas une réponse déclarant des ressources inexistantes. Parmi les 100 runs
  accessibles du 19 octobre à 03:13 au 20 octobre à 15:15 UTC, aucun workflow
  staging n'apparaît ; ce périmètre ne couvre pas tout l'historique.

Les lectures existantes de l'application permettraient de vérifier les
consommations et droits sous une session QA autorisée. `/admin/stripe-config`
expose des booléens de présence et des IDs de catalogue, sans prouver TEST ;
`/admin/stripe-health` appelle réellement Stripe et peut indiquer `livemode`.
Aucune de ces routes n'a été appelée pendant cet inventaire.

Les coordonnées à contrôler sont donc connues. La vérification directe reste
bloquée dans cet environnement, faute de réseau vers le banc et de session
opérateur déjà autorisée. Aucune création de ressource ni nouveau droit
permanent n'est justifiée par ce constat.

## Défaut vérifié avant réemploi de la configuration

Dans main `9c8f6bc6`, `infra/helm/platform/values-audit-test.yaml:99` prévoit un
bucket et un compte de service de sauvegarde propres à l'audit. Mais
`infra/helm/platform/templates/configmap.yaml:177` impose encore les coordonnées
de production en littéraux et ignore ces overrides.

C'est une divergence vérifiée dans le code, **pas une preuve d'écriture
effective en production**. Le chart ne peut pas être considéré comme une
configuration de restauration isolée prête à réutiliser. Un correctif distinct
est en préparation ; aucune application Helm ni restauration n'a été lancée.

L'audit et la production ont aussi utilisé les mêmes noms de release et
namespace `vibecore` : [collision historique](../bugs/BUG-QA-AUDIT-RELEASE-NAME-COLLISION-001.md).
Toute future inspection doit épingler le projet **et** le cluster audit.
Le contexte Kubernetes ambiant ne suffit pas.

Cet inventaire n'a lu aucune valeur secrète, lancé ni `access-sheet.sh`,
ni `mint-secrets.sh`, ni création de catalogue Stripe, ni inscription,
ni allocation cloud, ni paiement. Les moyens QA locaux restent disponibles
pour les corrections et leurs tests isolés.
