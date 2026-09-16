---
id: BUG-RUNTIME-COLD-START-001
---

## Bug

**Le chemin d'écriture constatait l'absence d'espace de travail sans jamais le créer.** Mesuré le 2026-08-30 en production sur un projet créé la minute d'avant : `PUT /api/runtime/workspaces/<projet>/files/write` → **425 en UNE seconde**, sans qu'aucune demande n'atteigne le workspace-manager ; 25 minutes plus tard, toujours aucune ligne `Workspace`. **Cause** : `agentRequest` produit deux codes pour la même situation — `WORKSPACE_AGENT_REQUEST_FAILED` (le pod ne répond pas) et `WORKSPACE_NOT_STARTED` (son nom DNS ne résout pas encore). `agentMutateEnsuring` ne relançait le provisionnement que sur le premier. Or un pod qui n'a **jamais** existé ne résout jamais : il tombait toujours dans la branche qui ne provisionne pas — celle-là même ajoutée pour mieux décrire un démarrage en cours. **Corrigé par PR #268** (budget d'attente inchangé).

## 📤 Dispatché

🔴

## 💻 Codé

✅ PR #268

## ✅ Testé live

☐

