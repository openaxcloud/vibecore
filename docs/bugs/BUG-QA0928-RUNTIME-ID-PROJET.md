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

## Correctif suggéré (non appliqué — balayage seulement)

1. Ne jamais initialiser l'adaptateur avec `projectId` comme `workspaceId` ; tant qu'aucun `ws-…`
   n'est connu, les opérations doivent **attendre** le démarrage (ou échouer avec un code dédié),
   pas partir.
2. Si le démarrage échoue, bloquer les écritures de l'agent et le dire (l'invite de quota existe
   déjà : `workspaceQuotaPrompt`).
3. Côté API, distinguer « ticket invalide » de « workspace hors du périmètre du ticket » (`403` avec
   un code), pour que le client ne re-frappe pas un ticket sain.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Preuve prod ci-dessus (journaux). Aucun test ne l'épingle encore — point OUVERT (règle 16).
