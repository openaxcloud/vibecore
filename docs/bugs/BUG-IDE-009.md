---
id: BUG-IDE-009
---

## Bug

**P1 — PANNEAU WORKFLOW : le bouton Exécuter échoue sur TOUT projet neuf.** L'unique flux dont chaque projet hérite (« Démarrer le serveur de développement », marqué *Généré* / *Bouton Exécuter*) ne contient qu'une tâche : `npm run dev`. Un espace de travail fraîchement provisionné porte les SOURCES du projet mais **pas `node_modules`** — la commande meurt donc sur `sh: vite: not found`, **code de sortie 127**. Le panneau Workflow ne fonctionne littéralement jamais à la sortie de la boîte.

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

☐ *(corrigé + rouge→vert unitaire ; à revalider live après déploiement)*

## Preuve

**Repro live 17/08** — env d'audit `1c68880b39`, projet réel créé depuis le modèle « React SaaS » (`cmsxd9jwy00540ngvme46r9ts`, ws `ws-7e8d7bd2a9e13f44`), panneau `?panel=workflows`, clic sur le bouton d'exécution. Historique du panneau : `ÉCHEC · 899 ms` puis `ÉCHEC · 22 s`, queue de sortie littérale : `> orbit-crm-demo@1.0.0 dev` / `> vite --host 0.0.0.0` / **`sh: vite: not found`**. Absence de dépendances confirmée en parallèle par `404 GET /api/runtime/workspaces/ws-…/files?path=node_modules`. **Cause racine** : `app/routes/api.projects.$projectId.ide-panel.$panel.ts` → `defaultWorkflowsState()` sème le flux système avec une seule tâche `npm run dev`, sans aucune étape d'installation. **Correctif (2 volets)** : (1) la semence comporte désormais une étape d'installation **gardée** — `[ -d node_modules ]

