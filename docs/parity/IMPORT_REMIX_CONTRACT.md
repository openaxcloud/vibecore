# IMPORT_REMIX_CONTRACT — import & remix sécurisés (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat des deux pipelines prouvés : `services/api/src/import-pipeline.ts` et
`services/api/src/remix-pipeline.ts` (DOMAIN_MODEL §1–2).

## Remix (fork sécurisé)

```
SNAPSHOT_PINNED → CREDENTIALS_DETACHED → CLONING → SCANNING → … 
```

- **I-RMX-1 (détacher avant cloner)** : `assertRemixTransition` refuse
  `CLONING` avant `CREDENTIALS_DETACHED` (`REMIX_CLONE_BEFORE_DETACH`). La VALEUR
  d'un secret n'entre JAMAIS dans le clone.
- **I-RMX-2 (la preuve cherche le secret)** : `scanClonedFilesForSecrets` +
  `scrubSecretsFromFiles` — le test CHERCHE le secret dans le clone et prouve
  qu'il n'y est pas. 3 modes : DETACH / CLONE / SHARE_WITH_CONSENT.
- 14 tests.

## Import (staging jetable)

```
RECEIVED → STAGING_ISOLATED → SCANNING → QUARANTINED → AWAITING_USER_ACTION
        → COMMITTING → COMMITTED   |   ROLLING_BACK/EXPIRED/CANCELLED
```

- **I-IMP-1 (pas de suppression silencieuse)** : les findings sont présentés et
  BLOQUANTS ; redaction seulement avec consentement (`applyConsentedRedactions`).
- **I-IMP-2 (staging jetable, pas de mount cible)** : le staging isolé ne monte
  JAMAIS la cible avant le commit atomique ; cleanup sur cancel/timeout/FAILURE.
- **I-IMP-3 (scan read-only)** : `scanStagedFilesForSecrets` (env-secret,
  private-key, provider-token, high-entropy) lit sans muter ; logs redigés.
- 12 tuiles hub (`IMPORT_HUB_PROVIDERS`), 4 exécutées (github/bitbucket/zip/empty).
- Décision E-CODE : réservation de crédits idempotente (`DEC-IMPORT-CREDIT-RESERVE`).
- 22 tests.

## 🟡

Débit réel des crédits d'import = shadow (marqueur `creditsReserved`), câblage
réel = follow-up (`DEC-IMPORT-CREDIT-RESERVE`).
