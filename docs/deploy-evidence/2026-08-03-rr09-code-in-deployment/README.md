# RR-09 — code typé ECODE_LOCK_GENERATION_REVOKED dans le STATUT du DEPLOYMENT (image corrigée)

Exigence RR-09 : la preuve du code typé doit venir d'un **publish exécuté sur l'image
CORRIGÉE déployée** (le contrat #57 mergé + CD), pas du 409 de `/nix-lock`.

- Merge #57 = `05319065` ; **image api déployée `05319065be`** ; `describeEcodeLockFailure`
  présent dans `/runtime/dist/app.js` (vérifié). Log brut : `rr09-EXECUTED.txt`.

## Séquence exécutée (2026-08-03, prod)

| Étape | Action | Résultat OBSERVÉ |
|---|---|---|
| Lock | `POST /projects/cmrma9wof/nix-lock` gen-2 | **201** |
| **Publish #1** (gen-2 **ACTIVE**) | `POST /deployments` provider=server | **READY**, URL **200** |
| Révocation | `helm --set-file <gen-2 REVOKED>` rev 927 + rollout | configmap gen-2 **REVOKED** |
| **Publish #2** (lock gen-2 révoquée) | même endpoint | **FAILED** ; le **log error du DEPLOYMENT** contient LITTÉRALEMENT `ECODE_LOCK_GENERATION_REVOKED` ; **URL → 410** `SERVER_DEPLOY_NOT_LIVE` |
| Restauration | `helm --set-file <gen-2 ACTIVE>` rev 928 | **VÉRIFIÉ** : gen-2 ACTIVE, `revokedAt` ABSENT |
| **Publish #3** (gen-2 restaurée) | même endpoint | **READY**, URL **200** |

## Ligne exacte persistée dans le DEPLOYMENT (publish #2)
```
Server deploy: failed (Server deploy: ECODE_LOCK_GENERATION_REVOKED: ecode.lock.json
pins nix store generation "gen-2" is REVOKED (2026-08-03T06:45:00Z: RR-09: rejeu live
sur image corrigee, code type dans le statut du deployment publish) — refusing to use it).
```
→ le code typé **mène** la ligne (contraste avec RR-08 où le message perdait `.code`).
Artefact : `rr09-publish2-REVOKED-deployment.json` (sha256 `2f2c065f…`).

## État prod final (prod-safe)
helm rev **928 deployed** ; registre déployé **identique à main** (`values-prod.yaml`,
gen-2 ACTIVE, doc canonique égal — vérifié) ; `api.e-code.ai/health` **200**,
`e-code.ai` **200** ; session QA supprimée. Aucune dérive de test laissée.
