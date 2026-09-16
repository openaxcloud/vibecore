---
id: BUG-CI-008
---

## Bug

**P2 — les jobs Playwright échouent avant tout test parce que leurs services d'infra ne démarrent pas.** `Playwright desktop-1440` : `Error: P1001: Can't reach database server at 127.0.0.1:55432`. `Playwright mobile-390` : `Timed out waiting for ${service} on ${host}:${port}`, même famille. Dans les deux cas l'échec survient **pendant la mise en place**, avant l'exécution du moindre test — d'où `No files were found with the provided path: test-results. No artifacts will be uploaded`, qui rend le diagnostic aveugle côté artefacts. Reproduit sur **plusieurs runs consécutifs** et sur **deux tailles d'écran distinctes** : ce n'est pas une flake isolée mais une fragilité du démarrage des conteneurs de service. Conséquence : la couverture Playwright — précisément celle qui validerait le responsive et les parcours IDE — **n'apporte aucun signal**, ni vert ni rouge, et masque d'éventuelles régressions réelles.

## 📤 Dispatché

☐

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

PR #138. Jobs relevés : `Playwright desktop-1440` (`P1001` sur `127.0.0.1:55432`) et `Playwright mobile-390` (timeout d'attente de service). Sans rapport avec le lot QA de la branche : l'échec précède l'exécution des tests et la branche ne touche ni la configuration Playwright, ni les services CI. ⚠️ **Lot infra CI — consigné seulement.** **RÉCIDIVE MESURÉE LE 09/09 À 17:35** : le run E2E 1828 (`dcfb310`) a duré **49 secondes** et rendu `No files were found with the provided path: playwright-report` — aucun test n'a tourné. Il a REFUSÉ le déploiement 1581. Ce n'est pas le code : E2E était VERT sur `36d0610` une heure plus tôt, et `dcfb310` n'ajoute qu'un fichier `.md` par-dessus. ⚠️ **Je n'ai PAS pu relancer** : `rerun_failed_jobs` rend `403 Resource not accessible by integration`. Et je n'ai pas poussé de commit vide pour forcer un nouveau run — c'est précisément ce qu'on ne fait pas. Le code concerné (BUG-WORKER-002) est **déjà sur `main`** : le prochain déploiement abouti le portera. **REPRIS LE 10/09 — ET DEUX ÉNONCÉS DE CETTE LIGNE SONT FAUX, corrigés ici plutôt que laissés en place.** (1) Les jobs cités n'existent pas dans `e2e.yml`, qui n'a qu'un job « Playwright local stack » : `Playwright desktop-1440` / `mobile-390` sont les shards d'`i18n-live-audit.yml`. Un lecteur envoyé sur le mauvais fichier cherche pour rien. (2) « Variables non interpolées » est un NON-DÉFAUT : `i18n-live-audit.yml:133` est `echo "Timed out waiting for ${service} on ${host}:${port}"`, en guillemets DOUBLES, dans une fonction dont ces trois noms sont des `local` — le littéral relevé venait de la SOURCE, pas d'un journal. Rejoué : « Timed out waiting for postgres on 127.0.0.1:55432 ». (3) La moitié « P1001 du 15/08 » est déjà corrigée et vérifiée : `up -d --wait` attend la SANTÉ (les trois services déclarent un healthcheck), et le run i18n le plus récent en échec (34362097616) a `Start local dependencies` et `Prepare database` en succès — l'échec est ailleurs. **CE QUI ÉTAIT ENCORE VIVANT, ET CE QUI EST CORRIGÉ ICI** : le run E2E 1828 est mort dans « Install Playwright browsers » sur `Err:10 https://dl.google.com/… Hash Sum mismatch` — `--with-deps` lance un `apt-get update` et l'index amont a été réécrit PENDANT le run (publié 09:41, run 17:16). Rien ne le retentait. Correctif : installation scindée en deux moitiés, la seule qui dépend d'un miroir extérieur (`playwright install-deps`) étant reprise au plus 3 fois avec purge de `/var/lib/apt/lists` — sans cette purge la reprise réutilise l'index périmé et échoue à l'identique. Appliqué aux TROIS workflows (règle 7 : `e2e.yml`, `e2e-runtime.yml`, `i18n-live-audit.yml`), et la seconde tentative de démarrage de la pile, qui n'existait que dans `i18n-live-audit.yml`, est généralisée aux deux autres. épinglé par `tests/guards/ci-demarrage-pile.spec.ts` (15 cas), qui tient les DEUX moitiés dans le même fichier : la boucle de reprise bornée, et l'existence des healthchecks sans lesquels `--wait` n'attendrait plus rien. Contre-épreuves rouges dans les deux sens. ⚠️ **Testé live reste ☐** : un correctif de CI ne se prouve que sur un run réel — à revérifier au prochain déclenchement de la porte E2E.

