# IMPORT_REMIX_CONTRACT — import & remix sécurisés

contractId: CTR-IMPORT-REMIX
contractVersion: 2
schemaVersion: 2
repoCommit: 1692f981
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v1 REFUSED (lot 57febeab : « 2 machines contradictoires, l'implémentation suit l'ancienne ») — v2 : UNE seule machine, code aligné (PR #27), re-soumission requise
implementationAnchor: "Import : PR #27 (branche feat/import-state-machine-p0ex04) — NON MERGÉE ; import-pipeline.ts réécrit sur LA machine normative + import-billing.ts (réservation idempotente/compensation) + import-state-machine-e2e.spec.ts (256 lignes). Remix : MERGÉ en prod (7bd91bcf) — remix-pipeline.ts + licence fail-closed (#25)."

## 1. Machine à états Import — LA machine (unique, normative = implémentée)

```text
RECEIVED → STAGING_ISOLATED → SCANNING
   ├─ clean ───────────────→ READY_TO_COMMIT
   └─ blocking findings ──→ QUARANTINED → AWAITING_USER_ACTION → RESCANNING → READY_TO_COMMIT
READY_TO_COMMIT → COMMITTING → COMMITTED
latéraux (depuis tout état non terminal) : ROLLING_BACK · CLEANUP_PENDING · EXPIRED · CANCELLED · FAILED
```

Il n'existe PLUS d'ancienne machine : `import-pipeline.ts` (PR #27) implémente
exactement celle-ci (`ImportState`, 14 états, terminaux = COMMITTED /
ROLLING_BACK / EXPIRED / CANCELLED / FAILED). Un import propre ne passe PAS par
la quarantaine ; un payload avec findings bloquants ne peut PAS atteindre
READY_TO_COMMIT sans AWAITING_USER_ACTION → RESCANNING (consentement explicite).
RESCANNING re-vérifie la copie stagée consentie : résolu → READY, encore
bloquant → retour QUARANTINED. Le commit atomique ne part QUE de READY_TO_COMMIT.

## 2. Préconditions

- P-IMP-1 : tout import démarre en staging ISOLÉ et JETABLE — la cible n'est
  montée à AUCUN moment avant le commit atomique.
- P-IMP-2 : le scan est READ-ONLY et détecte les secrets PAR FORME (env-secret,
  private-key, provider-token, high-entropy) sans connaître les valeurs ; tout
  finding porte un aperçu REDIGÉ, jamais la valeur brute.
- P-IMP-3 (billing de sûreté) : le travail payant exige une RÉSERVATION
  idempotente AVANT démarrage (clé = importJobId), ajustement/compensation à la
  fin — aucun débit final sans commit (import-billing.ts, aligné P-LED-4 du
  BILLING_LEDGER_CONTRACT).

## 3. Invariants (nommés, testés)

- **I-IMP-1 (pas de suppression silencieuse)** : le scan ne modifie JAMAIS le
  contenu ; les findings sont PRÉSENTÉS et BLOQUANTS ; la redaction n'arrive
  qu'avec consentement explicite PAR FINDING. « Détecté et retiré avant
  écriture » est interdit — éditer le code de l'utilisateur sans consentement
  est une perte de données.
- **I-IMP-2 (staging jetable)** : la cible n'est touchée qu'au commit atomique
  final — ou pas du tout (cleanup sur cancel/timeout/échec) ; sur tout état
  non-commité terminal, la cible est intacte octet pour octet.
- **I-IMP-3 (commit atomique)** : COMMITTING ne part que de READY_TO_COMMIT ;
  commit intégral ou rollback intégral — aucun état partiellement importé
  observable.
- **I-IMP-4 (consentement tracé)** : chaque décision keep/redact est enregistrée
  (`consent` sur ImportJob) ; RESCANNING vérifie la copie consentie.

## 4. Tests négatifs (exigés, existants — branche #27)

- COMMITTING depuis SCANNING (saut d'état) → refusé ;
- payload PROPRE forcé en QUARANTINED → violation refusée ;
- findings bloquants → commit refusé sans AWAITING_USER_ACTION→RESCANNING ;
- annulation/timeout → cible intacte + staging nettoyé ;
- double réservation même importJobId → une seule (idempotence) ;
- débit sans commit → compensation, jamais de débit final.

## 5. Remix (fork sécurisé) — MERGÉ et en prod

```text
SNAPSHOT_PINNED → CREDENTIALS_DETACHED → SOURCE_SANITIZED → CLONING
  → DB_FORKING → STORAGE_POLICY_APPLIED → SCANNING → INDEXING → COMPLETED
```

- **I-RMX-1** : la VALEUR d'un secret n'entre JAMAIS dans le clone ;
  `assertRemixTransition` refuse CLONING avant CREDENTIALS_DETACHED
  (`REMIX_CLONE_BEFORE_DETACH`) ; la preuve CHERCHE le secret et échoue à le
  trouver ; survivant ⇒ quarantaine 409.
- **I-RMX-3 (licence + PII)** : licence/consentement VERSIONNÉS
  (licenseSnapshot sha256 + consentVersion immuables sur le job) ; PII masquées
  en SOURCE_SANITIZED sauf consentement auteur versionné ; **FAIL-CLOSED en
  prod (#25)** : non-remixable par défaut, licence explicite + confirmation
  droits + politique PII exigées, 403 sans licence même en profondeur.
- Storage : DETACH / CLONE / SHARE_WITH_CONSENT (gallery force DETACH).
- Voir V3_05_REMIX_AUDIT_20260720.md pour l'audit exigence par exigence
  (trous déclarés : logs/historique, attribution visible, preuve live prod).

## 6. Compatibilité

- ImportJob existant : champs `findings`/`consent`/`state` conservés — les
  nouveaux états sont un SUR-ENSEMBLE ; aucun job historique réel à migrer.
- 12 tuiles hub (`IMPORT_HUB_PROVIDERS`) inchangées + capacité GITLAB hors
  tuile (entrée structurée, P0-LS-04 signé).
- Connecteurs D4 (spreadsheet/bolt/lovable/base44/prev-agent prouvés, PR #18)
  consomment cette machine — pas de machine parallèle.

## 7. Résultat de signature

- v1 : REFUSED (RR-20260720-CODEX-01) — « 2 machines contradictoires ; le code
  + 15 tests prouvent encore l'ancienne (SCANNING→COMMITTING) ».
- v2 (ce document) : **PENDING_REVIEW** — UNE machine, code aligné (PR #27,
  e2e machine dédié) ; la partie Import N'EST PAS MERGÉE ; signature = merge +
  reçu de revue COMPLET. Rien d'auto-clôturé.
