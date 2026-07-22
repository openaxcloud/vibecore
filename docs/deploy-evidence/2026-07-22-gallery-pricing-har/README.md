# P0-LS-13 — HAR liant mécaniquement Gallery ↔ Pricing (même session, mêmes cookies)

**evidenceId :** `docs/deploy-evidence/2026-07-22-gallery-pricing-har/`
**Branche :** `feat/gallery-pricing-har`

## Ce que le refus exigeait (REPONSE_EXPERT_PR40 §`P0-LS-13`)
Le DOM Pricing était accepté ; le seul point insuffisant était la **liaison
déclarative** : `network-trace-session.txt` *affirmait* que Gallery et Pricing
venaient de la même session sans le prouver. Correction minimale demandée : joindre
un **HAR / trace Playwright** contenant, **dans le même run** :
1. les **deux navigations dans un même contexte** ;
2. l'**identifiant de contexte / session** ;
3. les **cookies présents au moment de chaque capture** (en-têtes `Cookie`) ;
4. les **hashes des deux DOM** produits par ce même run.

## Artefacts (tous produits par UN SEUL run de `capture-har.mjs`)
| fichier | rôle |
|---|---|
| `gallery-pricing.har` | HAR Playwright unique (`mode: full`) — **les 2 navigations dans le même `log`** ; en-têtes complets `Cookie`/`Set-Cookie`. Corps omis (HAR léger) ; DOM committés à part. |
| `gallery-dom.html` | DOM de `replit.com/gallery` rendu dans ce run |
| `pricing-dom.html` | DOM de `replit.com/pricing` rendu dans ce run (plans Starter/Core/Teams/Enterprise, prix `$20`/`$100`/`$90` présents) |
| `context-manifest.json` | manifest reliant runId ↔ hashes DOM ↔ faits HAR ↔ cookies par page |
| `capture-har.mjs` | script de repro (exécutable de bout en bout) |

## Preuve de liaison (extraite du HAR réel, non déclarative)
Un seul `har.log` (creator **Playwright 1.59.1**, **303 entrées**) → **un seul contexte** :

- **Gallery — navigation 1** (`2026-07-22T12:45:52Z`), HTTP **200** :
  requête **sans** en-tête `Cookie` (session fraîche) ; réponse **`Set-Cookie: __cf_bm, _cfuvid`**.
- **Pricing — navigation 2** (`2026-07-22T12:46:12Z`, 20 s plus tard, **même `har.log`**), HTTP **200** :
  requête **avec en-tête `Cookie` (751 chars)** portant **`cf_clearance, _cfuvid, __cf_bm`**
  — c.-à-d. **les cookies établis pendant la visite Gallery**, renvoyés sur Pricing.

➡️ La liaison « même session + mêmes cookies » est **mécanique** : les cookies posés
par la réponse Gallery sont renvoyés dans la requête Pricing, au sein du **même HAR**.
Le contexte de session est identifié par `runId` (`context-manifest.json`) et par
l'accumulation de cookies de contexte (Gallery : `__cf_bm,_cfuvid,cf_clearance` →
Pricing : + `_dd_s,gating_id,replit_statsig_stable_id`).

**Liaison par hash de valeur** (`context-manifest.json` → `cookieLinkage`) : pour
`cf_clearance` et `_cfuvid`, le `sha256_12` de la valeur **posée pendant la session**
== celui **renvoyé sur Pricing** (`sameValueCarried: true`) → c'est bien *la même
valeur de cookie* qui voyage. (`__cf_bm` est un jeton court renouvelé par Cloudflare
entre les requêtes → `sameValueCarried: false`, honnêtement rapporté.)

> **Confidentialité** : les **valeurs** de cookies (jetons Cloudflare éphémères) sont
> **caviardées** dans le HAR committé — remplacées par `REDACTED(len=N,sha256_12=…)`
> (276 occurrences, 0 valeur en clair). Les **noms**, la **présence** des en-têtes et
> l'**égalité de hash** suffisent à la preuve ; aucun token de session n'est committé.

Hashes DOM de ce run (voir `context-manifest.json` pour les valeurs exactes du run
committé) : chaque `domSha256` == `sha256(fichier *-dom.html joint)`.

## Reproduire
```bash
# depuis un checkout du repo (Playwright + Chromium installés) :
node docs/deploy-evidence/2026-07-22-gallery-pricing-har/capture-har.mjs
# => réécrit gallery-pricing.har, gallery-dom.html, pricing-dom.html, context-manifest.json
# Vérifier la liaison directement dans le HAR :
node -e 'const h=JSON.parse(require("fs").readFileSync("docs/deploy-evidence/2026-07-22-gallery-pricing-har/gallery-pricing.har","utf8"));const E=h.log.entries;const p=E.find(e=>e.request.url==="https://replit.com/pricing");console.log("pricing Cookie:",(p.request.headers.find(x=>x.name.toLowerCase()==="cookie")||{}).value)'
```
Chaque run est une **session fraîche** → les valeurs de cookies et les hashes DOM
diffèrent, mais l'**invariant de liaison** (cookies posés par Gallery renvoyés par
Pricing dans le même contexte) est reproductible.

## Statut
`P0-LS-13` — **PROVEN_REVIEW_PENDING** : la réserve « liaison déclarative » est levée
par ce HAR. evidenceId repointé. Ne pas clôturer avant re-signature du relecteur.
