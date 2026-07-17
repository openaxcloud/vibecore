# SECURITY_PRIVACY_COMPLIANCE

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d

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
