---
id: BUG-IDE-003
---

## Bug

**Ports — le panneau ne liste jamais aucun port.** `GET /api/runtime/workspaces/:id/ports` répond un **tableau nu** ; le loader faisait `{...(runtimePorts as any)}` → `[{port:5173}]` devenait `{0:{port:5173}}`. Côté UI `runtimePortsFromPayload` n'accepte qu'un tableau ou `.ports` → toujours `[]`. Le fallback d'erreur du loader (`{ports: []}`) montrait la forme attendue.

## 📤 Dispatché

✅

## 💻 Codé

✅ mergé `f5e75ee2` (PR #119, branche `fix/cluster-b-ide-panels`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **06/08** reproduit live

## Preuve

Port réellement ouvert au moment de la capture : runtime → `[{"port":5173,"ready":true,"url":"https://…-5173.preview.e-code.ai/"}]`, et l'URL **sert la vraie app** (HTTP 200, `<title>qa-clusterb</title>`, `id="root"`, `main.tsx`) en public ET via proxy authentifié ; payload panneau `keys = ['0','portsState','workspaces','selectedWorkspaceId','workspaceId']` ; UI → « **No ports detected yet** » sur **web 1280, tablette 768 ET mobile 375**, alors que la barre de statut affiche bien `5173`. Le panneau **Terminal** reçoit `runtimePorts` correctement → défaut isolé au loader Ports. Correctif : helper exporté `normalizeRuntimePorts()` ; 4 tests dont un verrouillant la non-régression de `{0: …}`. `LAUNCH_READINESS.md`

