---
id: BUG-QA0928-RUNTIME-ID-PROJET
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**BLOQUANT — le runtime est adressé avec l'identifiant du PROJET au lieu de celui du workspace ; les écritures de l'agent partent dans le vide.** Quand le
démarrage du workspace n'aboutit pas — cas mesuré : `429` du quota `workspaces.active` (1 sur le
plan gratuit) parce qu'un autre projet du même compte tourne encore — l'IDE ne s'arrête pas :
chaque consommateur du runtime (liste et lecture de fichiers, observateurs de fichiers et de ports,
création de dossiers, **écritures de fichiers**) part vers `/api/runtime/workspaces/<projectId>/…`.
L'API refuse (`401`), l'auto-réparation du jeton jette le ticket, en frappe un neuf, se refait
refuser — jusqu'au `429` sur le guichet de tickets lui-même.

Pour l'utilisateur : il ouvre un second projet (ou le même dans un autre onglet après en avoir
ouvert un autre), demande quelque chose à l'agent, et **les fichiers écrits n'arrivent jamais dans
le runtime**. Aucun de ces refus ne correspond à une vraie perte de session.

## Cause (lue dans le code, `5cd5e6db7`)

- `app/lib/runtime/RuntimeAdapterProvider.tsx:140` — l'adaptateur est construit avec
  `workspaceId: options.workspaceId ?? options.projectId`. Tant que `startWorkspace()` n'a pas rendu
  le vrai `ws-…`, toute requête runtime vise l'identifiant du projet.
- `app/lib/runtime/ProjectWorkspaceProvider.tsx:127` — `sessionId = workspaceId ?? projectId`, et
  `packages/runtime-remote/src/index.ts:243` adopte cet identifiant demandé comme identifiant de
  workspace si le `POST /workspaces` échoue de façon « transitoire ». Si le démarrage échoue
  (quota, erreur), il n'est **jamais** remplacé.
- `services/api/src/app.ts` `authenticateRuntimeTicket` — `store.getWorkspace(<projectId>)` ne trouve
  rien → `401`. Ce `401` est indiscernable d'un ticket expiré ; `shouldRefreshAuthToken` le traite
  comme tel → re-frappe.

## Repro

### 1. Preuve de production (lecture seule, sans compte) — OBSERVÉ

Image servie : `web` `5cd5e6db75` (digest `sha256:5a1bc8c8…`), `api` digest `sha256:dd646692…`,
relevé le 2026-09-28 à 16:14 UTC, fenêtre des journaux 11:14 → 17:18 UTC.

```sh
C=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
for p in $(kubectl --context $C -n vibecore get pods -l app.kubernetes.io/component=api -o name); do
  kubectl --context $C -n vibecore logs $p -c api --since=24h; done \
  | python3 docs/bugs/qa-2026-09-28/preuve-journaux-runtime.py
```

Artefact : `docs/bugs/qa-2026-09-28/artefacts/prod-journaux-runtime-id-projet.txt`. Verdict :

```
VERDICT appels runtime sur ID DE PROJET : 552 — dont refusés 401 : 552 — écritures de fichiers refusées : 78
12:04  429  démarrage workspace  ×1
12:05  200  ticket  ×122      ← 122 tickets frappés en une minute, tous « valides »
12:05  429  ticket  ×35
```

Séquence à la milliseconde (projet A, 12:04:56–12:05:08) : ouverture de l'IDE → `ports/watch`,
`files`, `files/read` vers l'id du projet, tous `401`, **avant** même la réponse du démarrage →
`POST /api/runtime/workspaces` = `429` à 12:04:57.649 (un workspace `ws-…` d'un autre projet du
compte était sondé toutes les 15 s, donc ouvert dans un autre onglet) → boucle ticket/401.

Aucun appel adressé à un `ws-…` n'a été refusé de cette façon : les `401` sur `ws-…` (59) sont
épars, ceux sur l'id du projet sont 552 sur 552.

Limite de cette preuve : les adresses journalisées sont celles de l'ingress ; je ne peux pas
attribuer ces requêtes à un utilisateur (réel ou session de test). Le mécanisme, lui, est établi.

### 2. Repro locale exécutable — REPRODUIT

Environnement : worktree détaché sur `5cd5e6db7` (arbre propre hors `docs/bugs/`), `pnpm install
--frozen-lockfile`, **build de production** (`VITE_RUNTIME_MODE=remote-kubernetes
VITE_RUNTIME_API_BASE_URL=http://127.0.0.1:3011/api/runtime pnpm run build`), servi par
`node server.mjs` sur 127.0.0.1:5183 ; API locale `pnpm run dev:api` sur 3011 avec
`API_CORS_ORIGINS` incluant `http://127.0.0.1:5183` ; Postgres/Redis `docker-compose.dev.yml`
(projet `vc-qa0928`, ports 55532/56479). Pas de workspace-manager.

```sh
cd docs/bugs/qa-2026-09-28
node fixture-local.mjs                              # compte de test LOCAL + 2 projets
ENGINE=chromium DUREE=60000 node repro-quota-storm.mjs
```

Résultat (le démarrage rend `502` faute de manager — c'est le chemin « échec transitoire » de
`runtime-remote/src/index.ts:243`) :

```
"startWorkspace": [502],
"ticketsFrappes": {"200": 29},          ← 29 tickets frappés en 60 s pour un seul onglet
"appelsSurIdProjet": 10,
"detail": {"401 GET /files": 4, "401 GET /files/read": 4, "401 GET /status": 2},
"appelsSurWsId": {}                     ← aucun appel n'a jamais visé un ws-…
```

Avant même la correction CORS, la console montrait déjà les requêtes partir vers
`/api/runtime/workspaces/<id du projet 2>/files?path=.`, `…/files/read?path=README.md` et les
WebSocket `…/ports/watch` et `…/files/watch` — alors que `runtime/boot` avait échoué.

Le chemin `429` (quota) n'a pas pu être rejoué en local : la réconciliation du quota a libéré le
créneau parce que le manager était injoignable — voir BUG-QA0928-RECONCILIATION-MANAGER-INJOIGNABLE.
Il est prouvé en production par les journaux (§1).

## Correctif (branche `fix/ecritures-refusees-workspace`)

Pourquoi PAS côté ticket : l'API sait résoudre un identifiant de projet (`authorizeRuntimeWorkspace`),
mais une mutation qui passe provisionne le pod à la demande **sans vérifier le quota**
(BUG-QA0928-PROVISION-SANS-QUOTA). Accepter le projet dans le ticket aurait fait de chaque écriture
refusée pour quota un second pod. Le correctif est donc côté client, en trois parties.

1. **Plus jamais l'identifiant du projet dans un chemin runtime.**
   `RuntimeAdapterProvider.tsx` ne passe plus `workspaceId ?? projectId` ; l'adaptateur garde le
   projet pour le seul corps de `POST /workspaces`. Une mutation lancée pendant un démarrage
   l'attend (`#identifiantPourMuter`) ; sans démarrage ni workspace, `WORKSPACE_NOT_STARTED` sans
   requête réseau. Sur échec « transitoire », l'adaptateur n'adopte plus l'identifiant du projet :
   il redemande le démarrage (`#redemanderLeDemarrage`).
2. **Le travail ne disparaît pas.** `app/lib/runtime/ecritures-en-attente.ts` garde chaque
   écriture refusée faute de workspace (dernière version par chemin), dans `localStorage` parce que
   « Redémarrer l'espace de travail » recharge la page. Le fournisseur la rejoue après le
   réensemencement, avant l'aperçu. Si le navigateur refuse d'en garder copie, l'avis le dit.
3. **L'utilisateur sait, avant et après.** `AvisEcrituresEnAttente` au-dessus du composeur : avant
   (démarrage refusé pour quota → « l'agent ne peut pas écrire de fichiers pour l'instant… ») et
   après (« N fichiers n'ont pas encore pu être écrits » + cause + « rien n'est perdu »). L'envoi à
   l'agent est retenu tant que le quota bloque le démarrage. La carte d'action dit « l'espace de
   travail n'a pas démarré — ce fichier est conservé… » au lieu de « Remote workspace has not been
   started ».

La cause du refus (question 3) : le plafond `workspaces.active = 1` du forfait gratuit est
**voulu** (`packages/billing/src/index.ts:88`). L'effet de bord était ailleurs : l'avertissement
n'existait qu'en infobulle de la barre d'état, et la réconciliation libérait à tort le créneau quand
le manager était injoignable (corrigé dans la même branche, BUG-QA0928-RECONCILIATION-MANAGER-INJOIGNABLE).

## 📤

☑ 29/09 #597

## 💻

☑ 30/09 fusionnée `6cebe6438` (#597, par la coordination)

## ✅

☐ pas encore servi en prod au 30/09 13:45

## Preuve

**Avant** : preuve prod ci-dessus (journaux, 552 refus dont 78 écritures).

**Après, en local** (build de production `remote-kubernetes`, WebKit iPhone 13 et Chromium 1440,
`node docs/bugs/qa-2026-09-28/preuve-correctif-ecritures.mjs`, 2026-09-29) :

| | avant correctif | après |
|---|---|---|
| requêtes runtime vers l'id du projet (60 s) | 10 | **0** |
| tickets demandés | 29 | **2** |
| avis de quota avant tout envoi | absent (infobulle seulement) | **affiché** |
| envoi pendant le refus de quota | parti | **retenu, 0 appel agent, saisie gardée** |
| file après « Redémarrer » (rechargement) | — | **« 2 fichiers n'ont pas encore pu être écrits… Rien n'est perdu »** |

Artefacts : `artefacts/correctif-webkit-*.png`, `artefacts/correctif-chromium-*.png`.

**Non prouvé en réel** : le rejeu effectif dans un pod (il faut un workspace qui démarre ; pas de
manager en local). Tenu par les tests ci-dessous.

Épinglé par :
- `packages/runtime-remote/src/identifiant-de-projet.spec.ts` (jamais l'id du projet, attente du
  démarrage, redemande sur échec transitoire) ;
- `app/lib/runtime/RuntimeAdapterProvider.spec.ts` (câblage de la fabrique) ;
- `app/lib/runtime/ecritures-en-attente.spec.ts` (garde, rechargement, rejeu, stockage refusé) ;
- `app/lib/runtime/action-runner-ecriture-sans-workspace.spec.ts` (site d'appel + phrase lisible) ;
- `app/lib/runtime/ecritures-en-attente-cablage.spec.ts` (ordre du rejeu, garde d'envoi, avis) ;
- `services/api/src/tests/reconciliation-manager-injoignable.spec.ts`.

Contre-épreuves : 11 mécanismes cassés un à un, 11 rouges.

Point OUVERT jusqu'à la preuve en production (déploiement + journaux sans appel sur id de projet).

**30/09 — CORRIGÉ, pas encore prouvé en CI** (la dernière tentative E2E était `cancelled` : elle ne prouve rien). Tests prêts dans la PR ; voir sa description.
