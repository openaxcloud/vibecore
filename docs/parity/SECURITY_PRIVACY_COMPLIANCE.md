# SECURITY_PRIVACY_COMPLIANCE

contractId: CTR-SECURITY-PRIVACY
contractVersion: 3
schemaVersion: 2
repoCommit: 60a987ca
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v2 REFUSED : « threat model formel et règles de rétention/effacement restent ouverts » — v3 livre les deux (THREAT_MODEL.md + §Rétention), gaps restants LISTÉS, re-soumission requise
implementationAnchor: "Acquis PROUVÉS : masquage PII au remix EN PROD (7bd91bcf) + licence fail-closed (7e001f3d) + secret-scan bloquant (gitleaks) + sandbox gVisor + NetworkPolicy + invariant secret-jamais-dans-le-clone ; v3 AJOUTE : threat model formel STRIDE (docs/parity/THREAT_MODEL.md — 7 frontières, 33 menaces, 26 ancrées) + politique de rétention/effacement par classe de données (§Rétention) ; gaps résiduels déclarés, rien d'auto-clôturé"

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

## Threat model (v3)

Le threat model formel est livré dans **`docs/parity/THREAT_MODEL.md`** :
méthode STRIDE sur **7 frontières de confiance** (internet→ingress,
api→workspace, workspace→api/réseau, api→DB/Redis/GCS/CNPG, api→providers IA,
api↔Stripe/OAuth, contenu tiers importé/remixé), **33 menaces** dont **26
couvertes avec ancre** (fichier:ligne / migration / workflow / PR), **4
partielles** et **3 gaps purs** — chaque gap avec gravité et piste (§6 du
threat model). Aucune menace « couverte » sans ancre vérifiée par grep.

## Privacy

- Données par tenant isolées (org → projets → PVC dédiés).
- Suppression de compte: demande self-serve → **grâce 14 jours** annulable →
  purge (`services/api/src/data-deletion.ts:7` `DELETION_GRACE_PERIOD_DAYS=14`) ;
  file admin `/admin/account-deletions` + cancel + export
  (`services/api/src/app.ts:26609,26661,26687`) ; périmètre supprimé/retenu
  affiché à l'utilisateur (`data-deletion.ts:14-19`).
- DPA formelle : **UNKNOWN — non rédigée** (inchangé, déclaré).
- Politique de rétention/effacement : **livrée en v3, §Rétention ci-dessous.**

## Rétention / effacement (v3) — par classe de données réelle

Classes tirées du schéma réel (`packages/database/prisma/schema.prisma`).
« Durée » = durée de rétention PROPOSÉE par ce contrat (à ratifier par la
revue) ; « Mécanisme » = ce qui existe AUJOURD'HUI dans le repo, sinon
[GAP DÉCLARÉ]. Base légale exprimée simplement (utile RGPD, sans jargon).

| Classe de données (modèles réels) | Durée proposée | Mécanisme d'effacement EXISTANT | Base légale simple |
|---|---|---|---|
| Comptes & profils (`User`, `Account`, `OAuthConnection`) | vie du compte + grâce 14 j | Machine d'états request→grace→purge (`data-deletion.ts:11,27-42`) + file admin (app.ts:26609). **[GAP DÉCLARÉ — gravité HAUTE]** : aucun exécuteur automatique de purge trouvé — `purgedAt` n'est jamais écrit hors specs ; l'état `ready_to_purge` existe mais rien ne le consomme. Piste : worker BullMQ de purge idempotent. | exécution du service ; effacement à la demande |
| Projets & fichiers (`Project`, `FileSnapshot`, `ProjectSnapshot`, `ProjectStorageObject`, PVC, buckets GCS) | vie du projet ; supprimés à la purge du compte | Suppression projet en produit ; cascades Prisma (`onDelete: Cascade` sur relations User). **[GAP DÉCLARÉ — gravité MOYENNE]** : purge PVC/GCS liée à la purge compte non prouvée (dépend du gap exécuteur ci-dessus). | exécution du service |
| Sessions & tokens (`Session`, `EmailVerificationToken`, `PasswordResetToken`, `ApiKey`, `ScimToken`, `MfaRecoveryCode`) | validité `expiresAt`, puis 90 j max | Expiration LOGIQUE (`expiresAt`/`revokedAt`, schema:118-137) ; tokens stockés hashés (`tokenHash`, schema:121,1196,1221). **[GAP DÉCLARÉ — gravité BASSE]** : pas de job de suppression physique des lignes expirées trouvé. Piste : cron `deleteMany` sur `expiresAt < now-90j`. | sécurité du service |
| Imports (`ImportJob` + `findings`) | jusqu'au terminal + `expiresAt` | Findings TOUJOURS rédigés — « redacted, no value » (schéma, modèle ImportJob) ; états terminaux `EXPIRED`/`CANCELLED`/`FAILED` + états de cleanup (`services/api/src/import-pipeline.ts:45,50,86`) ; staging jetable, `targetProjectId` null hors COMMITTED | exécution du service ; minimisation (jamais la valeur du secret) |
| Checkpoints agent (`AgentCheckpoint`) | **90 j par défaut**, réglable | EXISTANT : réglage système `checkpoints.retentionDays` (défaut 90) + prune admin par cutoff (app.ts:26116-26138, `retentionFloorMs` app.ts:182) | exécution du service |
| Contenus IA (`AiConversation`, `AiMessage`, `AiToolCall`, `AgentRun`) | vie du compte ; purgés avec lui (« Chats and AI history », `data-deletion.ts:16`) | Dépend de l'exécuteur de purge → hérite du **[GAP HAUTE]** ligne 1 | exécution du service |
| Compteurs & coûts IA (`AiTokenUsage`, `AiCostLedger`, `AgentCallLog`, `UsageEvent`) | **7 ans** (rattachés à la facturation) | Garde `canPurgeFinancialRecord` fail-closed (`data-deletion.ts:8,54-59`, `FINANCIAL_RETENTION_DAYS=2555`) | obligation comptable/fiscale |
| Facturation & Stripe (`StripeEvent`, `StripeWebhookFailure`, `Subscription`, `CreditLedger`, `Ledger*`) | **7 ans** | Idem `canPurgeFinancialRecord` ; écritures postées IMMUABLES par triggers Postgres (mig `0078_double_entry_ledger/migration.sql:163-183`) — correction = transaction inverse, jamais mutation | obligation comptable/fiscale |
| Audit (`AuditLog`, `AdminAuditLog`, `SecurityEventResolution`) | **13 mois proposés** (« limited window » déjà annoncé, `data-deletion.ts:17`) | Append-only ; rédaction ciblée SANS suppression de ligne (`store.redactAuditLogs`, app.ts:27582). **[GAP DÉCLARÉ — gravité BASSE]** : durée non appliquée par un job. | sécurité, défense en cas de litige |
| Logs applicatifs (stdout pods → Cloud Logging) | 30 j proposés | **[GAP DÉCLARÉ — gravité BASSE]** : rétention gérée hors repo (défaut GCP), non pilotée par ce dépôt. Piste : durée explicite en Terraform. | sécurité, diagnostic |
| Marketing & support (`NewsletterSubscriber`, `ContactRequest`, `SupportTicket`, `TicketMessage`) | désinscription immédiate ; tickets 24 mois proposés | Désinscription newsletter en produit. **[GAP DÉCLARÉ — gravité BASSE]** : pas de purge programmée des tickets/contacts. | consentement (newsletter) ; intérêt légitime (support) |

Bilan rétention : **11 classes couvertes** — 4 avec mécanisme d'effacement
existant et ancré (imports, checkpoints, financier/immutabilité, audit-rédaction),
7 portant un gap déclaré, dont **1 HAUTE** (exécuteur de purge de compte absent :
la file et la machine d'états existent, l'effacement effectif n'est pas prouvé).

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
- S'appuie sur IMPORT_REMIX_CONTRACT (I-IMP/I-RMX) et BILLING_LEDGER (immutabilité — mêmes triggers mig 0078 cités ici, aucune contradiction) ; textes juridiques à valider avant lancement public (directive licence).
- Le threat model (docs/parity/THREAT_MODEL.md) renvoie vers OPERATIONS_DR.md, IAM_POLICY_BASELINE.md, APP_STORAGE_CONTRACT.md et AGENT_TOOL_BROKER_CONTRACT.md sans redéfinir leurs invariants.

## Résultat de signature / historique
- v1 : REFUSED (« threat model/rétention incomplets »).
- v2 : REFUSED — verbatim relecteur : « **threat model formel et règles de rétention/effacement restent ouverts** — ces éléments font partie du périmètre même du contrat. »
- v3 : PENDING_REVIEW — livre les deux éléments demandés : (1) threat model formel STRIDE (`docs/parity/THREAT_MODEL.md` — 7 frontières, 33 menaces : 26 couvertes-ancrées / 4 partielles / 3 gaps purs, chaque gap avec gravité + piste) ; (2) politique de rétention/effacement par classe de données réelle (§Rétention — 11 classes, 4 mécanismes existants ancrés, 7 gaps déclarés dont 1 HAUTE : exécuteur de purge de compte absent). **Gaps restants LISTÉS tels quels, rien d'auto-clôturé** ; reviewer attendu : OpenAI-Codex (lié §16.12 expiry 30j : UNK-FREE-EXPIRY-IMPL).
