# Découpage de la suite E2E — `Production E2E` vs `E2E Runtime`

**Date :** 2026-08-13
**Contexte :** `Production E2E` (`.github/workflows/e2e.yml`) n'avait **jamais été vert**.
Mesure sur l'historique complet du workflow :

```
gh api repos/openaxcloud/vibecore/actions/workflows/e2e.yml/runs --paginate
→ failure 288 | cancelled 117 | success 0     (405 runs depuis le 2026-05-17)
```

Le run de référence sur `main` @ `b2ee7c88` ([31676668326]) donnait **57 failed /
177 passed / 24 skipped**. Les 57 échecs étaient intégralement **hérités** : ils
apparaissaient à l'identique sur les PR en cours, qui n'en ajoutaient qu'**un
seul** supplémentaire.

[31676668326]: https://github.com/openaxcloud/vibecore/actions/runs/31676668326

## Pourquoi un découpage

Le stack monté par `e2e.yml` est : postgres + redis + mailpit (docker compose),
l'API en dev, l'app web buildée servie par `start:node`, l'app admin en dev.

Il n'y a **aucun runtime de workspace** : pas de pod, pas de dev server de
projet, pas d'iframe de preview servie. Constaté en montant le même stack en
local — l'IDE affiche :

```
"Error workspace | The project service is temporarily unavailable"
"Crashed runtime" · "Restart workspace"
```

Les tests qui exigent un workspace **running** ne peuvent donc pas passer dans ce
workflow, par construction. Les y laisser revenait à garder un rouge permanent
dans un gate bloquant — ce qui est exactement la raison pour laquelle le gate
n'a jamais pu servir.

## Mécanisme

Tag Playwright `@runtime` sur les tests concernés, et non un déplacement de
fichiers : les specs partagent leurs helpers, et un tag garde la couverture
lisible au même endroit.

| Workflow | Commande | Rôle |
|---|---|---|
| `Production E2E` (`e2e.yml`) | `playwright test tests/e2e --project=chromium --grep-invert @runtime` | **bloquant** |
| `E2E Runtime` (`e2e-runtime.yml`) | `playwright test tests/e2e --project=chromium --grep @runtime` | **non bloquant** (nightly + `workflow_dispatch`, `continue-on-error: true`) |

## Tests tagués `@runtime` (14)

| Spec | Tests | Dépendance |
|---|---|---|
| `critical-paths.spec.ts` | 1 | workspace running + iframe de preview |
| `preview-runtime.spec.ts` | 5 | workspace running + dev server booté |
| `mobile-device-matrix.spec.ts` | 5 (« nonblank preview ») | preview non blanche |
| `responsive-ide.spec.ts` | 3 (desktop Run / terminal) | bouton Run + panneau terminal issus du workspace |

Ce qui **reste dans le gate** pour ces mêmes specs : toute la couverture
responsive/layout (les 7 profils `adapts to …` de la matrice mobile, les
assertions de shell compacte, la palette d'outils), c'est-à-dire ce que
`Production E2E` peut réellement vérifier.

## Ce que ce découpage n'est PAS

Ce n'est pas un waiver : aucun test n'est ignoré ni supprimé. Les 14 tests
tournent tous les jours et publient leurs traces. Ce qui change, c'est qu'ils ne
bloquent plus un gate qu'ils ne peuvent pas satisfaire.

## Remise en position bloquante

Condition : provisionner un runtime de workspace dans la CI. Le code a un chemin
local (`WORKSPACE_DEFAULT_RUNTIME_MODE ?? 'docker'`,
`WORKSPACE_LOCAL_RUNTIME_ROOT ?? '.vibecore/local-runtime'`) mais il n'est pas
exercé par le stack e2e — pendant l'ouverture de l'IDE, le log de l'API ne
montre **aucun** appel de provisioning. Le diagnostic de cause racine reste à
faire.

Estimation : **3–5 j** d'ingénierie, plus une dégradation de la durée du gate
(un conteneur par workspace × ~14 tests, sur les 29 min actuelles). À faire, mais
pas au prix de garder le gate rouge en attendant.
