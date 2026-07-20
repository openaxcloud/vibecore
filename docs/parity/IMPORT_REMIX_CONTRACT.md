# IMPORT_REMIX_CONTRACT — import & remix sécurisés (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: 2 machines contradictoires (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — 2 machines contradictoires — puis re-soumettre à signature

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

## Machine à états Import — ALIGNÉE sur le plan §9.2 (P0-EX-04, 2026-07-20)

```text
RECEIVED → STAGING_ISOLATED → SCANNING
   ├─ clean ───────────────→ READY_TO_COMMIT
   └─ blocking findings ──→ QUARANTINED → AWAITING_USER_ACTION → RESCANNING → READY_TO_COMMIT
READY_TO_COMMIT → COMMITTING → COMMITTED
latéraux : ROLLING_BACK · CLEANUP_PENDING · EXPIRED · CANCELLED · FAILED
```

CORRECTION (branchement clean/quarantaine) : **un import propre ne passe pas
artificiellement par la quarantaine** — SCANNING branche vers READY_TO_COMMIT
quand aucun finding bloquant. Le consentement explicite est requis pour toute
transformation/exception/acceptation de finding, PAS pour un payload propre.
Le commit atomique ne part QUE de READY_TO_COMMIT.

Tests négatifs exigés : (1) COMMITTING depuis SCANNING refusé ; (2) payload
propre forcé en QUARANTINED = violation ; (3) findings bloquants → commit
refusé sans passage AWAITING_USER_ACTION→RESCANNING.
État réel : l implémentation actuelle (import-pipeline.ts) suit l ancienne
machine linéaire — l alignement du CODE est un work item (pas coché fait).

