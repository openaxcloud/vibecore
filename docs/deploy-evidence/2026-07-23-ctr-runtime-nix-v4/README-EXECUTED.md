# CTR-RUNTIME-NIX v4 — négatif live révocation EXÉCUTÉ (2026-07-23)

Exigence expert (« une commande prête à jouer n'est pas une preuve exécutée »).
Séquence RÉELLEMENT jouée en prod sur code intégré (merge #45 = `6d57a401`, api
image `6d57a401c9`, helm rev 896→898). Log brut : `live-revocation-EXECUTED.log`.

## Matrice de preuve (chaîne UI → control plane → runtime → réseau → URL)

| Étape | Action | Résultat OBSERVÉ |
|---|---|---|
| Écriture lock | `POST /projects/cmrma9wof/nix-lock` `{generation:gen-2,bundles:[python312]}` | **HTTP 201**, lock pinné `gen-2` + storePath/sha256 exacts du catalogue signé |
| **Publish #1** (gen-2 **ACTIVE**) | `POST /projects/…/deployments` provider=server | **READY** en ~62 s, URL **200**, metadata `storeGeneration=gen-2` |
| Révocation | `helm --set-file nixGenerations=<gen-2 REVOKED>` rev 897 + rollout api | configmap `NIX_STORE_GENERATIONS` : gen-2 **status REVOKED** |
| **Publish #2** (lock gen-2 **RÉVOQUÉE**) | même endpoint | **FAILED** en ~10 s ; erreur typée : `ecode.lock.json pins nix store generation "gen-2" is REVOKED (…) — refusing to use it` ; **URL → HTTP 410** `SERVER_DEPLOY_NOT_LIVE` (app NON servie, aucun repli vers l'active) |
| Restauration | `helm --set-file nixGenerations=<gen-2 ACTIVE>` rev 898 + rollout api | configmap gen-2 **status ACTIVE**, `revokedAt` **ABSENT** (vérifié kubectl) |
| **Publish #4** (gen-2 restaurée) | même endpoint | **READY**, URL **200** — restauration comportementale confirmée (le lock est de nouveau honoré) |

Note : Publish #3 (juste après restauration) a passé l'enforcement du lock
(build nix exécuté, image 168 MB construite) puis échoué sur un `fetch failed`
transitoire au start manager — PAS un refus de lock ; #4 (retry) READY le confirme.

## Refus TYPÉ capturé (le point 4 de l'expert)
```
Server deploy: failed (Server deploy: ecode.lock.json pins nix store generation
"gen-2" is REVOKED (2026-07-23T19:30:00Z: exercice expert: negatif live
revocation (CTR-RUNTIME-NIX point 4)) — refusing to use it).
```
Code : `ECODE_LOCK_GENERATION_REVOKED` (chemin `assertLockAgainstRegistry` →
`ECODE_LOCK_GENERATION_REVOKED`, surfacé au Publish). URL du deploy FAILED : 410.

## Artefacts (sha256 dans le log)
- `nix-lock-response.json` — le lock 201 pinné gen-2
- `publish1-deployment.json` — READY, metadata storeGeneration=gen-2
- `publish2-REVOKED-deployment.json` — FAILED, message REVOKED complet
- `live-revocation-EXECUTED.log` — trace horodatée bout en bout

## État prod final
helm rev **898 deployed**, gen-2 **ACTIVE**, `api.e-code.ai/health` **200**,
`e-code.ai` **200**. Session QA supprimée. Config de test NON laissée en prod.
