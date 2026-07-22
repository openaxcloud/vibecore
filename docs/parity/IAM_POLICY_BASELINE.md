# IAM_POLICY_BASELINE — identités & autorisations d'exécution (audit v4 I)

contractId: CTR-IAM-POLICY-BASELINE
contractVersion: 3
schemaVersion: 2
repoCommit: 60a987ca
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

## Inventaire des identités (dérivé du repo — source déclarée)
Dérivé du chart Helm + du code (PAS d'un export IAM live — voir dépendances) :
- KSA par tier (deployments.yaml : `<release>-<tier>` — api, worker, etc.) ;
  cronjobs → KSA `<release>-worker` ; migrations-job → KSA `<release>-api` ;
- identités plateforme typées `PlatformIamIdentity` (PR #34 : UNIQUE
  kind×app×env×boundary×project ; zéro clé persistante ; séparation
  build ≠ promotion) ;
- identités de preuve WIF (PR #38, projet de test) : `wif-authorized` (rôle
  minimal storage.objectViewer) + `wif-wrong` (aucun accès) — créées puis
  DÉTRUITES au teardown.
L'export IAM LIVE exhaustif (gcloud, par projet/folder) = dépendance ouverte
(GO GCP owner) — l'inventaire ci-dessus est REPO-DÉRIVÉ et dit tel quel.

## Compatibilité
- Complète DOMAIN_MODEL §4 ; ancré sur les 3 chemins WIF PROUVÉS (P0-A2-09,
  PR #38 : GKE re-cité LECTURE SEULE sur la prod ; OIDC GitHub + Cloud Run sur
  projet de TEST `ecode-wif-proof-619021`, teardown joué, zéro clé).

## Résultat de signature
- v1 : REFUSED (« inventaire non exhaustif sans tests négatifs »).
- v2 : REFUSED (RR-20260721-CODEX-04, verbatim) — « deux tests négatifs
  ponctuels ne remplacent pas l'inventaire exhaustif, le négatif par identité
  et les trois chemins WIF encore ouverts ».
- v3 (ce document) : **PENDING_REVIEW** — les 3 chemins WIF ne sont PLUS
  ouverts : PROUVÉS LIVE (PR #38, autorisé + négatif PAR chemin, zéro clé,
  teardown joué) ; inventaire REPO-DÉRIVÉ ajouté (§Inventaire, source
  déclarée). Restent OUVERTS, dits tels quels : export IAM live exhaustif +
  négatif PAR identité de l'inventaire (GO GCP owner). Signature = reçu
  COMPLET.
