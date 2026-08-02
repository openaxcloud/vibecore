# P0-LS-03 — couverture de hash complète du paquet livescan (21 fichiers de liens)

**evidenceId :** `docs/deploy-evidence/2026-07-22-livescan-hashes/`
**Cible :** `docs/parity/livescan-2026-07-20/`

## Refus levé
`manifest.json` hashait `screenshot` (png) et `visibleText` (txt) par page mais
laissait **les 21 fichiers `*.links.txt` non hashés** (refus expert : « 69 éléments au
total et 21 fichiers de liens non hashés »).

## Correction
`hash-index.json` couvre **les 71 fichiers** du paquet (sha256 + bytes + kind) :
- **21 `links`** (`*.links.txt`) — désormais hashés ;
- 21 `screenshot` (png), 24 `text` (txt), 4 `doc` (md), 1 `manifest` (json).

`verify-livescan-hashes.mjs --check` **recalcule** tous les hashes et **échoue** (exit 1)
sur toute dérive ou tout fichier non couvert → la couverture n'est jamais silencieusement
incomplète.

```bash
node docs/deploy-evidence/2026-07-22-livescan-hashes/verify-livescan-hashes.mjs --check
```

## Statut
`P0-LS-03` → **PROVEN_REVIEW_PENDING** (les 21 fichiers de liens sont hashés ; couverture
complète vérifiable). Ne pas clôturer sans re-signature.
