# D2 — Rollback par digest PERMANENT + fail-closed (approuvé par Avi le 2026-07-17)

Le flag `SERVER_DEPLOY_ROLLBACK_FROM_DIGEST=1` n'existait que via `kubectl set
env` sur le Deployment api → un `helm upgrade` pouvait le raser et le faux
rollback (ligne READY copiant l'URL, rien re-déployé) revenait en silence.
(Constat 2026-07-20 : le set env a survécu aux upgrades rev 868/869 par chance
de merge 3-way — la protection reste nécessaire, pas optionnelle.)

## Ce qui a été fait

| # | Exigence D2 | Implémentation |
|---|---|---|
| 1 | Flag dans values-prod + staging + schema Helm + test de rendu | `values.yaml` + `values-prod.yaml` (`serverDeployRollbackFromDigest: '1'`), configmap **inconditionnel** avec `default "1"`, **`values.schema.json`** (rejette toute valeur ≠ '0'/'1'), test de rendu `scripts/validate-helm-rollback-flag.mjs` (5 checks, dont simulation `--reuse-values` avec values legacy) — **bloquant dans deploy-main.yml avant l'upgrade** |
| 2 | Backfill `retainedDigest` quand l'artefact existe | `scripts/backfill-rollback-digests.mjs` + **exécuté en prod le 2026-07-17** (artefacts ci-joints) |
| 3 | 409 typé + `rollbackUnavailableReason`, zéro fallback URL-only | Chemin digest = **défaut** (env perdue ⇒ toujours digest) ; `=0` = kill switch explicite → **409 `SERVER_ROLLBACK_DIGEST_DISABLED`** (aucune ligne créée) ; fallback URL-only server **supprimé** ; listing + détail annotent `rollbackUnavailableReason: NO_RETAINED_DIGEST` |
| 4 | Canary + taux de 409 mesuré | Périmètre mesuré : 18 deploys server READY, 13 sans digest → backfill → **4 restants** (22 %) tous sans `imageUri` (ère pré-snapshot-image, artefact irrécupérable) — seuls 409 attendus, annoncés à l'UI via `rollbackUnavailableReason` |
| 5 | Alerte flag absent post-upgrade + test post-deploy auto | Étape CD « Verify rollback flag survived the upgrade » : configmap **live** + env d'un pod api **Running** ; échec ⇒ job rouge + Slack |

## Backfill prod (exécuté 2026-07-17, re-vérifié 2026-07-20)

- Avant : `{"totalServer":29,"ready":18,"readyNoDigest":13,"readyNoDigestWithUri":9}`
- Résolution AR : 9/9 tags retrouvés avec digest (`ar-digest-resolution.txt`)
- Application : 9/9 `BACKFILLED` — liste de candidats vide après, idempotence prouvée (`backfill-post-verification.txt`)
- Le backfill TIENT : re-mesuré 2026-07-20 → `{"ready":18,"withDigest":14}`

## Preuve live — FAITE le 2026-07-20, APRÈS le vrai helm upgrade (rev 870, CD run 29716607629)

Scénario exact exigé, rejoué post-upgrade (artefacts bruts dans ce dossier ;
tokens de compte jetable caviardés — repo public) :

| étape | fait |
|---|---|
| v1 | `cmrsrp6d0…` READY, digest `sha256:ea2ffd8a…`, sert « ROLLBACK-PROOF v1 » |
| v2 | `cmrsrq0u6…` READY, digest `sha256:a093a990…` (différent), sert « ROLLBACK-PROOF v2 » |
| delete révision v1 | `kubectl delete deploy app-cmrsrp6d0…` → URL v1 = HTTP **410** |
| rollback(v1) | NOUVEAU deployment `cmrsrr2ey…` READY, `rolledBackFromDigest == digest_v1` **YES**, body servi = **« ROLLBACK-PROOF v1 »** |
| négatif 1 | digest strippé en DB → **409 `ROLLBACK_NO_RETAINED_DIGEST`** (`13-negative-no-digest.json`) |
| négatif 2 | secretPolicy=PINNED sans snapshot → **409 `ROLLBACK_SECRET_POLICY_UNSATISFIABLE`** (`14-negative-secret-pinned.json`) |
| bonus | `rollbackUnavailableReason=NO_RETAINED_DIGEST` visible EN LIVE dans la liste, sur la bonne ligne uniquement (`15-live-annotation.txt`) |

Vérif post-upgrade du flag : configmap `1` + les 2 pods api Running `env=1`
(la 1ʳᵉ exécution de l'étape CD a false-alarmé sur une erreur transport exec
avalée — corrigé par retries, commit `59dfdec9`). Le flag a aussi survécu aux
upgrades 871 et 872 (schema + default + values).
