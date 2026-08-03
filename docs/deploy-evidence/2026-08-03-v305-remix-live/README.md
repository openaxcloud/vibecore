# P0-V3-05 — preuve LIVE PROD : licence + consentement appliqués, PII masquées sur un clone réel

**Date** : 2026-08-03 · **Cible** : `https://api.e-code.ai` (PROD, pas une stack CI)
**Image API prod** : `europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers/api:05319065be`
**Web prod** : `web:04288e8fa5` · **Migrations prod** : `0076_remix_license_pii` (2026-07-20T15:15:55Z), `0077_license_fail_closed` (2026-07-20T18:23:22Z), `rolled_back_at = null`

## 0. État du code — rien à merger, rien à déployer

Le lot RMX-3 était déjà **mergé** : PR **#21** (`feat/remix-license-pii`) et PR **#25**
(`feat/remix-license-failclosed`, migration 0077 + gates). La branche locale
`feat/remix-license-pii` est **périmée** : la version de `tests/e2e/gallery-remix-license.spec.ts`
sur `main` est un **sur-ensemble** strict de celle de la branche (elle porte en plus
`remixAllowed` / `rightsConfirmed` / `piiPolicyAccepted`). Le code tourne **déjà en prod**.

## 1. Fail-closed vérifié dans la base de prod

```
GalleryListing.remixAllowed : boolean, DEFAULT false, NOT NULL
15 listings publiés — 14 remixables (MIT, licenseTextSha256 épinglé), 1 NON remixable
```

`realtime-chat-starter` : `remixAllowed=false`, `licenseId=null` → cas de refus réel, pas un fixture.

## 2. Refus prouvés live (transcript : `live-prod-transcript.txt`, rejouable : `replay-negatives.sh`)

| Cas | Réponse prod | Code |
|---|---|---|
| A — l'auteur n'autorise pas le remix | `403` | `REMIX_NOT_ALLOWED` |
| B — listing MIT mais **sans consentement** | `400` | `REMIX_CONSENT_REQUIRED` (+ `license.textSha256`, `remixConsentVersion=2026-07-20.1`) |
| C — consentement mal typé (`"true"` chaîne) | `400` | `VALIDATION_ERROR` — le check est `!== true`, pas de coercition |

L'enforcement est **serveur** : ces appels sont des POST directs sur l'API, sans passer par l'UI.

## 3. Remix autorisé → clone réel sans la PII de la source

`POST /gallery/storefront/remix` avec `acceptLicense:true` → **201** (`remix-response.json`) :

```json
"state": "COMPLETED", "piiMaskedCount": 2, "scrubbedValueLines": 0,
"licenseSnapshot": { "licenseId": "MIT",
  "licenseTextSha256": "a53cee919b99cd52eb6fa22eac54154cd212a68253cee7a549417ff7ca8be1d1",
  "capturedAt": "2026-08-03T11:41:19.791Z" },
"consentVersion": "2026-07-20.1"
```

**Vérité terrain de la source** : `packages/template-catalog/src/apps/storefront.ts` contient
`4242 4242 4242 4242` dans `README.md` et `src/pages/CheckoutPage.tsx`.

**Le clone a été relu octet par octet** (`GET /projects/:id/export/zip` → zip base64 décodé,
31 fichiers, 97 296 octets de texte) puis **fouillé** (`pii-clone-scan.json`) :

> Le sha256 de l'archive **n'est pas stable** d'un export à l'autre (l'archive est régénérée à
> la demande) : `4435fc87…` au 1er export, `f4606408…` au rejeu. Ce sont les 3 invariants
> ci-dessous — pas le hash — qui portent la preuve. Rejeu : `scan-clone-for-pii.py`.

- `4242 4242 4242 4242` → **ABSENT** · `4242-4242-4242-4242` → **ABSENT** · `4242424242424242` → **ABSENT**
- après normalisation (suppression espaces/tirets, contre l'obfuscation) → **ABSENT**
- **aucune** séquence de 16 chiffres Luhn-valide nulle part dans le clone
- aux deux emplacements d'origine : `[PII:card masked on remix]`

**Non-vacuité** : le texte fouillé est non vide (97 296 o), les 2 marqueurs de masquage sont
présents, et `piiMaskedCount=2` renvoyé par l'API concorde avec les 2 marqueurs trouvés.
Une archive vide ou tronquée ne pourrait pas satisfaire ces trois conditions.

### 3bis. Scan résiduel du clone prod — ce qui reste dedans

Fouille indépendante du clone produit, toutes catégories confondues :

- emails survivants : **aucun** · téléphones format international : **aucun** · IP : `0.0.0.0` (adresse
  de bind du serveur, pas une donnée personnelle)

Autrement dit la source `storefront` ne portait **qu'une seule** catégorie de PII (`card`).
C'est pourquoi la preuve prod ci-dessus ne couvre que `card` : ce n'est pas une réserve de
prudence, c'est ce que la source contenait. Prouver `email`/`phone`/`iban` en prod supposerait
de **publier un listing porteur de PII dans la gallery publique** — non fait, en attente d'arbitrage.

## 4. Limites — à lire avant toute signature

Ce qui est prouvé ici est **plus étroit** que « le clone ne contient aucune PII » :

1. **Catégorie prouvée en prod : `card` uniquement.** Les matchers couvrent
   `email | phone | iban | card` (`remix-pipeline.ts:253`). Sur ce clone prod, seul `card`
   était présent dans la source. `email`/`phone` sont prouvés end-to-end sur la stack CI
   (`tests/e2e/gallery-remix-license.spec.ts:208-209`), `iban` seulement en mémoire/unitaire.
2. **Les NOMS de personnes ne sont pas masqués** — aucun matcher. Le clone produit par l'e2e
   CI contient encore `Jane Doe`. C'est la limite la plus importante à ne pas maquiller.
3. **Hors périmètre du masquage** : adresses IP, NIR/SSN/passeport, adresses postales, dates de
   naissance, téléphones au format national (sans `+`), **fichiers binaires**
   (`remix-pipeline.ts:337-339` les saute), **chemins de fichiers** (seul le `content` est réécrit).
4. **Le re-scan résiduel n'est pas indépendant** : `scanFilesForPii` utilise les **mêmes**
   `PII_MATCHERS` que `maskPiiInFiles`. Il ne peut détecter qu'une asymétrie entre les deux
   fonctions, jamais une catégorie de PII inconnue des matchers.
5. **`POST /projects/:projectId/remix` ne masque rien** (`sanitizePii: false`) — assumé
   « même org », mais `requireProject` accepte aussi un **collaborateur** projet non-membre.
6. **`piiConsentVersion` désactive tout le masquage** ; c'est une chaîne libre saisie par
   l'admin, rien ne vérifie que l'auteur a réellement consenti.
7. **Aucune vérification que la licence déclarée autorise réellement les œuvres dérivées** :
   `licenseId` est un `z.string().max(64)` libre, pas d'allowlist SPDX. Le système prouve
   « une licence explicite a été déclarée et acceptée », pas « cette licence accorde le droit de dériver ».
8. **`rightsConfirmed` / `piiPolicyAccepted` ne sont jamais persistés** (ni colonne, ni
   métadonnée d'audit) : la confirmation des droits par le curateur est **inauditable a posteriori**.
9. `Production E2E` ne se déclenche **pas** sur push `main` (PR / dispatch / `stable` seulement) :
   le test remix ne garde pas les pushes sur main.

## 4bis. État CI de la PR de preuve (#77)

15 checks verts, 4 skipped, **1 rouge : `Playwright local stack`** — et il faut être précis
sur ce que ça veut dire.

- **Le test qui porte la preuve est VERT** :
  `✓ 29 [chromium] › tests/e2e/gallery-remix-license.spec.ts:75:1 › gallery remix shows the
  versioned license, requires explicit consent, and masks PII in the clone`
  (run `30811026615`). C'est la preuve CI-stack (email + phone) qui complète la preuve prod (`card`).
- **Le rouge est PRÉ-EXISTANT et sans rapport** : 51 failed / 183 passed, sur `dashboard`,
  `mobile-device-matrix`, `public-homepage`, `platform-typography`, `preview-runtime`… Le même
  job est rouge sur les autres PR ouvertes (#76, #55). Cette PR est **docs-only** (8 fichiers,
  tous sous `docs/`) : elle ne peut pas changer le comportement applicatif.

Ce rouge n'est donc **pas** une régression de ce lot, mais il ne doit pas être maquillé : la
suite Playwright locale est globalement cassée sur le repo, et c'est un problème distinct à traiter.

## 5. Données créées en prod par cette preuve

- utilisateur QA `v305-proof-1785757269-21269@local.test` + org `cmsd5rrz601mn0n82bjsaa0xu`
- projet cloné `cmsd5rzst00n60n7d5pm8l5cu` (« V305 live proof clone »)

Aucun listing public n'a été créé : la preuve s'appuie sur les listings de prod **existants**.

## 6. Reste avant clôture

- Signature expert (le point reste **OPEN**).
- Décision produit sur les réserves 2/3/7/8 ci-dessus (masquage des noms, allowlist SPDX,
  persistance des confirmations).
- Textes juridiques à valider avant lancement public (`DEC-OWNER-REMIX-DEFAULT-LICENSE`).
- RMX-4/5 (fork DB physique + copie des objets) hors périmètre de ce point.
