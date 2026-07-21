# REVIEWER_RESUBMISSION_B_20260721 — resoumission POUR REVUE (lot B : les 6 re-refusés du reçu RR-20260720-CODEX-02)

Chaque point : TA nouvelle raison (verbatim du reçu -02), la correction v2, la
commande de repro. Statut : `PROVEN_REVIEW_PENDING` — CLOSED seulement via un
nouveau reçu COMPLET. Reviewer attendu : OpenAI-Codex.

## P0-V4-1
- **Ton refus v2** : « Le chemin canonique evidenceId reste …collector-gallery/ : son README annonce encore fad9ec75…, Views 20,650, 82 Results ; sa seule capture ne montre que le footer ; l'entrée P0 n'a pas été repointée. »
- **Correction** : le README porte une section CORRECTION 2026-07-21 : le hash a changé PAR L'ASSAINISSEMENT (caviardage CMS, fad9→1f5f, mêmes 1 499 556 octets) ; artefacts canoniques repointés (HTML complets, hashes rejoués) ; capture footer déclarée supplantée ; métriques réelles inscrites.
- **Repro** : `grep -n 'CORRECTION 2026-07-21' docs/deploy-evidence/2026-07-16-collector-gallery/README.md` ; `shasum -a 256 docs/parity/baseline/snapshots/2026-07-16/gallery.rendered.html` → 1f5f27bc…

## P0-V4-2
- **Ton refus v2** : « Le README canonique conserve 20,650 et 82 Results ; le contrat conserve aussi 82 Results et cite SRC-GALLERY-DETAIL, ID absent du registre. »
- **Correction** : README corrigé (cf. V4-1) ; contrat : « 82 Results » requalifié (absent du rendu conservé, non revendiqué) ; ID corrigé → `SRC-GALLERY-DETAIL-JOURNEY-MAPPER`.
- **Repro** : `grep -c '82 Results' docs/parity/GALLERY_COMMUNITY_CONTRACT.md` → seule l'occurrence « n'apparaît plus » ; `grep -n 'SRC-GALLERY-DETAIL-JOURNEY-MAPPER' docs/parity/GALLERY_COMMUNITY_CONTRACT.md`

## P0-V3-02
- **Ton refus v2** : « le report propre à une app n'est pas prouvé : l'artefact montre seulement le lien générique de footer Report abuse. »
- **Correction** : la ligne du contrat est REQUALIFIÉE : lien générique footer, report par app NON prouvé — plus aucune revendication au-delà de l'artefact.
- **Repro** : `grep -n 'Report abuse' docs/parity/GALLERY_COMMUNITY_CONTRACT.md`

## P0-LS-14
- **Ton refus v2** : « le claim affirme encore que Lite/Economy ne sont jamais nommés dans 83 changelogs — contredit par RPL-2026-002 et le snapshot 2026-04-17 ; et la commande annoncée comme vide retourne …:325 (“nulle part”). »
- **Correction** : l'affirmation fausse est RETIRÉE ; RPL-2026-004 distingue désormais sélecteur de MODÈLE BRUT (non observé, borné) vs sélecteur de MODE Lite/Economy/Power (EXISTE, documenté par RPL-2026-002) ; la ligne 325 du scan reformulée (« ne couvre pas encore »).
- **Repro** : `grep -rn 'nulle part' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml docs/parity/REPLIT_LIVE_SCAN_2026-07-20.md` → vide ; `grep -n 'MODÈLE BRUT' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml`

## P0-LS-13
- **Ton refus v2** : « 3 observations expert gardent locale/géo/cookies UNKNOWN sans hash ni artifactPath ; 4/13 seulement ont une géo connue ; recheck manuel sans capture ni preuve géo-IP ; le test négatif ne valide pas la complétude par observation. »
- **Correction** : plus de sur-revendication — TAXONOMIE explicite par observation : COMPLÈTE / `nonReplayable` justifié (3 lignes texte-relecteur, conservées pour l'historique) / `contextIncomplete` déclaré avec raison (scan 05:43, supplanté) ; **garde validateur PAR OBSERVATION** (incomplète sans justification → build rouge) ; preuve géo-IP commitée (`livescan-2026-07-20/geoip-proof-20260721.json`, sortie ipinfo complète, hash b325e31e…).
- **Repro** : `node scripts/parity/validate-registries.mjs` (garde LS-13 listée) ; retirer une raison → build rouge ; `shasum -a 256 docs/parity/livescan-2026-07-20/geoip-proof-20260721.json`

## P0-LS-16
- **Ton refus v2** : « le workflow ne roule pas CI_ATTESTATION et ne génère/publie pas après chaque merge ; le commit est manuel ; le validateur accepte des valeurs fictives. »
- **Correction** : job **`roll-attestation`** dans parity-registries.yml — à CHAQUE push sur main : écrit SON PROPRE run id/commit/timestamp (variables GitHub réelles), régénère TOUTES les vues (approval/parity/implementation/counter/manifest), valide, commit bot. Plus aucun commit manuel requis. **Anti-fictif** : le validateur exige que runCommit/mergedCommit EXISTENT dans l'historique git (`git cat-file -e`).
- **Repro** : lire le job dans `.github/workflows/parity-registries.yml` ; falsifier mergedCommit avec un sha inexistant → validateur rouge ; la PREUVE VIVANTE sera le premier commit bot après merge de cette PR.

---
Statuts : les 6 en `PROVEN_REVIEW_PENDING` (track QUICK). Rien de CLOSED sans
nouveau reçu complet.
