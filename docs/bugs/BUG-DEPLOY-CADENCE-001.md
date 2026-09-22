---
id: BUG-DEPLOY-CADENCE-001
---

## Bug

**Le débit de livraison est plafonné : les poussées arrivent DEUX FOIS plus vite qu'un déploiement ne se termine, donc les runs en attente sont évincés et il ne part qu'un déploiement toutes les ~5 h 30.** Rien n'est PERDU — le run qui aboutit porte le code des commits évincés — mais un correctif attend en moyenne plusieurs heures avant d'être servi. Ce n'est pas un défaut de code — c'est la CADENCE qui rend la livraison continue structurellement incapable d'aboutir, et l'instabilité E2E (BUG-E2E-PASTILLE-001) s'y ajoute.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

🟡 10/09 — **la moitié CODABLE est faite ; ce qui reste ne se code pas** : arbitrer la cadence des poussées, ou toucher la concurrence de `deploy-main`, n'est pas une décision de code. Ce qui l'est : empêcher le retour du mécanisme d'éviction. Le correctif du 06/09 (groupe par SHA sur `main`) tient dans une EXPRESSION, et une expression se « simplifie » en une ligne de revue sans qu'aucun test ne rougisse. épinglé par `tests/guards/cadence-de-livraison.spec.ts`, qui lit la POLITIQUE que la porte lit elle-même (`scripts/release-gate/required-checks.json`, consommée par `verify-required-checks.mjs` — chemin vérifié) et vaut donc pour le cinquième workflow requis qu'on ajoutera demain (règle 7). Elle accepte les DEUX formes sûres — aucun bloc `concurrency` (`security.yaml`) ou un groupe par commit sans annulation sur `main` (`ci.yml`, `e2e.yml`, `quality.yaml`). Contre-épreuve dans les deux sens sur les vrais fichiers (groupe ramené à `github.ref` → rouge ; `cancel-in-progress: true` → rouge)

## ✅ Testé live

☐

## Preuve

**Mesuré le 09/09 à 11:15 UTC.** Dernier déploiement ABOUTI : run **1566** (`5390b54`), créé 04:46, terminé **06:05**. Les neuf runs suivants relevés : 1567 `6034082` échec · 1569 `3b08660` échec · 1570 `f24ca5f` annulé · 1571 `249ebf5` annulé · 1572 `70c2225` échec · 1573 `7be989a` échec · 1574 `cc94547` en cours · 1575 `5ec3130` annulé · 1576 `6f9369f` en attente. ⚠️ **CETTE PHRASE ÉTAIT FAUSSE, ET JE LA CORRIGE** : j'avais écrit « aucun n'a atteint l'étape de construction ». Le run **1574** l'a atteinte et a ABOUTI à **11:34** — je l'avais lu « en cours » à 11:15 et j'en ai conclu qu'il n'aboutirait pas. Lire un état transitoire comme un état final est exactement la faute que la règle 4 vise. Le constat CORRIGÉ est plus doux : les déploiements aboutissent, mais RAREMENT — un seul sur neuf tentatives, et **5 h 29 entre deux réussites** (06:05 → 11:34). **Le rapport qui explique tout** : un déploiement abouti prend **79 min** (04:46→06:05) ; l'écart médian entre deux poussées mesuré sur la même fenêtre (06:22, 07:22, 08:00, 08:10, 08:55, 09:16, 10:06, 10:47, 11:06) est d'environ **40 min**. Une poussée arrive donc pendant que la précédente construit. **Ce que la concurrence fait EXACTEMENT**, et je l'avais mal dit : `cancel-in-progress: false` protège le run EN COURS — il va au bout, comme 1574 l'a montré — mais GitHub évince les runs EN ATTENTE du même groupe. Le débit se trouve donc plafonné à un déploiement par durée de déploiement, et les commits intermédiaires ne sont pas perdus : le run qui aboutit porte leur code. **Ce comportement est VOULU ici** : le graphe le dit (« Never run two production rollouts at once »), et le correctif par SHA appliqué à `e2e.yml` serait DANGEREUX pour un déploiement — il autoriserait deux `helm upgrade` simultanés. **Deux causes distinctes, à ne pas confondre** : les ANNULATIONS viennent de la cadence, les ÉCHECS viennent de la barrière refusant sur Production E2E. Corriger l'une ne suffira pas. **Pistes, non tranchées et hors de ma décision** : grouper les poussées, ou ne déployer que sur un déclenchement manuel périodique, ou stabiliser le test intermittent pour que la barrière cesse de refuser. **Suite mesurée le 09/09 à 13:37 (autre session)** : le run **1577** (`68d7ac3`) a ABOUTI — barrière passée à 12:42, étage runtime construit 12:44→13:13, étage **web** 13:13→13:23, `helm upgrade` par empreinte 13:29→13:36, « Verify rollout » et « Verify running imageIDs match the release manifest » verts à 13:37. Deuxième réussite consécutive, **2 h 03 après 1574** (11:34 → 13:37) : l'écart se resserre nettement par rapport aux 5 h 29 relevés plus haut. À noter aussi, contre l'hypothèse d'un défaut de code : le run 1576 avait été refusé sur **3 échecs E2E et 0 flaky**, et les MÊMES trois tests sont passés au vert sur 1577 — ils sont sensibles à la charge de la machine, pas déterministes.

