# P0-LS-13 — HAR fail-closed liant Gallery ↔ Pricing (même session, mêmes cookies)

> ⚠️ **Ce README est GÉNÉRÉ par `generate-readme.mjs` depuis `context-manifest.json`.**
> Ne pas éditer à la main — tous les nombres/hashes ci-dessous viennent de l'artefact final.

**evidenceId :** `docs/deploy-evidence/2026-07-22-gallery-pricing-har/`
**runId :** `6ae2116f-0a7a-4bd0-91c2-91283d159c79` · **contexte unique :** true · **navigateur :** chromium 147.0.7727.15

## HAR (source de vérité)
- fichier : `gallery-pricing.har` · **sha256 `bbf1facacfaca0cb2e15f4fa3f26f4fd5b52cf020c88f8df7189f237d9cb0505`**
- **entrées : 301** · mode `full` · corps embarqués : false
- valeurs de cookies caviardées : true

## Navigations (fail-closed : statut 200 + URL finale exacte exigés)
- **gallery** `https://replit.com/gallery` → HTTP **200** · URL finale `https://replit.com/gallery` · DOM `gallery-dom.html` sha256 `6d036cfc4d983d58cbc9f5c88f8dad80997485ea143d47e2443534f0a0c21829`
- **pricing** `https://replit.com/pricing` → HTTP **200** · URL finale `https://replit.com/pricing` · DOM `pricing-dom.html` sha256 `8933b6ef66e8fc5836a43082847fddee9776ca36301c699d5e08e14782773ead`

## Liaison cookie (fail-closed : 2 empreintes NON NULLES exigées)
Cookies **transportés** Gallery→Pricing (même valeur, empreintes non nulles) : `cf_clearance`, `_cfuvid`.
Non transportés (renouvelés / absents, honnête) : `__cf_bm`.
- `cf_clearance` : posé=a7de0d710da8 · renvoyé-pricing=a7de0d710da8 · **sameValueCarried=true**
- `__cf_bm` : posé=05ded9e28a5c · renvoyé-pricing=6384963f2e18 · **sameValueCarried=false**
- `_cfuvid` : posé=64bbc531847e · renvoyé-pricing=64bbc531847e · **sameValueCarried=true**

Total cookies transportés : **2** (≥1 exigé sinon la capture échoue).

## Rattachement aux observations tarifaires (`PRICE_OBSERVATION_REGISTRY`)
Observation-scan liée : `OBS-DELTA-20260720-13`.
**Évidencées par CETTE session** (montant présent dans le DOM pricing de ce run) : **7** —
`CORE 20 MONTHLY`, `CORE 18 ANNUAL_EFFECTIVE`, `CORE 20 ANNUAL_EFFECTIVE`, `PRO 100 MONTHLY`, `PRO 90 ANNUAL_EFFECTIVE`, `CORE 20 ANNUAL_EFFECTIVE`, `PRO 100 MONTHLY`.
**Non évidencées par cette session** (provenance propre conservée, honnête) : **6** —
`STARTER 0 MONTHLY`, `CORE 25 MONTHLY`, `PRO 95 ANNUAL_EFFECTIVE`, `ENTERPRISE null MONTHLY`, `CORE 25 MONTHLY`, `PRO 95 ANNUAL_EFFECTIVE`.

## Garanties fail-closed (correction expert V3)
- nav rejette non-200 : true · nav rejette URL inattendue : true
- liaison exige 2 empreintes non nulles : true

## Reproduire
```bash
node docs/deploy-evidence/2026-07-22-gallery-pricing-har/capture-har.mjs      # capture fail-closed
node docs/deploy-evidence/2026-07-22-gallery-pricing-har/generate-readme.mjs  # régénère CE README
node docs/deploy-evidence/2026-07-22-gallery-pricing-har/verify-har.mjs       # tests négatifs + cohérence
```

## Statut
**PROVEN_REVIEW_PENDING** — capture fail-closed, README/proof générés depuis le manifeste,
liaison exigeant 2 empreintes non nulles, session rattachée aux observations tarifaires.
Ne pas clôturer sans re-signature.
