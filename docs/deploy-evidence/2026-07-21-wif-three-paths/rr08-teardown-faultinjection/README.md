# RR-08 / RR-09 — teardown FAIL-CLOSED : injection de fautes sur la lecture d'état

## RR-08 — le point de départ
Refus **RR-20260723-CODEX-08** : `if gcloud projects describe … ; then … else "absent"`
traitait **tout** échec de `describe` comme « projet absent » → suppression sautée → une
panne réseau/API/auth/quota pouvait laisser le projet **actif**.

## RR-09 — le raffinement (état lu par STATUT HTTP STRUCTURÉ)
Refus **RR-20260723-CODEX-09** : la 1re correction concluait `NOTFOUND` sur le message
texte « not found **or permission denied** » dès que `gcloud auth print-access-token`
réussissait. Or **un jeton valide prouve l'authentification, pas l'autorisation
`projects.get`** : un principal authentifié mais sans droit de lecture sur un projet
**existant** reçoit ce même message → aurait été classé « absent » à tort.

Corrigé — `classify_project_state` interroge **Cloud Resource Manager v1 `projects.get`** et
classe sur le **code HTTP structuré**, jamais sur le texte :

| réponse CRM v1 | classification | delete tenté ? |
|---|---|---|
| `200` | `PRESENT:<lifecycleState>` | oui si != DELETE_REQUESTED |
| `404` **+ `error.status=NOT_FOUND`** | `NOTFOUND` (vrai absent) | non |
| `401` / `403` / `404` sans statut structuré | **`UNKNOWN`** (jamais « absent ») | **oui** |
| `000` / `408` / `429` / `5xx` | transitoire → retry borné → `UNKNOWN` | oui |

> Fait GCP vérifié live : `GET /v1/projects/<inexistant>` renvoie **HTTP 403 PERMISSION_DENIED**
> (pas 404) — donc l'ambiguïté 403 = « inexistant OU sans permission » reste **UNKNOWN**,
> et le `delete` est tenté puis le reçu échoue fail-closed si l'état final n'est pas confirmé.

**Reçu fail-closed** (`finalize_cleanup_receipt`) : `CLEANUP_RECEIPT=OK` **uniquement** si
l'état final est `DELETE_REQUESTED` ou un `NOT_FOUND` structuré (404) ; tout `UNKNOWN`/`ACTIVE`
⇒ `CLEANUP_RECEIPT=FAILED` + `exit != 0`.

## Test — `teardown-lib.spec.sh` (mocks `gcloud` + `curl`)
Sortie archivée `spec-output.txt` : **PASS=31 FAIL=0**. Scénarios :

| # | scénario | attendu | exigence |
|---|----------|---------|----------|
| 1 | `present_then_deleted` (200 ACTIVE→DELETE_REQUESTED) | delete, reçu OK | nominal |
| 2 | **`transient_persistent`** (curl `000` permanent) | delete **tenté quand même**, reçu **FAILED** | RR-08 ex.3/5 |
| 3 | `transient_then_recover` (000,000→200) | retry → delete → reçu OK | RR-08 ex.2 |
| 4 | `notfound_structured_404` (404+`status=NOT_FOUND`) | NOTFOUND, **pas** de delete, reçu OK | ex.1 |
| 5 | **`ambiguous_403`** (403 « not found or permission denied ») | **PAS NOTFOUND** → delete, reçu FAILED | **RR-09** |
| 6 | **`exists_no_getdelete`** (jeton VALIDE + projet EXISTANT, sans `projects.get` NI `projects.delete` : GET 403, delete 403) | **reçu FAILED (PAS OK)** | **RR-09 exigé** |
| 7 | `ambiguous_404_no_status` (404 corps HTML, pas de statut) | **PAS NOTFOUND** → reçu FAILED | RR-09 |
| 8 | `delete_fails_active` (200 ACTIVE, delete échoue) | reçu FAILED sur ACTIF | ex.4 |
| 9 | `auth_broken` (pas de jeton) | delete tenté, reçu FAILED | fail-closed |

`hashes.txt` : sha256 de `teardown-lib.sh` et `teardown-lib.spec.sh`.

## Reproduire
```bash
bash docs/deploy-evidence/2026-07-21-wif-three-paths/teardown-lib.spec.sh
```
Aucun accès cloud (mocks `gcloud`+`curl`, `WIF_CRM_BASE` pointé sur un hôte factice).
Retour non-zéro si une assertion échoue.
