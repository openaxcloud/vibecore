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

☑ 30/09 fusionnée `c976cb618` (#628, lot #616 + #621 + #628)

## ✅

☐

## Preuve

Lecture du code uniquement — point OUVERT.

**30/09 — REPRODUIT puis CORRIGÉ (#628)** : reproduit en vraie API (lecture sur l'espace éteint du projet B → 1 démarrage au-delà du quota ; écriture → 425 et démarrage). Épinglé par `services/api/src/tests/provision-respecte-le-quota.spec.ts` (7 cas, contre-épreuves dans les deux sens), vert en CI à la 1re tentative.
