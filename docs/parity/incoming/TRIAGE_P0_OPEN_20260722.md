# Triage des 30 P0 `status: OPEN` — 2026-07-22

Classement demandé : **faisable-sans-Avi** (scan authentifié léger / ancrage de claim /
dédup — documentation, registres, schémas, hachage) vs **bloqué** (dépend d'un chantier
d'implémentation, d'un déploiement ou de GCP nommé). Standard : rien de « prouvé » sans
repro exécutable + artefacts hashés + checks verts.

État de départ (registre P0) : 65 P0 → **30 OPEN**, 28 PROVEN_REVIEW_PENDING, 5 PROVEN, 2 CLOSED.

## A. PROUVÉS CE SESSION → PROVEN_REVIEW_PENDING (4)
Preuve rejouable + artefacts hashés committés, checks verts, pas de merge sans re-signature.

| P0 | technique | evidence |
|---|---|---|
| **P0-LS-13** | HAR Playwright liant Gallery↔Pricing (même contexte, cookies renvoyés, hashes DOM) | `docs/deploy-evidence/2026-07-22-gallery-pricing-har/` |
| **P0-V3-03** | ancrage GCP autoritatif (300 enfants, 0,1 folder/s) | `docs/deploy-evidence/2026-07-22-gcp-folder-limits-anchor/` |
| **P0-V4-3** | *idem* — **dédupliqué** avec V3-03 (même claim folder-per-tenant) | *(même artefact)* |
| **P0-LS-03** | couverture de hash complète du paquet livescan (21 `*.links.txt` hashés) | `docs/deploy-evidence/2026-07-22-livescan-hashes/` |

## B. BLOQUÉS sur dépendance nommée (13) — chantier d'implémentation / déploiement / GCP
Ne peuvent pas être « prouvés » par documentation seule ; dépendent d'un chantier
identifié (souvent déjà en PR d'une autre session, non mergée).

| P0 | dépendance nommée | note |
|---|---|---|
| P0-V3-01 | `UNK-COLLECTOR-CI-RENDER` | run CI collecteur rendu-JS (chromium) — chantier collecteur (PR #14) |
| P0-V3-04 | `UNK-CLOUDTENANT-IMPL` | machines transfert/merge/split/suspension CloudTenant |
| P0-V3-05 | clone réel + masking PII runtime | exige un workspace réel (Remix), pas doc seule |
| P0-V3-06 | `UNK-BILLING-MINIMAL-IMPL` | débit crédits réel + lots connecteurs D4 |
| P0-V3-07 | `UNK-AR-LIVE-PROMOTION` | promotion AR réelle + referrers + deploy — **GCP** (PR #20) |
| P0-V3-08 | `UNK-ROLLBACK-FLAG-APPLIED` | rollback rejouable — déploiement |
| P0-V3-09 | `UNK-CHECKPOINT-IMPL` | niveau transaction-consistent — chantier |
| P0-V3-10 | `UNK-NIX-MULTIZONE-IMPL` | rotation/révocation/provenance Nix — chantier (PR #45) |
| P0-V3-11 | `UNK-DB-MIGRATION-PUBLISH-IMPL` | `DBMigrationExecution` + protocole publish PROD |
| P0-V3-12 | `UNK-BILLING-MINIMAL-IMPL` | grand livre double-entrée — chantier (PR #28, déjà PROVEN_REVIEW_PENDING via resolutionStatus) |
| P0-A2-09 | chantier WIF | 3 chemins zéro-clé — **PR #46 PROVEN_REVIEW_PENDING** (autre session en cours) |
| P0-EX-04 | chantier Import state machine | PR #27, `resolutionStatus: ADDRESSED_PENDING_REREVIEW` |
| P0-EX-07 | chantier Identité/collaboration | entité Guest + enforcement — PRs #32/#34/#35 |

## C. FAISABLES SANS AVI, non encore traités (13) — file de travail claim-anchoring/schéma/dédup
Réalisables par documentation/registre/schéma/scan léger **sans** GCP ni Avi ; à prouver
avec repro + hash comme la section A. Technique proposée par item :

| P0 | technique faisable |
|---|---|
| P0-A2-01 | provenance par fichier + signature du DOCUMENT_MANIFEST (générateur existant à durcir) |
| P0-A2-03 | écrire le schéma complet `Project → Artifacts` (au-delà de `ArtifactKind`) |
| P0-A2-05 | corriger l'incohérence de gate (`sourceBaselineReady=false` vs `registryUniverseReady=true`) — logique de registre |
| P0-A2-07 | durcir le gate `architectureContracted` (valider schémas/références/tests, pas juste présence) |
| P0-A2-13 | champs de provenance + attestation sur le bon commit + `generatedAt` cohérent |
| P0-A2-14 | contrat Cloud Run multi-tenant + seuils nommés (ancrables aux limites GCP Cloud Run) |
| P0-V3-13 | contrat WCAG 2.2 AA + schémaVersion des surfaces (accessibilité) |
| P0-LS-06 | valider/réparer les liens cassés-non-sémantiques + reclasser (dédup) |
| P0-EX-02 | ancrer `generate-implementation-status.mjs` (existe déjà ; refus « aucun générateur » vraisemblablement périmé) |
| P0-EX-05 | distinguer « apps supplémentaires » vs « types d'Artifact » dans l'artefact d'entitlements |
| P0-EX-08 | durcir le schéma `ProjectManifest` (rejeter 2 artefacts mobile / manifeste minimal) |
| P0-EX-10 | câbler la CI pour **générer+écrire** le statut (pas seulement `--check`) |
| P0-B-01 | overlay `builtState`/`codeRefs` sur les 159 candidats (scan grep du code) |

> `P0-B-02` (« scan authentifié des UNK-LS ») est **partiellement bloqué** : le scan LIVE
> authentifié de Replit bute sur Cloudflare (403 au signup) ; la partie pages publiques
> est faisable (cf. HAR LS-13), la partie authentifiée dépend d'un accès de compte.

## Récapitulatif chiffré
Sur les **30 `status: OPEN`** de départ :
- **3 flippés OPEN → PROVEN_REVIEW_PENDING ce session** : **P0-V3-03**, **P0-V4-3**
  (dédupliqués, un seul artefact), **P0-LS-03**. (Section A.)
- **13 bloqués** sur dépendance nommée (chantier/déploiement/GCP) — Section B.
- **14 faisables-sans-Avi restants** — Section C (13 items + `P0-B-02` à réserve auth).
- Vérification : 3 + 13 + 14 = **30**. ✓

En plus (hors 30 OPEN car déjà `PROVEN_REVIEW_PENDING`) : **P0-LS-13** reçoit le HAR
explicitement exigé par l'expert (§P0-LS-13), evidenceId repointé.

État registre après ce session : **OPEN 30 → 27**, **PROVEN_REVIEW_PENDING 28 → 31**.
Tous les flips sont adossés à une preuve rejouable + artefacts hashés (Section A) ;
aucun n'est clôturé (pas de merge/CLOSED sans re-signature).

*Actualisé si de nouvelles preuves sont produites (Section C = file de travail).*
