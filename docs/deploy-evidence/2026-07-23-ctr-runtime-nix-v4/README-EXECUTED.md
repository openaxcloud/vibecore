# CTR-RUNTIME-NIX v4 — négatif live révocation EXÉCUTÉ (2026-07-23)

Exigence expert (« une commande prête à jouer n'est pas une preuve exécutée »).
Séquence RÉELLEMENT jouée en prod sur code intégré (merge #45 = `6d57a401`, api
image `6d57a401c9`, helm rev 896→898). Log brut : `live-revocation-EXECUTED.txt`.

## Matrice de preuve (appels HTTP directs authentifiés → control plane → runtime → réseau → URL publique)

Surface exercée : appels HTTP directs à l'API publique (`api.e-code.ai`, session
authentifiée) — **pas la surface UI navigateur**. La chaîne prouvée s'arrête et
commence à l'API : lock via `POST /nix-lock`, publish via `POST /deployments`,
vérification à l'URL publique. Aucune revendication UI n'est faite.

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
- `live-revocation-EXECUTED.txt` — trace horodatée bout en bout

## État prod final
helm rev **898 deployed**, gen-2 **ACTIVE**, `api.e-code.ai/health` **200**,
`e-code.ai` **200**. Session QA supprimée. Config de test NON laissée en prod.

## Addendum RR-08 (2026-07-31) — capture du CODE TYPÉ + corrections

Les 3 incohérences RR-08, corrigées et rejouées (log brut horodaté :
`rr08-code-capture-EXECUTED.txt`) :

**1. Code typé.** Le catch du chemin publish réduisait l'erreur à `.message`
(le champ `code` était perdu avant persistance). Corrigé :
`describeEcodeLockFailure` (server-deploy-revision.ts) préserve le code, qui
mène désormais la ligne persistée (`Server deploy: ECODE_LOCK_GENERATION_REVOKED: …`) ;
test automatisé qui EXIGE ce code (server-deploy-revision.spec.ts, 3 tests).
**Rejeu live du 31/07** (gen-2 révoquée, helm rev 913, api live `d6da5d330a`) :
- `POST /nix-lock` sur gen-2 révoquée → **HTTP 409** dont le payload contient
  **littéralement** `"code":"ECODE_LOCK_GENERATION_REVOKED"`
  (`rr08-409-revoked-code.json`, sha256 `14e4c1f4…`) — artefact live avec le code.
- Publish → **FAILED** (comportement inchangé ; `rr08-publish-revoked-deployment.json`).
  **Sans sur-revendication** : sur l'image live (antérieure à ce fix) le log
  publish porte le message sans le code littéral ; le code y apparaîtra au
  déploiement de cette branche (le test automatisé le verrouille déjà).
- Restauration gen-2 ACTIVE (rev 914) **vérifiée** (configmap `revokedAt` ABSENT,
  `POST /nix-lock` → 201, health 200/200) ; session QA supprimée.

**2. Références.** Toutes les références `live-revocation-EXECUTED.log` → `.txt`
(le fichier réel committé).

**3. Surface.** La revendication « UI → control plane » est retirée : la preuve
a été exécutée par appels HTTP directs authentifiés à l'API publique
(`api.e-code.ai`) — control plane → runtime → réseau → URL publique. Aucune
surface UI navigateur n'a été utilisée, et rien ne le prétend.
