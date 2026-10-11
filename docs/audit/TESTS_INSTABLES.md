# Tests instables — relevé du 2026-08-31

Quatre tests connus pour rendre un verdict qui ne reflète pas le code. Ils
coûtent cher : **l'un d'eux m'a fait annuler un correctif correct** le 31/08.

**Ne pas les désactiver.** Un test désactivé ne protège plus rien ; un test
instable protège encore, mal. Ce qu'il faut, c'est les stabiliser — ou écrire
pourquoi ils ne peuvent pas l'être.

---

## 1 à 3 — instables en E2E

| Test | Symptôme |
|---|---|
| `dashboard.spec.ts › IDE applies section 12 UI detail styles` | échoue puis passe au retry, sans changement de code |
| `mobile-device-matrix.spec.ts › compact IDE shell device matrix › adapts to iphone-pro-max` | idem, déjà observé le 30/08 sur #276 |
| `gallery-remix-license.spec.ts › gallery remix shows the versioned license…` | idem |

### Le coût réel, mesuré

Le 31/08, ces trois tests ont échoué ensemble sur le commit de #292.
Ils étaient **verts sur les trois commits précédents** de `main`, ce qui m'a
fait conclure à une régression de mon changement. **J'ai reverté.**

Puis j'ai relancé le run sur **le commit exact, sans rien changer** : **vert**.
Le revert était inutile, et deux des trois tests n'ont aucun rapport avec le code
que je touchais.

### La règle qui en découle

**Quand un test échoue sur votre commit et pas sur les précédents, relancez le
même commit avant toute conclusion.** Le coût d'une relance est dérisoire devant
celui d'un revert — et devant celui d'une fausse piste de plusieurs heures.

---

## 4 — dépendance entre fichiers de test

`services/api/src/tests/api.spec.ts` — trois cas :

* `prefers replacement ZIP storage over recovered IDE state files`
* `recovers new project scaffold files from persisted storage state when pod-local storage is empty`
* `indexes package manifests generated in IDE state even when project storage already has files`

**Mesuré le 31/08 :**

| Comment | Résultat |
|---|---|
| `vitest run src/tests/api.spec.ts` (fichier seul) | **124 passed** |
| `vitest run src/` (suite complète) | **3 failed**, les trois ci-dessus |
| suite complète sur `main`, **sans** le changement en cours | **les mêmes 3 failed** |

Ce ne sont donc pas des régressions : c'est un **état partagé entre fichiers de
test** qui fuit selon l'ordre d'exécution.

**Pourquoi c'est dangereux** — plus que les trois premiers. Un test qui échoue de
façon aléatoire finit par être reconnu comme instable. Un test qui échoue
**systématiquement en suite complète et jamais isolément** ressemble à une vraie
régression : la prochaine personne qui touchera à l'état IDE croira l'avoir
cassé, et cherchera dans son propre code. C'est exactement ce que j'ai commencé à
faire avant de lancer la comparaison avec `main`.

---

## Ce qu'il faut faire

1. **Les trois E2E** : identifier la source d'instabilité (attente d'un rendu ?
   ordre de démarrage du serveur de dév ?) plutôt que d'ajouter un retry.
2. **`api.spec.ts`** : trouver l'état partagé qui fuit — probablement un store en
   module, une base de test réutilisée ou une variable d'environnement posée par
   un autre fichier — et l'isoler.
3. Tant que ce n'est pas fait, **toute conclusion tirée d'un de ces quatre tests
   doit être confirmée par une seconde exécution du même état.**

---

# Contre-mesure du 2026-09-01

## Le n°4 (« dépendance entre fichiers de test ») ne se reproduit plus — et n'a peut-être jamais existé

Quatre exécutions complètes de `services/api`, dont **deux à ordre mélangé** :

| Commande | Résultat |
|---|---|
| `vitest run src/tests/api.spec.ts` | 124 passed |
| `vitest run src/` sur `origin/main` (`17fe73df5`) | **1844 passed, 0 failed** |
| `vitest run src/ --sequence.shuffle --sequence.seed=1` | **1844 passed, 0 failed** |
| `vitest run src/ --sequence.shuffle --sequence.seed=2` | **1844 passed, 0 failed** |
| `vitest run src/` sur `0c22f0f1e` (**avant** la garde du manifeste) | **1837 passed, 0 failed** |

La dernière ligne est la plus importante : les trois échecs ne se reproduisent
pas **même sur le commit antérieur au correctif**. Ce n'est donc pas « mon
correctif les a stabilisés » — c'est que la mesure du 31/08 a été prise dans une
condition que je n'ai pas consignée (arbre de travail sale, `node_modules`
partagé d'un worktree, ou filtre différent).

**Correction assumée** : le relevé du 31/08 affirmait « suite complète sur `main`,
sans le changement en cours → les mêmes 3 failed ». Cette ligne n'est pas
reproductible. Je l'avais écrite comme une mesure ; c'en était une, mais dans un
environnement non consigné — ce qui la rend inutilisable.

**Leçon à ajouter à la méthode** : une mesure sans son environnement consigné
n'est pas une mesure. Noter le commit exact, l'arbre propre ou non, et la
commande complète — sinon on ne peut ni la refaire ni la réfuter.

## Le vrai test instable était ailleurs, et il est corrigé

Le shard **`Playwright mobile-390`** de la porte « French i18n live audit »
n'avait **jamais** terminé : 0 succès sur 50 runs. Ce n'était pas de
l'instabilité aléatoire mais un **blocage déterministe** — la porte exigeait une
bascule de langue *visible* là où le produit la replie dans le menu sous 768 px,
et payait 15 s d'attente morte par route et par langue.

| | avant | après |
|---|---|---|
| `mobile-390` | **> 90 min, jamais terminé** | **13,3 min, succès** |
| desktop-1440 | 12,1 min | 12,2 min |
| desktop-1024 | 9,4 min | 11,3 min |

Corrigé dans la PR #299. C'est le seul des quatre « tests instables » qui était
réellement cassé, et il ne l'était pas de façon aléatoire.
