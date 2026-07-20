# IAM_POLICY_BASELINE — identités & autorisations d'exécution (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: inventaire non exhaustif sans tests négatifs (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — inventaire non exhaustif sans tests négatifs — puis re-soumettre à signature

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
