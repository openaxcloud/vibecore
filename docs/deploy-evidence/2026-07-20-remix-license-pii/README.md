# Preuve CI stack réelle — remix licencié + consentement + PII masquées (P0-V3-05 / RMX-3)

- **Run CI** : GitHub Actions `Production E2E` run **29747404378**
  (repo openaxcloud/vibecore, branche `feat/remix-license-pii`, commit `67f3b2cb`).
- **Verdict** : `✓ 29 [chromium] › tests/e2e/gallery-remix-license.spec.ts:75:1 …
  masks PII in the clone (7.3s)` — voir `ci-run-29747404378-gallery-lines.log`
  (extrait verbatim du log du run, rejouable via
  `gh run view 29747404378 -R openaxcloud/vibecore --log`).
- **Stack** : la CI locale complète — vraie API (:3001) + vrai Postgres,
  web app buildée en production (:5173), AUCUN mock sur le chemin testé.

## Ce que le test a prouvé à l'écran puis sur les artefacts produits

1. **Curation** (admin réel, gate MFA via la soupape officielle du harnais) :
   projet source avec PII (email + téléphone dans un CSV), snapshot immuable,
   listing publié avec licence **MIT** (texte + sha256 calculé serveur).
2. **À l'écran, anonyme** : le bloc licence est visible (`gallery-license-id`
   = MIT), la politique PII (« masked ») est affichée, le bouton Remix est
   **désactivé**.
3. **À l'écran, remixeur authentifié** (autre utilisateur) : le bouton reste
   désactivé jusqu'au cochage de la case de consentement ; après cochage,
   clic → **remix réel** → redirection vers l'IDE du clone.
4. **Sur le clone produit** (org du remixeur — son org ne contient QUE ce
   projet, preuve d'atterrissage) : export zip relu — l'email et le téléphone
   de la source sont **absents**, remplacés par `[PII:email masked on remix]`
   / `[PII:phone masked on remix]` ; l'adresse fixture RFC 2606
   (`support@example.com`) est conservée.
5. **Sur le job** (remix API du même listing) : `licenseSnapshot.licenseId` =
   MIT, `licenseTextSha256` = sha256 64-hex, `consentVersion` daté,
   `piiMaskedCount ≥ 2`.
6. **Négatif serveur** : le même POST sans `acceptLicense` → **400
   `REMIX_CONSENT_REQUIRED`** (le serveur est le point d'enforcement, pas l'UI).

## Limites (déclarées)

- Preuve sur la stack CI locale, PAS encore sur la prod : la preuve live prod
  (écran + artefacts hashés) suivra le merge + déploiement de la PR #21 —
  P0-V3-05 reste OPEN jusque-là.
- Les captures d'écran du test (attachées au rapport Playwright) ne sont
  conservées par la CI que pour les tests échoués ; les assertions ci-dessus
  sont machine-vérifiées dans le run référencé.
