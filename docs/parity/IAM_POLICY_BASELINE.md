# IAM_POLICY_BASELINE — identités & autorisations d'exécution (audit v4 I)

contractId: CTR-IAM-POLICY-BASELINE
contractVersion: 2
schemaVersion: 2
repoCommit: 1692f981
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v1 REFUSED : « inventaire non exhaustif sans tests négatifs » — v2 structuré + ancré, re-soumission requise
implementationAnchor: "Workload Identity KSA→GSA prouvé (object-storage WI, server-deploy) ; revoke→deny PROUVÉ live (215s) ; exec CI interdit via gateway (contrainte prouvée) ; WIF limité au chemin GKE — les 2 autres chemins = CHANTIER D (A2-09) ; inventaire EXHAUSTIF = à compléter (déclaré)"

Baseline des identités GCP/K8s. Complète DOMAIN_MODEL §4 (IAM).

## Faits (cf. mémoire server-deploy + zone-server-deploy + object-storage)

- **Workload Identity** : les pods lient un KSA → GSA GCP ; aucune clé de service
  sur disque. Object Storage per-project (bucket `vc-<projid>`) via WI.
- **Build** : le GSA plateforme a `actAs` sur le compute build SA (Cloud Build) —
  nécessaire pour la promotion/publish. Sans lui, Cloud Build échoue en 403.
- Secrets plateforme dans `vibecore-platform-secrets` ; OAuth providers éditables
  `/admin/oauth-providers` (jamais en dur).
- NetworkPolicy intra-ns : web→api doit passer par le service, pas localhost.

## Invariants

- **I-IAM-1 (moindre privilège par tenant)** : une identité d'exécution de tenant
  ne peut agir que sur SES ressources (bucket `vc-<projid>`, DB du projet) ; pas
  d'accès transverse.
- **I-IAM-2 (pas de clé sur disque)** : toute auth GCP passe par WI ; une clé JSON
  montée = violation.
- **I-IAM-3 (actAs explicite)** : le droit `actAs` sur un SA de build est nommé et
  audité, jamais un rôle large `editor`.
- **I-IAM-4 (step-up pour mutations admin)** : les mutations plateforme-admin
  exigent un reauth récent (`lastReauthAt`), cf. SRF-ADMIN-AGENT-ROUTING.

## 🟡

Baseline documentaire ; l'inventaire exhaustif des bindings IAM prod n'est pas
re-listé ici (owner infra = avi). UNK non bloquant.

## Préconditions
- P-IAM-1 : aucune clé de service account exportée — Workload Identity uniquement.
- P-IAM-2 : toute identité runtime est déclarée ici AVANT usage (une identité non listée est un défaut).

## Invariants
- I-IAM-1 : une révocation IAM prend effet et REFUSE l'accès (prouvé live : revoke→deny 215s).
- I-IAM-2 : les pods CI ne peuvent pas exec dans le cluster via gateway (interdiction prouvée).

## Tests négatifs
- accès après revoke → deny (prouvé) ; exec via gateway depuis CI → refus (prouvé) ; à AJOUTER : test négatif par identité de l'inventaire (chantier).

## Compatibilité
- Complète DOMAIN_MODEL §4 ; lié au chantier WIF 3 chemins (P0-A2-09, projets GCP de test dédiés).

## Résultat de signature
- v1 : REFUSED (« inventaire non exhaustif sans tests négatifs »). v2 : PENDING_REVIEW — 2 tests négatifs réels prouvés et cités ; **l'exhaustivité de l'inventaire + un négatif PAR identité restent un CHANTIER OUVERT, dit tel quel**.
