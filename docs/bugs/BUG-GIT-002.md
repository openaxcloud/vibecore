---
id: BUG-GIT-002
---

## Bug

**P2 — la route `/git` lance à chaque chargement DEUX requêtes vouées à échouer, puis annonce l'espace de travail indisponible.** `useGit()` appelle `runtimeAdapter.startWorkspace()` au montage **sans aucun identifiant** ; hors contexte projet `#workspaceId` est vide, donc le client poste `POST /api/runtime/workspaces` avec le corps **`{}`**. L'API rejette correctement : `400 {"error":"workspaceId ou projectId est requis.","code":"RUNTIME_WORKSPACE_ID_REQUIRED"}`. L'import Git par URL est donc **inopérant** pour tout utilisateur qui atteint `/git` sans espace de travail déjà ouvert dans l'onglet.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**Une requête dont on peut DÉMONTRER qu'elle échouera ne se lance pas.** Vérifié dans la route avant de toucher au client : `POST /api/runtime/workspaces` exige `projectId`, `metadata.projectId` ou `workspaceId` — sans les trois, c'est 400 `RUNTIME_WORKSPACE_ID_REQUIRED`, toujours. L'adaptateur refuse donc maintenant AVANT le réseau, avec un code que l'appelant reconnaît, et `useGit()` dit ce qui manque — un PROJET — au lieu de « l'espace de travail est indisponible », un message qui laissait croire à une panne passagère et invitait à réessayer indéfiniment. **CE QUE LA GARDE A RÉVÉLÉ** : six bancs de `runtime-remote` construisaient un adaptateur SANS identifiant et appelaient `startWorkspace()` — ils ne le voyaient pas parce que leur réseau est simulé, là où le vrai serveur refuse. Ils sont liés comme en production ; les deux bancs dont l'objet EST l'absence de liaison (`hasWorkspaceId()`, refus de recherche) restent intacts — ⚠️ ma première passe les avait liés par un motif aveugle, corrigé banc par banc. Contre-épreuve : garde retirée → rouge sur « ne touche PAS au réseau ». 60/60 sur `runtime-remote`. épinglé par `packages/runtime-remote/src/start-workspace-sans-identifiant.spec.ts`

