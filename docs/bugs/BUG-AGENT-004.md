---
id: BUG-AGENT-004
---

## Bug

**P0 perte d'intégrité — après une réponse tronquée, la CONTINUATION du modèle est écrite TELLE QUELLE dans le fichier généré : prose de chat + balises `<boltArtifact>`/`<boltAction>` en clair au milieu du code.** Constaté sur `src/lib/taskLogic.test.ts` (171 lignes) : la sortie s'interrompt en plein appel (`expect(validate`), puis le fichier enchaîne littéralement « *Je continue exactement là où je m'étais arrêté dans le fichier de tests…* », `<boltArtifact id="task-tracker-finish" …>`, `<boltAction type="file" filePath="src/lib/taskLogic.test.ts" contentType="content">`, puis **recommence le fichier depuis le début** (bloc d'imports dupliqué lignes 2 et 78). Le fichier ne compile évidemment pas. **Conséquence en cascade** : la continuation ayant redémarré le *fichier de tests* au lieu d'écrire l'implémentation, **`src/lib/taskLogic.ts` n'est jamais généré** alors que `src/App.tsx`, `src/hooks/useTasks.ts` et `src/components/AddTaskForm.tsx` l'importent → Vite rend **500** sur `/src/App.tsx` → **l'aperçu est une page blanche**, pendant que l'agent affiche « Terminé 100 % » et « Le serveur de développement est lancé ». Même famille que `BUG-AGENT-EDIT-TRUNCATION` (délimiteur coupé entre chunks, corrigé le 17/07 pour la balise **fermante**) mais sur le chemin **reprise après troncature**, non couvert.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Env d'audit, ws `ws-8837656e73850f1c`. `sed -n '68,84p' /workspace/src/lib/taskLogic.test.ts` montre la prose et les deux balises en clair dans le fichier. `grep -rn taskLogic /workspace/src` : 3 importeurs (`App.tsx:5`, `AddTaskForm.tsx:3`, `useTasks.ts:4`) pour un module **inexistant** (`ls /workspace/src/lib/` = `fixtures.ts storage.ts taskLogic.test.ts`). Panneau Problèmes de l'IDE : `[vite] Failed to resolve import "./lib/taskLogic" from "src/App.tsx". Does the file exist?` (×4, 20:43). `wget http://<podIP>:5173/src/App.tsx` → **HTTP 500**. Corrélé au transcript : l'action `Créer src/lib/taskLogic.test.ts` est marquée « **Arrêté** » (32,3 s) sans dégrader le statut global (cf. BUG-AGENT-003). **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/lib/runtime/message-parser.css-restart.spec.ts`, `app/lib/runtime/message-parser.restart-continuation.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

