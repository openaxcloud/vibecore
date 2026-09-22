---
id: BUG-AGENT-001
---

## Bug

**P0 — le parcours cœur « prompt → app → aperçu » ne produit pas d'application qui tourne, et le statut ment.** L'agent annonce « Terminé 100 % », coche « Terminé » sur les 20 fichiers et écrit « Le serveur de développement est lancé et l'aperçu affiche immédiatement des données d'exemple réalistes » — alors qu'en réel, au moment où ce statut s'affiche, le runtime est très en retard et **se bloque à 19 fichiers sur 22 pendant plus de 20 min** : `src/App.tsx`, `src/hooks/useTasks.ts` et `src/components/AddTaskForm.tsx` manquent — `src/App.tsx` étant importé par `main.tsx`, l'app **ne peut pas builder** — et **aucun processus Vite n'existe** (`ps aux` dans le pod à T+9 min et T+19 min : uniquement le workspace-agent). ⚠️ **Ni la perte de fichiers ni l'absence de dev server ne sont définitives** : un **rechargement complet de l'IDE** déclenche un reconcile qui pousse les 3 fichiers manquants (`src/App.tsx` présent après reload) puis démarre enfin Vite — mais **47 min après** l'annonce « le serveur de développement est lancé ». Le bouton « Actualiser les fichiers » de l'IDE, lui, ne répare rien : seul un rechargement de page le fait. Le défaut est donc un **statut mensonger doublé d'un blocage qui ne se débloque qu'au rechargement** : pendant ~47 min l'utilisateur voit un run « Terminé 100 % » dont l'aperçu est vide. Cause racine mesurée : amplification d'écritures ×37 (**750 `PUT /files/write` pour 20 fichiers**). Le garde `if (!doc)` de `workbench.ts:2880-2885` ne se referme jamais pendant le streaming, car `EditorStore.updateFile` (`app/lib/stores/editor.ts:89-95`) sort en no-op quand le document n'existe pas et **ne le crée pas** → un PUT du fichier entier part à chaque tick de 100 ms (`ACTION_STREAM_SAMPLE_INTERVAL_MS`, `workbench.ts:151`+`3444`). Les écritures streaming **contournent** la file d'exécution (`workbench.ts:2746-2752`) que l'écriture finale emprunte : un *trailing* partiel peut écraser la version complète, et `abortStreamingFileActions` (`Chat.client.tsx:745` → `action-runner.ts:791-795`) annule les écritures autoritatives encore en file → fichiers jamais écrits.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Env de test `vibecore-audit-test-20260807`, images `api:1c68880b39` / `web:df1287d856`, projet `cmsusbw8q00040nbf7dddmsq1` / ws `ws-8837656e73850f1c`, compte `qa-loop-1786822972@local.test`. Convergence mesurée dans le pod par échantillonnage `find /workspace` (relevés 19:54:19 → 20:08:44 UTC) : 10 → 13 → 17 → 19 fichiers, puis **bloquée à 19/22 pendant >20 min** ; manquants à T+20 min : `src/App.tsx`, `src/hooks/useTasks.ts`, `src/components/AddTaskForm.tsx`. Absence de dev server établie par `ps aux` dans le pod à 19:58 et 20:08 UTC (aucun `vite`, aucun `npm run dev` — uniquement le workspace-agent). **Après rechargement complet de l'IDE** : 21 fichiers dans le pod, `test -f /workspace/src/App.tsx` → **YES**, et Vite démarre — `/proc/<pid>/stat` situe son lancement à **~20:36 UTC**, soit **47 min** après l'annonce de fin de l'agent (19:49). Vite sert alors correctement sur l'IP du pod (`http://10.20.0.5:5173/` → HTML complet avec react-refresh). ⚠️ **Piège de mesure à retenir** : Vite écoute en **IPv6 seul** (`:::5173`) et `::1` est indisponible dans le bac à sable gVisor — un test en `127.0.0.1:5173` rend un faux `Connection refused` ; **tester sur l'IP IPv4 du pod**. Le défaut est donc le **retard + le statut mensonger**, pas une perte définitive. Logs API : **750** `PUT …/files/write` (tous 204) pour 20 fichiers. **Le code fautif est identique sur `origin/main`** (`ACTION_STREAM_SAMPLE_INTERVAL_MS` l.157, sampler l.3490-3492, `runAction(data, true)` sous `if (!doc)` l.2915) — défaut non introduit par la branche d'audit. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/lib/runtime/action-runner.spec.ts`, `app/lib/stores/agent-patch-flood-guard.spec.ts`, `app/lib/stores/workbench.stream-write-amplification.spec.ts`, `packages/runtime-remote/src/index.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

