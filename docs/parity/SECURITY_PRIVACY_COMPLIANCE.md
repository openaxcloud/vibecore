# SECURITY_PRIVACY_COMPLIANCE

contractId: CTR-SECURITY-PRIVACY
contractVersion: 2
schemaVersion: 2
repoCommit: 1692f981
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v1 REFUSED : « threat model/rétention incomplets » — v2 structuré + ancré, re-soumission requise
implementationAnchor: "Acquis PROUVÉS : masquage PII au remix EN PROD (7bd91bcf) + licence fail-closed (7e001f3d) + secret-scan bloquant (gitleaks) + sandbox gVisor + NetworkPolicy + invariant secret-jamais-dans-le-clone ; threat model FORMEL + politique de RÉTENTION = CHANTIER OUVERT (refus v1, déclaré)"

## Sécurité (réel)

- Sandbox: workspaces et builds sur pool gVisor (`sandbox-gvisor`); egress
  labellisé pour les pods de build; NetworkPolicy intra-ns.
- Secrets: `vibecore-platform-secrets` (K8s); côté produit, secrets projet =
  env; règle produit (spec Remix): les valeurs ne sont jamais exportées d'un
  remix. Repo PUBLIC: gitleaks pre-commit + CI (`918d4060`), historique vérifié
  sans secret réel (templates vides).
- Authn: sessions hashées (tokenHash sha256), re-auth admin <5 min pour les
  mutations, MFA admin (garde `requireAdminMfaForSensitiveAction`),
  impersonation tracée.
- Audit: `AuditLog` (tenant) + `AdminAuditLog` (opérateur), append-only,
  rédaction sans suppression de ligne; exports CSV.
- Durcissement éprouvé: ~30 vagues d'audit multi-agents (SSRF/IDOR/SAML/
  MCP-RCE/quotas) — classes majeures épuisées (docs/audits).

## Privacy

- Données par tenant isolées (org → projets → PVC dédiés).
- Suppression de compte: file de purge 14 jours (admin account-deletions).
- DPA/politique de rétention formelle: **UNKNOWN — non rédigées.**

## Compliance

- Certifications (SOC 2, ISO 27001, GDPR posture formalisée): **AUCUNE à ce
  jour — UNKNOWN/NON ENGAGÉES.** Aucun claim de conformité ne doit apparaître
  sur les surfaces marketing tant que ce statut n'a pas changé.

## Préconditions
- P-SEC-1 : tout secret produit vit chiffré (valueEncrypted) ; jamais en clair dans clone/logs/job.
- P-SEC-2 : toute donnée personnelle qui traverse un flux cross-user est masquée OU couverte par un consentement versionné (I-RMX-3, en prod).

## Invariants
- I-SEC-1 : un secret ne survit pas à un remix (scan actif, quarantaine 409 — prouvé).
- I-SEC-2 : fail-closed licence : aucun contenu utilisateur re-licencié silencieusement (prouvé : zéro MIT auto, défaut non-remixable en prod).
- I-SEC-3 : la CI bloque tout secret dans les snapshots (gitleaks bloquant, faux positifs assainis à la source).

## Tests négatifs
- valeur de secret survivante → 409 quarantaine (prouvé) ; remix sans licence → 403 (prouvé) ; PII résiduelle post-masquage → RemixInvariantError (prouvé) ; secret dans snapshot → CI rouge (prouvé).

## Compatibilité
- S'appuie sur IMPORT_REMIX_CONTRACT (I-IMP/I-RMX) et BILLING_LEDGER (immutabilité) ; textes juridiques à valider avant lancement public (directive licence).

## Résultat de signature
- v1 : REFUSED (« threat model/rétention incomplets »). v2 : PENDING_REVIEW — les acquis réels sont ancrés et testés ; **le threat model formel et la politique de rétention/effacement restent un CHANTIER OUVERT, dit tel quel** (lié §16.12 expiry 30j : UNK-FREE-EXPIRY-IMPL).
