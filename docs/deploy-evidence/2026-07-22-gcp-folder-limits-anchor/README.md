# P0-V3-03 & P0-V4-3 — ancrage GCP autoritatif des limites folder-per-tenant

**evidenceId :** `docs/deploy-evidence/2026-07-22-gcp-folder-limits-anchor/`
**P0 couverts :** `P0-V3-03` et `P0-V4-3` (**quasi-doublons** — même claim « hiérarchie
folder-per-tenant morte : 300 enfants max, 0,1 folder/s » → ancrés ensemble = **dédup**).

## Refus levé
Les deux P0 étaient refusés car les tests **recopiaient les constantes `300` et `0,1`
sans source GCP autoritative** (« tests auto-référentiels »). Ce paquet **ancre**
ces constantes à la documentation Google Cloud officielle, verbatim, de façon rejouable.

## Source autoritative (publique, sans auth)
`https://docs.cloud.google.com/resource-manager/docs/limits` — *Resource Manager,
Limits and quotas*. HTML brut committé (`gcp-resource-manager-limits.html`,
sha256 `1d0780c1…`). Citations exactes vérifiées présentes :

| claim | citation verbatim | P0 |
|---|---|---|
| 300 enfants directs max | `cannot contain more than 300 folders` | V3-03, V4-3 |
| 0,1 création de folder / s | `Up to 0.1` (requests per second) | V3-03, V4-3 |
| 10 niveaux d'imbrication | `10 levels` | V3-03 |

## Reproduire
```bash
# vérifie contre le HTML committé (sans réseau) :
node docs/deploy-evidence/2026-07-22-gcp-folder-limits-anchor/anchor-gcp-limits.mjs --offline
# ou re-fetch la doc live et ré-assère les citations :
node docs/deploy-evidence/2026-07-22-gcp-folder-limits-anchor/anchor-gcp-limits.mjs
```
Le script **échoue** (exit 1) si une citation disparaît de la source → l'ancrage n'est
jamais silencieusement faux. `anchor.json` enregistre le sha256 du HTML + offsets.

## Statut
`P0-V3-03` et `P0-V4-3` → **PROVEN_REVIEW_PENDING** (constantes désormais ancrées à la
source GCP autoritative, dédupliquées). Ne pas clôturer sans re-signature.
