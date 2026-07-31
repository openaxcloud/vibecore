# RR-08 — teardown FAIL-CLOSED : injection de fautes sur `gcloud projects describe`

Refus expert **RR-20260723-CODEX-08** (P0-A2-09) : dans `teardown()`, `if gcloud projects
describe … ; then … else "absent"` traitait **tout** échec de `describe` comme « projet
absent » → la suppression était sautée. Une panne réseau / API / auth / quota pouvait donc
laisser le projet **actif**. La preuve billing-fail précédente ne couvrait que le cas où
`describe` répond correctement.

## Corrections (dans `teardown-lib.sh`)
1. **Parse du motif d'erreur** — `classify_project_state` distingue :
   - `PRESENT:<state>` (describe OK) ;
   - `NOTFOUND` = motif not-found **ET** auth prouvée saine (`gcloud auth print-access-token`
     réussit) → seul cas où « rien à supprimer » est conclu ;
   - `UNKNOWN` = transitoire persistant / permission explicite / auth non prouvée.
2. **Retry** de `describe` sur erreurs transitoires (réseau/5xx/quota), borné.
3. **`gcloud projects delete` tenté MÊME si l'état est `UNKNOWN`** (illisible).
4. **Reçu fail-closed** — `finalize_cleanup_receipt` ré-classe l'état FINAL et n'émet
   `CLEANUP_RECEIPT=OK` que sur `DELETE_REQUESTED` ou `NOTFOUND` authentifié ; sinon
   `CLEANUP_RECEIPT=FAILED` + code retour non-zéro → `repro.sh` sort en erreur.

## Test (exigence 5) — `teardown-lib.spec.sh`
Un **faux `gcloud`** en tête de PATH simule chaque panne. Sortie archivée : `spec-output.txt`
(**PASS=23 FAIL=0**). Scénarios :

| # | scénario | attendu | vérifie |
|---|----------|---------|---------|
| 1 | `present_then_deleted` | delete → DELETE_REQUESTED, reçu OK | nominal |
| 2 | **`transient_persistent`** (erreur réseau à chaque `describe`) | **delete TENTÉ quand même**, reçu **FAILED** | **ex.3 + ex.5** |
| 3 | `transient_then_recover` (2 erreurs puis ACTIVE) | retry → delete → reçu OK | ex.2 |
| 4 | `notfound_auth` (not-found + auth saine) | NOTFOUND, **pas** de delete, reçu OK | ex.1 |
| 5 | `notfound_auth_broken` (not-found + auth KO) | **PAS** « absent » → delete tenté, reçu FAILED | ex.1 fail-closed |
| 6 | `perm_denied` (PERMISSION_DENIED explicite) | UNKNOWN → delete tenté, reçu FAILED | ex.1 |
| 7 | `delete_fails_active` (delete échoue, reste ACTIF) | reçu **FAILED** sur projet encore ACTIF | ex.4 |

`hashes.txt` : sha256 de `teardown-lib.sh` et `teardown-lib.spec.sh` (artefacts testés).

## Reproduire
```bash
bash docs/deploy-evidence/2026-07-21-wif-three-paths/teardown-lib.spec.sh
```
Aucun accès cloud requis (tout est mocké). Retour non-zéro si une assertion échoue.
