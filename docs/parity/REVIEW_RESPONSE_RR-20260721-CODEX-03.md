# Réponse brute de revue — RR-20260721-CODEX-03 (resoumission B)

schemaVersion: 1
reviewReceiptId: RR-20260721-CODEX-03
reviewer: OpenAI-Codex
reviewerType: AUTOMATED_LLM
reviewerModelVersion: GPT-5 (Codex)
auditedCommit: 70eb30a0 (tête de la branche docs/remediation-lot-b au moment de la revue)
transmittedBy: Avi (canal de pilotage, 2026-07-21)

## Verdict

- ACCEPTÉ ET SIGNÉ : P0-LS-14 (patch reviewer fourni : reviewer UNKNOWN → OpenAI-Codex).
- REFUSÉS : P0-V4-1, P0-V4-2, P0-V3-02, P0-LS-13, P0-LS-16.
- La revue NE COUVRE PAS la PR #29 (contrats) ni les PR facturation #27/#28.
- Refus explicite du « ok docs » sur #30 en l'état.

## Raisons verbatim des refus

### P0-V4-1
evidenceId pointe toujours le dossier historique
docs/deploy-evidence/2026-07-16-collector-gallery/ avec ancien hash fad9…,
Views 20,650, 82 Results, capture footer-only → le paquet n'est ni régénéré ni
repointé.

### P0-V4-2
gallery.rendered.html contient TOUJOURS « 82 Results » (DOM « 82 Result s »)
et Views 20,653 → la correction est contredite par l'artefact ; anciennes
valeurs encore dans le README.

### P0-V3-02
la condition exige une preuve de report au niveau app ; l'archive ne montre que
le footer générique → requalifier ≠ prouver.

### P0-LS-13
4/13 obs complètes seulement ; recheck 14:45 = texte à heure approximative,
pas une capture liant prix+locale+cookies+géo ; la garde ne recalcule pas le
SHA-256 des artefacts.

### P0-LS-16
job roll-attestation skippé sur la PR, aucun commit bot post-merge ; le filtre
push.paths exclut les push code-only → pas « à chaque push » ; le contrôle
anti-fictif ne lie pas runId/URL/date/conclusion à une vraie exécution GitHub
Actions.
