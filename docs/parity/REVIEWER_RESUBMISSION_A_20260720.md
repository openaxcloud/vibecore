# REVIEWER_RESUBMISSION_A_20260720 — resoumission POUR REVUE (pas clôture)

Remplace REVIEWER_PACKET_RESUBMIT_LOTA_20260720.md (conservé pour l'historique).
Commit des remédiations : `af24d4fe` (main). Reçu attendu : un NOUVEAU
ReviewReceipt (voir REVIEW_RECEIPT_REGISTRY.yaml — modèle RR-20260720-CODEX-01).
Règle maîtresse : chaque point est `PROVEN_REVIEW_PENDING` — il ne passera
CLOSED qu'après re-signature dans un reçu COMPLET. Reviewer attendu : OpenAI-Codex.

Sorties validateurs au moment de la resoumission (rejouables) :
`node scripts/parity/validate-registries.mjs` → `all registries valid` ;
`node scripts/parity/check-plan-completeness.mjs` → `336 … CERTIFIÉ`.

---

## P0-V4-1
- **Ancien refus (verbatim)** : « hash Gallery obsolète (fad9… vs 1f5f…), capture limitée au footer, artefact incohérent. »
- **Correction** : SRC-GALLERY-RENDERED re-pointé sur le hash RÉEL du fichier commité (`1f5f27bcf877…`, rendu complet 1,5 Mo) ; accessedAt corrigé (16:58:20Z).
- **Commit** : af24d4fe · **Fichiers** : SOURCE_REGISTRY.yaml, GALLERY_COMMUNITY_CONTRACT.md, P0_REGISTRY.yaml
- **Repro** : `shasum -a 256 docs/parity/baseline/snapshots/2026-07-16/gallery.rendered.html` → `1f5f27bc…` ; `grep -rn fad9ec75 docs/parity --include='*.yaml' --include='*.md' | grep -v refusal` → vide
- **Avant/après** : hash déclaré fad9ec75 (fichier réel ≠) → hash déclaré = hash du fichier (shasum rejoué)
- **Test négatif associé** : SOURCE_REGISTRY exige `sha256:<64hex>` + snapshot présent sur disque (validateur, cassant)
- **evidenceId** : docs/parity/baseline/snapshots/2026-07-16/gallery.rendered.html
- **Statut** : PROVEN_REVIEW_PENDING (remediationTrack QUICK)

## P0-V4-2
- **Ancien refus** : « même hash obsolète, métriques réelles 20 653/20 649 pas 20 650. »
- **Correction** : claim RPL-17 + tableau du contrat réécrits aux valeurs RÉELLES : « 20,653 » (liste) / « 20,649 » + « Used 79 times » (détail) — compteurs vivants, divergence inter-pages documentée ; « 82 Results » retiré (absent du rendu).
- **Commit** : af24d4fe · **Fichiers** : PUBLIC_BASELINE_REPLIT_2026.yaml, GALLERY_COMMUNITY_CONTRACT.md, P0_REGISTRY.yaml
- **Repro** : `grep -o '20,65[0-9]' docs/parity/baseline/snapshots/2026-07-16/gallery.rendered.html | sort -u` → 20,653 ; `grep -o '20,649' docs/parity/baseline/snapshots/2026-07-16/gallery-detail-journey-mapper.rendered.html` ; `grep -c '20,650' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml` → 0
- **Avant/après** : « Views 20,650 » (périmé) → 20,653/20,649 (artefact)
- **Test négatif** : les claims sont ancrés à des sources hashées (unanchoredClaims=0, gate sourceBaselineReady)
- **evidenceId** : mêmes artefacts que V4-1 + gallery-detail (sha 885a7c37…)
- **Statut** : PROVEN_REVIEW_PENDING (QUICK)

## P0-V3-02
- **Ancien refus** : « hash et métriques Gallery ≠ valeurs annoncées. »
- **Correction** : même racine que V4-1/V4-2 — proof du P0 recadré sur hash rejoué + métriques réelles.
- **Commit/Fichiers/Repro/evidence** : identiques V4-1 + V4-2.
- **Statut** : PROVEN_REVIEW_PENDING (QUICK)

## P0-LS-14
- **Ancien refus** : « claim absolu “no model selector anywhere” subsiste. »
- **Correction** : RPL-2026-004 reformulé en observation BORNÉE (corpus + dates explicites) ; formulation absolue purgée aussi du scan live.
- **Commit** : af24d4fe · **Fichiers** : PUBLIC_BASELINE_REPLIT_2026.yaml, REPLIT_LIVE_SCAN_2026-07-20.md, P0_REGISTRY.yaml
- **Repro** : `grep -rn 'anywhere in the product\|nulle part' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml docs/parity/REPLIT_LIVE_SCAN_2026-07-20.md` → vide
- **Avant/après** : « No model selector exists anywhere in the product » → « AUCUN sélecteur observé dans le CORPUS EXAMINÉ (…) — observation BORNÉE »
- **Test négatif** : n/a (reformulation) — le validateur exige toujours l'ancrage source du claim
- **evidenceId** : docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml (claim RPL-2026-004)
- **Statut** : PROVEN_REVIEW_PENDING (QUICK)

## P0-A2-10
- **Ancien refus** : « décision Gallery réellement DECIDED, pas OPEN/CAPTURE_INCOMPLETE. »
- **Correction** : DEC-GALLERY-NO-SELF-PUBLISH → `status: DECIDED` (comportement construit et testé : curation admin seule, tests « non self-service »).
- **Commit** : af24d4fe · **Fichiers** : DECISION_REGISTRY.yaml, P0_REGISTRY.yaml
- **Repro** : `grep -A8 'DEC-GALLERY-NO-SELF-PUBLISH' docs/parity/DECISION_REGISTRY.yaml | grep status` → DECIDED
- **Avant/après** : OPEN → DECIDED
- **Test négatif** : tests API `gallery-routes.spec.ts` (« is NOT self-service — a non-admin user cannot create a listing »)
- **evidenceId** : services/api/src/tests/gallery-routes.spec.ts
- **Statut** : PROVEN_REVIEW_PENDING (QUICK)

## P0-LS-04
- **Ancien refus** : « simple note d'en-tête, aucune entrée GitLab structurée. »
- **Correction** : entrée STRUCTURÉE `nonTileCapabilities` (kind/hubTileVisible/capabilityStatus/evidence/ecodeBuiltState/unknowns) + garde validateur CASSANTE ; les 12 tuiles intactes, GITLAB toujours interdit en tuile.
- **Commit** : af24d4fe · **Fichiers** : IMPORT_PROVIDER_REGISTRY.yaml, validate-registries.mjs, P0_REGISTRY.yaml
- **Repro** : `grep -A9 nonTileCapabilities docs/parity/IMPORT_PROVIDER_REGISTRY.yaml` ; `node scripts/parity/validate-registries.mjs` → vert
- **Test négatif (rejoué)** : retirer le champ `kind` → validateur ROUGE (« champ kind manquant (P0-LS-04) »)
- **Avant/après** : commentaire d'en-tête → entrée machine cassante
- **evidenceId** : docs/parity/IMPORT_PROVIDER_REGISTRY.yaml
- **Statut** : PROVEN_REVIEW_PENDING (QUICK)

## P0-LS-13
- **Ancien refus** : « prix $25/$20 et $95 sans geo/locale/cohorte ni hash. »
- **Correction** : 13 observations TOUTES contextualisées (geo/locale/cohorte/hash/artifactPath). Divergence $20-vs-$25 RÉSOLUE par re-observation live 14:45Z (géo-IP IL, session anonyme) : $25/$20 (Core) et $100/$95 (Pro) affichés — le scan 05:43 ($20/$18/$90) captait une version antérieure LE MÊME JOUR. Les deux captures conservées.
- **Commit** : af24d4fe · **Fichiers** : PRICE_OBSERVATION_REGISTRY.yaml, livescan-2026-07-20/pricing-recheck-1445utc.txt (nouvel artefact)
- **Repro** : `shasum -a 256 docs/parity/livescan-2026-07-20/pricing-recheck-1445utc.txt` → 9352b15f… ; `shasum -a 256 docs/parity/livescan-2026-07-20/pricing.png` → 0dea38e8… ; `grep -c countryOrGeo docs/parity/PRICE_OBSERVATION_REGISTRY.yaml` → 13
- **Avant/après** : 3 lignes « révision expert » sans contexte → provenance explicite + confirmation par observation géolocalisée hashée
- **Test négatif** : registre dans SEPARATE_REGISTRY_FILES (présence+schemaVersion cassantes)
- **evidenceId** : docs/parity/livescan-2026-07-20/pricing-recheck-1445utc.txt (+ pricing.png)
- **Statut** : PROVEN_REVIEW_PENDING (QUICK)

## P0-LS-16
- **Ancien refus** : « manifeste sans generatedAt/generatedFromCommit/mergedCommit, annexe absente, timestamp constant. »
- **Correction** : DOCUMENT_MANIFEST porte `generatedAt` (mergedToMainAt RÉEL de l'attestation), `generatedFromCommit`, `mergedCommit` — dérivés de CI_ATTESTATION roulée à chaque merge (recalcul post-merge garanti, non auto-référentiel). Vérifié en conditions réelles : generatedAt a suivi tout seul les merges #23 (14:34:22Z → 15:39:32Z).
- **Commit** : af24d4fe (générateur) + a4a9f71c (recalcul post-merge observé) · **Fichiers** : generate-document-manifest.mjs, DOCUMENT_MANIFEST.yaml
- **Repro** : `head -10 docs/parity/DOCUMENT_MANIFEST.yaml | grep -E 'generatedAt|generatedFromCommit|mergedCommit'` ; `node scripts/parity/generate-document-manifest.mjs --check` → up to date
- **Test négatif** : éditer le manifeste à la main → drift-check ROUGE (validateur §12)
- **evidenceId** : docs/parity/DOCUMENT_MANIFEST.yaml (en-tête)
- **Statut** : PROVEN_REVIEW_PENDING (QUICK)

---

**Ce qui est attendu du relecteur** : rejouer les commandes, rendre un verdict
par ID, et — pour toute acceptation — un NOUVEAU reçu complet (réponse brute
fournie et hashée). Aucun point ne sera CLOSED sans cela.
