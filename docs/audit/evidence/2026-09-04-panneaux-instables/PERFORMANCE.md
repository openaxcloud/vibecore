# Temps de premier contenu des panneaux IDE — relevé du 2026-09-04

**Point distinct de BUG-PANEL-LOSS-001.** Le contenu n'est pas perdu ; il
arrive tard. Ce document mesure *où* part le temps.

Même environnement que `README.md` (env de test, web+api `fce8639ab3`, chemin
mesuré identique octet pour octet à `origin/main`).

## Budget mesuré — ouverture à froid, une seule ouverture par panneau

`paint-perf.mjs`. « contenu » = longueur du texte du panneau **stabilisée** sur
3 relevés consécutifs au-dessus du plancher de chargement — pas l'apparition de
la coque, qui est justement le signal trompeur de BUG-PANEL-LOSS-001.

| panneau | avant que la requête parte | la requête elle-même | rendu après réponse | **contenu à** |
|---|---:|---:|---:|---:|
| `overview` | 3 427 ms | 4 179 ms | ~390 ms | **8 001 ms** |
| `packages` | 3 986 ms | 3 784 ms | 498 ms | **8 268 ms** |
| `integrations` | 3 361 ms | 3 633 ms | 340 ms | **7 334 ms** |
| `collaborators` | 3 658 ms | — | — | **4 751 ms** |

**Le rendu n'est pas le problème** (0,3–0,5 s). Deux postes tiennent la durée :
~3,4–4,0 s avant que le panneau demande quoi que ce soit, puis une requête
gonflée d'un facteur ~3,5.

## Pourquoi la requête est gonflée — 28 requêtes sur 52 sont des doublons

Le même appel, seul, sur la même session et le même projet :
`/api/projects/:id/ide-panel/overview` → **1,01 / 1,07 / 1,12 / 1,36 / 1,01 s**
(5 relevés). Dans la page, il prend **4,18 s**.

`request-census.mjs` compte un événement `request` par appel — ni redirections
ni préliminaires CORS (relevé : 49 `fetch` + 3 `eventsource`, 50 GET + 2 PUT) :

| | `?panel=overview` | `?panel=integrations` |
|---|---:|---:|
| requêtes `/api/` pour UNE ouverture | 52 | 52 |
| points d'accès distincts | 24 | 24 |
| **événements en doublon** | **28** | **28** |

Doublons de tête, identiques sur les deux panneaux :

| ×  | appel |
|---:|---|
| 6 | `GET /api/workspaces/:id/ide-state` — dont **3 à la milliseconde près** |
| 4 | `GET /api/models` |
| 3 | `GET /api/projects/:id/ide-panel/overview?stream=1` — **même quand `overview` n'est pas le panneau actif** |
| 3 | `GET /api/projects/:id/ide-panel/<panneau actif>` |
| 3 | `ide-state`, `agent-routing`, `agent-repair-events`, `ide-panel/snapshots`, `ide-panel/settings`, `ai/conversations` |

Trois requêtes au même millisecond = plusieurs instances qui montent en même
temps, pas une reprise après échec. Le chiffre est **indépendant du panneau**
(52/24/28 des deux côtés) : le défaut est dans la coque de l'IDE, pas dans un
panneau.

## Sérialisation côté serveur — deux sauts évitables

Dans `api.projects.$projectId.ide-panel.$panel.ts` :

1. `const project = await apiRequest(request, '/projects/:id')` s'exécute
   **avant toute branche de panneau** : un saut sériel payé par tous.
2. `overview` → `loadOverviewResources` enchaîne
   `resolvePanelWorkspace` (`/projects/:id/workspaces`) **puis**
   `/api/runtime/workspaces/:id/resources`. Dépendance réelle (il faut l'id),
   mais elle porte la profondeur d'`overview` à **3 sauts sériels**.
3. `packages` fait pire, et **sans dépendance** :
   ```ts
   const workspaceCtx = await resolvePanelWorkspace(...);   // saut 2
   const [packages, envVars] = await Promise.all([...]);    // saut 3
   ```
   Ni `packages` ni `env-vars` n'utilisent `workspaceCtx` — vérifié dans le
   corps de la branche. Ce `await` peut rejoindre le `Promise.all` et faire
   tomber un saut sans rien changer d'autre.

## Limite assumée de ce relevé

Mesuré sur **Chromium desktop à 1440 px**, sur une liaison rapide. Avi juge la
plateforme sur **Safari iOS**. Je n'ai pas mesuré ce moteur ni ce réseau : les
chiffres ci-dessus sont donc un **plancher**, pas la valeur qu'il voit. Ne pas
présenter un relevé Chromium comme une preuve pour iOS.

---

# Suite du 2026-09-04 — la cause racine, et le chiffre d'Avi

## 1. Pourquoi les instances montent ensemble

Deux mécanismes qui se composent. **Dédupliquer au niveau réseau aurait masqué
les deux.**

**(a) Un effet de restauration monté sur cinq dépendances.**
`BaseChat.tsx:5004-5220` — l'effet qui restaure l'état de l'IDE (`gardeDeRestauration`,
`PROJECT_IDE_STATE_RESTORE_FALLBACK_MS`) se termine sur :

```ts
}, [activeProjectPanel, projectFiles, projectIdeMode, projectId, currentWorkspaceId]);
```

`projectFiles` est `useStore(workbenchStore.files)` — **la carte entière des
fichiers**. Pendant le démarrage de l'IDE, les fichiers arrivent par vagues :
chaque mise à jour du magasin change l'identité de `projectFiles`, l'effet
rejoue, et rappelle `getProjectIdeMemory`. `activeProjectPanel` fait la même
chose quand le panneau se résout. C'est la deuxième vague observée au recensement
(T puis T+~100 ms).

**(b) Aucune coalescence des requêtes en vol.**
`app/lib/persistence/projectIdeMemory.ts:823` — `getProjectIdeMemory` ne
consulte `memoryCache` qu'**avant** la requête, et ne la remplit qu'**après** la
réponse :

```ts
const cached = memoryCache.get(id);
if (cached && entreesFaisantAutorite.has(id)) return cached;
...
const response = await fetchProjectIdeMemory(endpoint);   // <- aucune promesse mémorisée
entreesFaisantAutorite.add(id);                           // <- seulement à l'arrivée
```

Il n'existe aucune table de requêtes en vol. Tout appelant concurrent manque le
cache et **émet sa propre requête réseau**. Avec **9 sites d'appel** de
`getProjectIdeMemory` (Chat.client ×2, BaseChat ×4, Preview, useProjectChatBranches,
useChatHistory), une ouverture à froid produit les 9 GET `ide-state` recensés —
6 sur le point d'accès workspace, 3 sur le point d'accès projet.

> **Ce qui est établi et ce qui ne l'est pas.** Les deux mécanismes sont lus
> directement dans le code, et le compte de 9 sites d'appel correspond exactement
> aux 9 GET mesurés. Je n'ai **pas** instrumenté le nombre de réexécutions de
> l'effet lui-même — c'est la limite de ce relevé.

## 2. Corrigé — le saut sériel sans dépendance de `packages`

`resolvePanelWorkspace` rejoint le `Promise.all` (ni `/packages` ni `/env-vars`
n'utilise `workspaceCtx`, vérifié dans le corps de la branche). Coût du saut
supprimé, mesuré seul sur l'env de test : `/projects/:id/workspaces` =
**0,27 / 0,28 / 0,31 / 0,36 / 0,45 s**. Typecheck inchangé (541 erreurs
préexistantes avant comme après, **0** dans le fichier touché), 480 tests verts.

## 3. Le chiffre d'Avi — WebKit / iPhone, sur la PRODUCTION

SHA servi **avant ET après** la campagne : `web:753b5ed38d`, **inchangé** — la
mesure est donc valide (un changement de version en cours de campagne l'aurait
annulée).

| surface | Chromium desktop 1440 | **WebKit / iPhone 15 Pro** | rapport |
|---|---:|---:|---:|
| **production** `overview` | 8 642 ms (51 req.) | **13 066 ms** (51 req.) | **1,51×** |
| **production** `integrations` | 9 260 ms (50 req.) | **11 132 ms** (48 req.) | **1,20×** |
| env de test `overview` | 8 332 ms (51 req.) | 6 930 ms (38 req.) | 0,83× |
| env de test `integrations` | 8 375 ms (47 req.) | 7 599 ms (38 req.) | 0,91× |

**Treize secondes avant le premier contenu de la Vue d'ensemble, sur iPhone, en
production.** Et le moteur seul ne l'explique pas : sur l'env de test WebKit est
*plus rapide* que Chromium (0,83×) et n'émet que **38** requêtes contre 51. En
production il en émet **51, autant que Chromium**, et devient 1,5× plus lent. La
coque mobile ne duplique donc pas partout de la même façon — c'est une piste à
suivre, pas une conclusion.

Le défaut de duplication est bien **présent en production** : 50-51 requêtes
`/api/` pour une seule ouverture, comme sur l'env de test.

### Limite qui subsiste

Mesuré depuis un Mac sur une liaison rapide, avec un projet **de gabarit à
7 fichiers** — pas un projet réel d'Avi, et pas son réseau mobile. Les 13 s sont
donc **encore un plancher**. Session de preuve ouverte puis révoquée selon
`docs/runbooks/PROTOCOLE_PREUVE_PROD.md` (4 sessions révoquées, témoin à 0,
jeton en 401, fichiers porteurs supprimés) ; projet sonde supprimé.

---

# Suite — l'écart entre moteurs, creusé (2026-09-04)

L'écart « 38 requêtes sur WebKit contre 51 sur Chromium » que je signalais comme
une piste est **en partie un artefact** : le total varie d'une exécution à
l'autre (WebKit : 38 puis 46 puis 46). Le total n'est donc pas un bon signal.

En revanche, en diffant le **multi-ensemble d'URL** sur le MÊME environnement,
le MÊME projet et le MÊME panneau — seul le moteur change — deux écarts
ressortent **identiques sur deux exécutions consécutives** :

| appel | Chromium | **WebKit / iPhone** |
|---|---:|---:|
| `GET /api/projects/:id/export/zip` | 1 | **4** |
| `GET /api/projects/:id/ide-state` | 3 | 1 |
| `GET /api/projects/:id/files-revision` | 2 | 0 |
| `GET /api/projects/:id/ide-panel/ports` | 1 | 0 |
| `GET /api/check-env-key`, `/api/models/Anthropic`, `/project-action` | 1 chacun | 0 |

## Ce qui mérite l'attention : `export/zip` × 4 sur Safari

Appelé depuis `app/lib/stores/workbench.ts:693` — le magasin de fichiers
récupère **le projet entier en ZIP** pour amorcer l'arborescence côté client.
Sur Chromium : une fois. Sur WebKit/iPhone : **quatre fois**, reproduit à
l'identique sur deux exécutions.

Coût mesuré ici : **3 210 octets, 0,30 s** — négligeable, parce que le projet de
mesure a 7 fichiers.

> **C'est une piste, pas une conclusion.** Sur ce projet le surcoût est nul. Le
> risque est d'échelle : cette charge utile grandit avec le projet, et elle est
> tirée quatre fois, sur le moteur d'Avi, à chaque ouverture à froid. Sur un
> projet réel et un réseau mobile, quatre transferts de l'archive complète ne
> sont plus négligeables du tout. **Non vérifié sur un gros projet** — c'est la
> mesure à faire ensuite, et elle doit se faire dans les mêmes conditions que
> l'originale.

---

# La piste ZIP, vérifiée à l'échelle (2026-09-04) — elle tient, et c'est pire que ×4

## Le projet de mesure

401 fichiers de **source réelle** (pris dans `app/` de ce dépôt). J'ai d'abord
généré du contenu synthétique : il se compressait 8× au lieu de 3,4×, ce qui
**sous-estimait** la charge utile. Jeté et refait avec du vrai code.

`3,73 Mio bruts → ZIP 1,09 Mio (3,4×)`. Importé via `files/import/zip`.

## Le coût d'UN appel

| | starter 7 fichiers | **projet représentatif 401 fichiers** |
|---|---:|---:|
| ZIP décodé | 3 210 o | **3 987 179 o (3,8 Mio)** |
| base64 sur le fil, non compressé | 3,2 Ko | **5 316 240 o (5,07 Mio)** — +33 % rien qu'en base64 |
| compressé (gzip) | 3,2 Ko | **1 505 936 o (1,44 Mio)** |
| durée (Mac, bonne liaison) | 0,29 s | **2,79 / 3,53 / 3,84 s** |

## Le nombre d'appels — **9**, deux passages concordants

| | Chromium | **WebKit / iPhone 15 Pro** |
|---|---:|---:|
| appels `export/zip`, passage 1 | 1 | **9** |
| appels `export/zip`, passage 2 | — | **9** |
| réponses abouties dans la fenêtre | 1 | 3 puis **7** |
| **octets décodés observés** | 5,07 Mio | 15,2 Mio puis **35,5 Mio** |

Neuf appels aboutis ≈ **46 Mio décodés**, ≈ **13 Mio compressés sur le fil**,
pour UNE ouverture à froid — chacun devant être décodé de base64 puis dézippé
sur le téléphone.

## Pourquoi neuf — les traces de pile le disent

Instrumentation de `window.fetch` dans la page, pile capturée à chaque appel.
**Identique sur les deux passages** :

- **1 appel direct** — `loadProjectStorageFiles` ← `ProjectWorkspaceProvider`
- **8 appels** — `loadProjectStorageFiles` ← **`loadRuntimeFiles`**

`loadProjectStorageFiles` est le **repli** : `loadRuntimeFiles` ne l'appelle que
si le chargement runtime échoue **ou rend 0 fichier**
(`workbench.ts:662`). Il est donc emprunté huit fois, et il n'a **ni mise en
commun des requêtes en vol, ni plafond de reprise** — exactement la même classe
de défaut que BUG-PANEL-PERF-004(b), mais sur une charge utile de plusieurs
mégaoctets au lieu de quelques kilo-octets.

**Si un seul appel suffit, la correction est une suppression** — pas une
optimisation.

## Ce que ça change

Les réponses arrivent à **15,0 / 15,6 / 16,0 s**, soit APRÈS que le panneau a
peint (11,6 s) : le téléchargement continue en fond pendant que l'utilisateur
croit la page prête. Sur réseau mobile, 13 Mio compressés ne se téléchargent pas
en quelques secondes.

> **Limites, explicitement.** Le chiffre **9** repose sur deux passages à
> l'échelle (le ×4 du petit projet, lui, est reproduit deux fois aussi). Mesuré
> depuis un Mac sur bonne liaison, sur l'environnement de TEST — pas sur la
> production, pas sur le réseau d'Avi, pas sur son projet réel. La direction est
> établie ; l'amplitude sur son téléphone reste à mesurer.

---

# CORRECTION (2026-09-04, même jour) — la tempête de ZIP n'est PAS propre à Safari

En vérifiant si l'erreur `DataCloneError` était propre à WebKit, le **témoin
Chromium** a rendu un résultat qui contredit ma propre présentation :

```
chromium-1440: zipRequests=8  dataCloneErrors=0  startFailures=0  (61 messages console vus)
```

**Chromium a fait 8 appels `export/zip`, pas 1.** L'écart avec mes relevés
précédents (« Chromium = 1 ») vient de la **fenêtre d'observation** : les
premières sondes arrêtaient de compter peu après la peinture du panneau, alors
que les réponses arrivent à 15–22 s. Une fenêtre plus longue voit la tempête sur
les deux moteurs.

**Ce qui reste vrai, et ce qui tombe :**

| | statut |
|---|---|
| La tempête d'archives existe et coûte des mégaoctets | **tient** — 9 appels, 5,07 Mio décodés chacun, mesuré trois fois |
| Le repli `loadProjectStorageFiles` n'a ni mise en commun ni plafond de reprise | **tient** — lu dans le code, confirmé par 8 piles d'appel identiques |
| « C'est un défaut propre à Safari » | **TOMBE** — Chromium en fait 8 aussi sur une fenêtre équivalente |
| `Workspace start failed: DataCloneError` sur WebKit | **une seule observation**, non reproduite ; absente du témoin Chromium (0) |

La conséquence pratique ne change pas de nature, elle change de portée : ce n'est
pas « Safari est cassé », c'est **la plateforme entière qui retélécharge le
projet jusqu'à neuf fois par ouverture**, sur tous les moteurs. C'est plus grave,
pas moins — mais ça n'explique plus à soi seul un écart Safari/Chrome.

> Le `DataCloneError` reste une piste à part, à reproduire avant toute
> conclusion : vu une fois, absent du témoin Chromium, jamais rejoué.

---

# Vérification sur la PRODUCTION, fenêtres appariées (2026-09-04)

Le défaut de méthode des relevés précédents : chaque moteur recevait une
**fenêtre d'observation différente**, alors que les réponses d'archive arrivent
entre 12 et 22 s. Ici les deux moteurs reçoivent la **même fenêtre en temps
absolu depuis le début de la navigation**, et le comptage se fait sur les
événements Playwright (pas un crochet dans la page), donc il ne dépend plus du
moment où le panneau a peint.

Projet : le **même** archive de 401 fichiers de source réelle, importé en
production. SHA servi : `753b5ed38d`.

| passage | fenêtre | Chromium desktop | WebKit / iPhone 15 Pro |
|---|---:|---|---|
| 1 — ouverture réellement à froid | 45 s | **7 requêtes**, 6 réponses | 2 requêtes, 2 réponses, **10,14 Mio** |
| 2 — espace de travail plus chaud | 60 s | **2 requêtes, 2 réponses, 10,14 Mio** | **2 requêtes, 2 réponses, 10,14 Mio** |

**Au passage 2 les deux moteurs sont IDENTIQUES.** Au passage 1, c'est
**Chromium qui en fait le plus** (7 contre 2) — l'inverse exact de ce que
j'avais annoncé.

> Les octets du passage 1 côté Chromium ne sont pas comparables : 5 de ses
> 6 réponses sont arrivées à l'instant même de la fermeture de la fenêtre
> (45 256 ms), corps non récupérable. Seul le nombre de requêtes est
> exploitable pour ce passage.

## Conclusion

- **Ce n'est pas un défaut de Safari.** Démenti deux fois, sur la production,
  à fenêtres appariées.
- **Le nombre d'archives suit l'état de l'espace de travail**, pas le moteur :
  plus `loadRuntimeFiles` échoue (démarrage à froid), plus le repli
  `loadProjectStorageFiles` retélécharge l'archive entière. D'où 7 à froid
  et 2 une fois tiède.
- **Le coût tient** : 5,07 Mio décodés par appel (1,44 Mio compressés),
  **10,14 Mio pour une seule ouverture** dans le cas reproductible, sur un
  projet de 401 fichiers.

## Validité du relevé

SHA vérifié avant : `753b5ed38d`. Vérifié après : **le déploiement a changé
pendant la vérification** (nouveau digest). Contrôle fait avant de conclure :
le nouveau pod `web-6d8d7664cf-hsfjr` a démarré à **17:17:24Z**, soit APRÈS les
deux passages, et il est **`Pending`, `ready=false`, 0 redémarrage** — il n'a
donc jamais reçu de trafic. Les deux anciens pods (15:44 / 15:45) servaient
encore. **Le relevé porte bien sur `753b5ed38d`.**

Session de preuve révoquée (1 révoquée, témoin à 0, jeton en 401, fichiers
porteurs supprimés) ; projet sonde supprimé.

---

# Référence sur `be197c3e38` + cause racine de l'archive (2026-09-04, après déploiement)

## Nouvelle référence — toute mesure antérieure à 17h16 porte sur l'ancien code

Production `be197c3e38` (digest `sha256:95ea1784…`, vérifié identique avant ET
après), projet de **401 fichiers de source réelle** :

| | Chromium desktop 1440 | WebKit / iPhone 15 Pro |
|---|---:|---:|
| `overview` — premier contenu | **12 884 ms** (49 req.) | **9 943 ms** (38 req.) |
| archives téléchargées (fenêtre 60 s appariée) | **2**, 10,14 Mio | **2**, 10,14 Mio |

⚠️ Les **13 066 ms** annoncés plus haut portaient sur l'ANCIEN SHA **et** sur le
starter à 7 fichiers : deux variables ont changé, ils ne se comparent pas à cette
ligne. **La référence est celle-ci.** Tout gain annoncé devra être mesuré dans
ces conditions exactes.

## `loadRuntimeFiles` N'ÉCHOUE PAS — mon explication précédente est fausse

Mesuré : `GET /api/runtime/workspaces/:id/files?path=.` rend **200, 47 507
octets, 2 entrées racine, à chaque appel — jamais vide** (5 réponses observées).
Zéro réponse non-2xx sur toute l'ouverture (153 réponses).

Donc le repli n'est PAS déclenché par une panne du runtime. Il l'est par l'autre
moitié de la condition (`workbench.ts:662`) :

```ts
if (runtimeError || (this.#projectId && this.#filesStore.filesCount === 0)) { … repli … }
```

En mode `remote-kubernetes`, `listFiles()` rend l'arborescence **SANS contenu**
— c'est documenté dans `reloadFromRuntime` : le contenu est hydraté par
`ProjectWorkspaceProvider`, qui charge l'archive **avant** ce rechargement.

## La vraie cause : les deux hydratations courent en parallèle

Traces de pile capturées en production, arbre sain, 2 téléchargements :

| # | à | appelant |
|---|---:|---|
| 1 | **7 027 ms** | `loadProjectStorageFiles` ← `ProjectWorkspaceProvider` — **l'hydratation prévue** |
| 2 | **7 041 ms** | `loadProjectStorageFiles` ← **`loadRuntimeFiles`** — le repli |

**14 millisecondes d'écart.** Le second part avant que le premier ait répondu
(réponses à 15,2 s et 16,1 s). `loadRuntimeFiles` voit donc `filesCount === 0`
— non pas parce que quelque chose a échoué, mais **parce que l'hydratation qui
va le remplir est encore en vol** — et lance son propre téléchargement de 5 Mio.

C'est **exactement** le défaut de BUG-PANEL-PERF-004(b) : aucune mise en commun
des appels en vol, le cache n'étant rempli qu'à l'arrivée de la réponse. Même
motif, autre endroit, charge utile mille fois plus lourde.

**Conséquence sur l'ordre des correctifs** : le plafond de reprise (piste 1)
traiterait un symptôme. La mise en commun des appels en vol (piste 2) **est** la
cause. Plus le démarrage est froid, plus d'appelants entrent dans la fenêtre
avant la première réponse — d'où 2 à tiède, 7 à froid.

## Deux défauts d'échelle relevés au passage

Sur ce projet de 401 fichiers, en production, dans la console :

- `Failed to restore project IDE state AbortError: signal is aborted without reason`
  puis `Failed to load project IDE memory.` — la restauration d'état **expire**
  (`PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS = 5000`) ;
- `Project IDE memory write degraded {outcome: skipped-too-large}` — l'état de
  l'IDE est **trop gros pour être persisté** et l'écriture est abandonnée.

Aucun des deux n'apparaît sur un starter à 7 fichiers. **Une seule observation
chacun** : à confirmer avant d'en faire des points fermes.

---

# Plafond de croissance : l'état de l'IDE ne s'écrit plus, et ne se relit plus

Reproduit en production (`be197c3e38`, vérifié inchangé), projet de **401
fichiers**, **3 ouvertures à froid**.

| défaut | reproductibilité |
|---|---|
| `Project IDE memory write degraded {outcome: skipped-too-large}` | **3 / 3** |
| `Failed to restore project IDE state AbortError` + `Failed to load project IDE memory.` | **2 / 3** |

## Les chiffres

| | |
|---|---:|
| charge utile `ide-state` mesurée | **4 053 595 o = 3,87 Mio** |
| plafond PAR ENTRÉE (`IDE_MEMORY_ENTRY_CAP_BYTES`) | 524 288 o = **512 Kio** |
| dépassement | **× 7,7** |
| budget total (`IDE_MEMORY_BUDGET_BYTES`) | 2 Mio |
| délai de chargement (`PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS`) | **5 000 ms** |

Inspection du `localStorage` après chaque ouverture : l'entrée **du projet est
absente**. Seule subsiste une entrée d'espace de travail de 2 808 octets. Le
`skipped-too-large` n'est donc pas un avertissement cosmétique — **rien n'est
écrit**.

## Pourquoi les deux se composent

1. L'état pèse 7,7 fois le plafond par entrée → **jamais mis en cache localement** ;
2. il n'existe donc aucun repli local, et tout dépend du réseau ;
3. le chargement réseau doit ramener 3,87 Mio en **moins de 5 s**, sinon
   `AbortError` → **état perdu**.

Résultat pour l'utilisateur : sur un projet de cette taille, la disposition, le
fichier sélectionné et les onglets sont perdus à l'ouverture, par intermittence
(2 fois sur 3 ici). **Et cela empire strictement à mesure que le projet grandit** —
c'est un plafond de croissance, pas un défaut d'affichage.

> Le commentaire de `ide-memory-budget.ts` nomme déjà le symptôme côté Avi :
> « `localStorage` à ~4,5 Mo, dominé par les entrées de mémoire IDE ». Même
> famille.

## Lien avec la course corrigée dans la PR #442

L'état `ide-state` est demandé **2, 10 puis 8 fois** selon l'ouverture. À
3,87 Mio l'appel, l'ouverture de la course 2 a transféré **38,7 Mio d'état
d'IDE** — pour une seule ouverture. La déduplication des appels en vol de #442
supprime ces répétitions ; elle ne change PAS le fait que l'état soit trop gros
pour être écrit localement, ni le délai de 5 s. Les deux points restent ouverts.

---

# Pourquoi l'état pèse 3,87 Mio — anatomie (2026-09-04, prod `be197c3e38`)

Charge utile réelle prélevée sur un projet de 401 fichiers, **avant même toute
ouverture de l'IDE** (`ide-state-payload-401files.json`) :

| clé | poids | part |
|---|---:|---:|
| `ui` | **2 o** (`{}`) | 0,0 % |
| `chat` | **15 o** (`{"messages":[]}`) | 0,0 % |
| `files.entries` | **4 101 427 o** — 401 entrées `{path, content}` | **100,0 %** |

Dont **3 896 042 o (3,72 Mio) de contenu de fichiers brut**.

**L'état d'espace de travail réel pèse 17 octets.** Le reste est une **troisième
copie** des fichiers du projet — ils existent déjà dans le stockage projet (ce
que sert `/export/zip`) et dans le pod de l'espace de travail.

## Ce n'est PAS une fuite : c'est délibéré et porteur

Avant de conclure « contenu qui n'a rien à faire là, donc suppression », j'ai
cherché ce qui en dépend. `listProjectFilesIncludingIdeState(...)` est appelée
depuis **plus de dix endroits** de l'API (statut et commit git, exports,
déploiements). La raison est écrite dans `project-storage.ts:900` :

> « L'IDE enregistre une modification dans le pod et dans `ide-state` ; aucun
> des deux n'est l'arbre de travail git. » — sans cela un fichier édité à la
> main était invisible pour git, `status` rendait « 0 changement » pour
> toujours.

**Retirer `files` du magasin casserait git.** Ce n'est pas la correction.

## La vraie forme du défaut : un magasin, deux métiers

`ide-state` fait deux choses aux profils de taille incompatibles :

1. l'**état d'interface** — quelques octets, lu par le navigateur ;
2. un **magasin de contenu de fichiers** — plusieurs mégaoctets, lu par le
   serveur.

Or le budget client a été dimensionné pour le premier métier : plafond par
entrée **512 Kio**, délai de chargement **5 s**, stockage `localStorage`. La
charge utile est dominée par le second.

## Et le client n'en fait RIEN

Vérifié, témoins à l'appui (`memory.ui` → 14 occurrences, `memory.chat` → 27,
donc la recherche fonctionne) :

- le type client `ProjectIdeMemory` déclare **`chat`, `ui`, `updatedAt`** — et
  **aucun champ `files`** (l'unique occurrence du mot est
  `rightPanelMode?: 'files' | 'preview-logs'`, une chaîne littérale) ;
- **aucune** lecture de `state.files` côté client ;
- aucune écriture non plus.

Le navigateur télécharge donc **3,9 Mio qu'il ne sait pas typer, ne lit jamais
et ne peut pas utiliser** — jusqu'à dix fois par ouverture à froid, soit
**38,7 Mio**.

## La correction indiquée par la mesure

Une **projection sur le chemin de lecture vers le navigateur**, pas une
suppression dans le magasin :

- le serveur garde `files` dans `ide-state` (dix appelants en dépendent) ;
- le GET destiné au navigateur ne rend que `{ui, chat, updatedAt}`.

Effets attendus, tous conséquences directes des mesures ci-dessus : 17 octets au
lieu de 3,9 Mio, donc plus de dépassement du plafond de 512 Kio (l'écriture
locale réussit), plus de risque de dépassement du délai de 5 s, et jusqu'à
38,7 Mio de trafic mobile supprimés par ouverture.

**Le plafond de 512 Kio et le délai de 5 s n'ont pas besoin d'être retouchés** :
ils étaient corrects pour l'état d'interface, c'est la charge utile qui n'aurait
jamais dû les rencontrer.
