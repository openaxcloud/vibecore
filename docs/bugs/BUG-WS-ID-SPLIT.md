---
id: BUG-WS-ID-SPLIT
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
annotation: "/ BUG-IDE-001"
---

## Bug

**Deux schémas de nommage de workspace.** L'écriture allait dans `workspace-<cuid>` pendant que le build provisionnait `workspace-ws-<hash>`, **vide** → `ENOENT package.json`. 8 sites dérivaient l'id au lieu de le résoudre.

## 📤

✅

## 💻

✅ `d5cf930d`

## ✅

✅

## Preuve

Option **D1**. Le cas « projet à plusieurs workspaces » est tranché d'abord : le schéma dit lui-même qu'un projet garde plusieurs checkouts de dev, le primaire étant le plus ancien (définition déjà utilisée par `resolveGitWorkspaceId`). Garde-fou : ne JAMAIS adopter un id dérivé d'autrui — la table n'a pas de colonne `userId`, l'id est la seule trace du propriétaire. `workspace-identity.spec.ts` 14/14 ; 183 fichiers / 1587 tests.

