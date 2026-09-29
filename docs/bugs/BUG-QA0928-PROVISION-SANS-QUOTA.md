---
id: BUG-QA0928-PROVISION-SANS-QUOTA
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**OBSERVÉ DANS LE CODE, À CONFIRMER — une écriture adressée à un workspace arrêté le fait redémarrer sans vérifier le quota `workspaces.active`.**

`POST /api/runtime/workspaces` passe par `ensureQuota(request, org, 'workspaces.active')`. Mais une
mutation runtime (`agentMutateEnsuring` → `ensureWorkspaceReachable` → `provisionWorkspaceOnDemand`,
`services/api/src/app.ts`) redémarre le pod d'un workspace injoignable en appelant directement
`managerRequest('/workspaces/start')`, **sans** `ensureQuota`.

Conséquence possible : un compte gratuit dont le créneau est tenu par le projet A écrit dans un
workspace `ws-…` du projet B arrêté (onglet resté ouvert, pod ramassé par le GC) → second pod actif,
au-delà de la limite du forfait.

C'est aussi pourquoi le correctif de BUG-QA0928-RUNTIME-ID-PROJET n'a PAS consisté à élargir le
ticket runtime pour accepter l'identifiant du projet : chaque écriture refusée pour quota aurait
alors provisionné un pod.

## Repro

Non reproduit (demande un pod réel). Lecture : `provisionWorkspaceOnDemand` ne contient aucun appel
à `ensureQuota` ; `POST /api/runtime/workspaces` en contient un.

À confirmer en production : compte gratuit, projet A ouvert, onglet du projet B laissé ouvert
jusqu'au ramassage de son pod, puis une écriture dans B → compter les workspaces `RUNNING` de l'org.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Lecture du code uniquement — point OUVERT.
