---
id: BUG-FLEET-MEMBERSHIP-LOCATION-001
section: "Livraison — production"
---

# Découverte Fleet multi-région bloque une membership existante

## 📤 Dispatché

25 octobre 2026, diagnostic du déploiement #784, run 40205758137, job 121219777586. Propriétaire unique du correctif pipeline ; aucun changement des lots restauration ou des PR concurrentes.

## 💻 Codé

Correctif préparé : les deux appels `gcloud container fleet memberships get-credentials` de deploy-main sélectionnent explicitement `europe-west9`, localisation de la membership existante déjà épinglée par `scripts/ci/cluster.sh`. Projet et membership inchangés. Aucun token, droit IAM, ressource, accès réseau ou sécurité modifié. Les échecs de la cible restent bloquants, sans retry/fallback.

## ✅ Testé live

Non pour le correctif. La panne réelle précédente est attestée par le log GitHub : étape 12 Connect Gateway, après construction web réussie, message `Locations ['us-central1'] are currently unreachable`. Helm, rollout et vérification imageIDs sont tous skipped. Aucun rollout de ce run ne peut être revendiqué.

## Cause et portée

La [documentation officielle](https://docs.cloud.google.com/sdk/gcloud/reference/container/fleet/memberships/get-credentials) indique que l'absence de location provoque une sélection automatique de région. L'erreur demande explicitement une location ou un nom de ressource complet. Le workflow omettait cette sélection à ses deux appels. Le code existant du wrapper fixe PROD_LOCATION=europe-west9 et le contexte de cette membership. Le correctif supprime cette dépendance à la découverte de régions non ciblées ; il ne prouve pas la disponibilité future de la région cible.

Un run suivant sur l'ancien workflow conserve cette exposition. On ne peut pas affirmer qu'il échouera forcément : l'indisponibilité distante peut être transitoire. On n'attend pas une seconde panne pour supprimer la découverte inutile.

## Preuves ciblées

Le nouveau test exécute les deux scripts shell réels extraits du YAML, avec commandes gcloud/kubectl isolées. Il reproduit le refus sans location, vérifie les arguments exacts après correction et conserve un échec de cible code42 sans appel kubectl, retry ou fallback. Il ne fait aucun appel GCP et n'est pas une recette cloud.

Avant correction : 3 échecs et 2 succès sur 5 cas. Après : 49/49 sur les trois fichiers ciblés (5 nouveaux cas, garde de câblage du gate, séquencement d'activation existant). Aucun seuil, assertion, délai ou protection affaibli. Revue indépendante et CI de la nouvelle tête requises avant livraison.

Base contrôlée : main b502b144674a4f8e7f96633e36167418214ea9d8, arbre6226f16fadc9dc13410a46dbd2ae9855662f9546. Après expiration de l'authentification gh, les fichiers de main ont été obtenus par le connecteur GitHub déjà autorisé ; l'arbre complet reconstruit est identique à main. Aucune création d'accès.
