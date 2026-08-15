# PR #125 — dossier de remise à l'auditeur

Point d'entrée unique. Les documents de contre-audit précédents restent en place pour
l'historique, mais **c'est ce fichier qui fait foi** : il porte le SHA courant, la
commande de rejeu, et l'état exact de chaque check.

Un mot sur les noms : `CONTRE_AUDIT_AFAA6441.md`, `CONTRE_AUDIT_82603D55.md` et
`CONTRE_AUDIT_82ED5E5F.md` portent le SHA qu'ils avaient au moment de leur rédaction.
La branche a été rebasée plusieurs fois depuis, sur demande, pour rester sur la tête
à jour de `main` — ces noms sont donc des **repères historiques**, pas le SHA courant.
Renommer à chaque rebase aurait cassé les liens de l'auditeur ; ce fichier-ci est
mis à jour à la place.

---

## 1. Ce qu'il faut auditer

| | valeur |
|---|---|
| Branche | `fix/from-scratch-install-dr-clean` |
| **SHA de code** | **`8909d09541`** |
| Base | `origin/main` = `f4f604f4ca` |
| Tête de PR | voir `git log` — au-delà du SHA de code, **uniquement `docs/audit/**`** |
| Release de preuve | `vibecore-pr125` (ns `vibecore-pr125`, runtime `vibecore-pr125-workspaces`) |
| Images | les 10, tag `8909d09541`, registre du cluster d'audit |

L'invariant « après le SHA de code, uniquement de la documentation » est vérifiable :

```bash
git diff --name-only 8909d09541..HEAD    # -> docs/audit/** exclusivement
```

## 2. Rejouer les 4 portes

L'environnement d'audit est disponible jusqu'au **2026-08-20 03:00 UTC**.

```bash
RELEASE=vibecore-pr125 NS=vibecore-pr125 RUNTIME_NS=vibecore-pr125-workspaces \
  WS_ID=ws-vibecore-pr125 scripts/proofs/replay-preview-doors.sh 8909d09541
```

Le script est assertif : il refuse (`set -euo pipefail`, sortie non nulle) si un seul
statut, fragment de corps, `101+DONNEES`, drapeau de pod ou `runtimeClass` diffère de
l'attendu. Il ne décrit pas, il vérifie.

Pour remonter la release isolée depuis zéro et **vérifier les digests** :

```bash
scripts/audit-env/deploy-isolated.sh vibecore-pr125 8909d09541
```

## 3. État des checks au SHA courant

| Check | État | Lecture |
|---|---|---|
| `Code Quality`, `Security Analysis`, `Production Terraform` (×2), `CodeQL` (×2), `Secret scan (gitleaks)`, `Secrets Detection`, `Dependency Vulnerability Scan`, `Accessibility`, `Performance`, `PR Size`, `Deploy Preview`, `Semantic Pull Request` | ✅ | 16 verts |
| `Install, test, build, scan` | ✅ | **réparé en amont** — `main` a mergé `06e50aff`, l'allow-list du code machine `SHARED_TENANT_UNAVAILABLE`, exactement la forme identifiée en §4 |
| `Quality Gates` | ✅ | il dérivait du précédent |
| `Production E2E` + 4 `Playwright` i18n | 🔴 | **hérités** — §5 |

## 4. `Install, test, build, scan` — a été cassé par `main`, réparé en amont depuis

> **Clos.** `main` a mergé `06e50aff fix(i18n): débloque la CI — sous-code machine
> `SHARED_TENANT_UNAVAILABLE` allowlisté`. Le check est **vert** depuis. Ce qui suit
> reste pour l'historique de l'attribution.

La garde i18n nomme le fichier :

```
Hardcoded-copy baseline regressions:
- services/api/src/database-provisioner.ts: new-file-debt (baseline=0, current=1)
```

* la PR ne touche pas ce chemin : `git diff --name-only origin/main...HEAD -- services/api/src/database-provisioner.ts` → **0** ;
* la chaîne arrive avec le commit `1348bf9f` de `main` ;
* **`main` échoue sur son propre `Install, test, build, scan`** (commit `99015dca`).

La chaîne est `reason: 'SHARED_TENANT_UNAVAILABLE'` — un **code machine**. La règle
`visible-object-copy` attrape la propriété `reason` d'un objet littéral ; la traduire
casserait le contrat entre appelants. Le correctif est une entrée d'allow-list ancrée
sur ce seul code, calquée sur `preview-port-access-fail-closed-reasons`. Vérifié dans
un arbre jetable — `i18n source baseline clean`, exit 0 — puis l'arbre de la PR a été
restauré (0 fichier modifié). Il doit atterrir sur `main` : l'introduire ici
reviendrait à glisser un correctif de `main` dans une PR d'infrastructure.

Détail : `preuves/release-isolee-5626c7be71/rouge-herite-i18n-database-provisioner.txt`.

## 5. Les deux familles Playwright — attribution mesurée sur `main`

Pas une comparaison avec d'autres PR, qui montrerait seulement que d'autres branches
sont rouges. Les deux suites ont été **lancées sur `main`** (`workflow_dispatch`, aucun
commit de la branche dans l'arbre) et comparées **test par test** :

* `Production E2E` sur `main` : **57 échecs / 177 succès**, deux échantillons
  **identiques entre eux** ;
* `French i18n live audit` sur `main` : rouge sur les **4 viewports**, 9 tests — dont
  les 6 de la PR. **Aucun** test n'échoue côté PR sans échouer aussi sur `main`.

Reste `dashboard.spec.ts:816`, qui a basculé dans les deux sens côté PR sans qu'une
ligne ne change. Une bissection l'a instruit : sur une branche portant l'arbre de la PR
avec `services/*` revenus à `main` — donc au contenu exécutable identique à `main` — le
test **échoue aussi**. Mode d'échec cohérent : les six jetons CSS reviennent vides,
soit une feuille de styles pas encore appliquée, en ~2,6 s. Le journal des échantillons
est tenu à jour dans `preuves/release-isolee-cb662e7b7e/journal-echantillons-dashboard-816.txt` —
si le test devenait systématique d'un seul côté, l'instruction serait à rouvrir.

## 6. Ce que les tours de contre-audit ont produit

Les deux P0 du dernier refus sont fermés et re-vérifiés à chaque rebase :

* **P0 #1** — validation d'exécution à grammaire positive sur `VIBECORE_PORTS_STATE` ;
  les 5 charges utiles de l'auditeur rendent `private:true`. **21/21**.
* **P0 #2** — allow-list exacte projet + numéro + région + cluster/membership, vérifiée
  contre une identité autoritative GCP, avec neutralisation des variables `HELM_*`.
  **8 assertions**, dont les négatives exigent une sortie non nulle **et** zéro appel
  d'outil.

S'y ajoutent **neuf défauts trouvés dans mon propre outillage de preuve** en le menant
jusqu'au bout sur un vrai cluster — dont trois entièrement silencieux : RoleBinding
accordé au workspace-manager **partagé**, perte des annotations Workload Identity, et
`apiBaseUrl` désignant l'API de la release partagée. Détail en §
« Les neuf défauts » de `CONTRE_AUDIT_82ED5E5F.md`.

## 7. Périmètre et garanties

* **Aucun merge.**
* **Production jamais approchée** : le contexte kube ambiant est vide, chaque appel
  porte sa cible explicitement, et les gardes refusent toute cible non-audit.
* **Release partagée du cluster d'audit intacte** (révision Helm inchangée) : c'est
  précisément pourquoi les preuves tournent sur une release isolée.
* **Enforcement preview de la production non activé** — changement sensible, laissé à
  la décision d'Avi.

## 8. Index des preuves

| Répertoire | Contenu |
|---|---|
| `preuves/release-isolee-8909d09541/`, `…-cb662e7b7e/` | SHA courant : déploiement + digests, 4 portes, registre, checks, journal `:816`, portes après les changements de preview de `main` |
| `preuves/release-isolee-5626c7be71/` | rouge i18n hérité + correctif vérifié, 4ᵉ échantillon E2E |
| `preuves/release-isolee-f2805edd03/`, `…-82ed5e5fa9/` | tours précédents : digests, portes, attribution CI, bissection |
| `preuves/p0-*` , `preuves/contre-audit-*` | tours antérieurs (contexte épinglé, fuite cookie, routage screenshotter) |
