---
id: BUG-TERM-002
---

## Bug

**P1 — le client forge un `sessionId` NEUF à chaque tentative de connexion, donc le terminal du navigateur ne peut jamais se rattacher.** `packages/runtime-remote/src/index.ts:505` : ``const terminalId = `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;`` est évalué **à l'intérieur de `openTerminal()`** — chaque (re)connexion produit donc une identité différente. Conséquence : le workspace agent, qui indexe ses sessions par `sessionId`, crée un shell neuf à chaque fois, jamais de reattach, et le budget `maxSessions` (8) s'épuise. **Ce défaut est en AVAL de BUG-TERM-001** : la correction serveur (propagation de la query, `83dc77cf`) relaie désormais fidèlement l'identifiant — et c'est prouvé, un harnais qui réutilise le MÊME `sessionId` obtient bien **0 shell créé** sur les 2ᵉ et 3ᵉ connexions. Mais le navigateur, lui, n'en réutilise jamais aucun : la correction serveur est **nécessaire mais pas suffisante**. S'y ajoute une **boucle de reconnexion serrée** : **6 `sessionId` distincts émis dans la MÊME seconde**. Symptôme visible : le panneau reste sur « Connexion à l'espace de travail… » puis affiche `[terminal disconnected — reload or click Run to reconnect]`.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 16/08**

## Preuve

Env d'audit, ws `ws-4ede79018e4587c6`, **avec les deux correctifs déployés** (`api:59818de207`, `web:9e8efa4f86`, 2/2 chacun — déploiement re-vérifié intact après la bascule temporaire de la session parcours). Logs API sur 6 min : **12 `sessionId` distincts** de la forme `terminal-<timestamp>-<random>`, dont **six horodatés dans la même seconde** (`…987032`, `…987076`, `…987472`, `…987524`, `…987812`, `…987875`) ; **45× `429`** et **5 shells** dans le pod. Correctif attendu : conserver un `sessionId` **stable par panneau de terminal** à travers les reconnexions (le dériver de l'identité du pane, pas de `Date.now()`), et **temporiser** les tentatives au lieu de boucler. ⚠️ Piège de mesure associé : sonder sans `managed=1` fait rejeter la connexion en **429 quota**, ce qui imite un rattachement réussi (0 shell créé) tout en ne renvoyant aucune sortie. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/styles/mobile-terminal-frozen.spec.ts`, `packages/runtime-remote/src/terminal-session-key.spec.ts`, `packages/runtime-remote/src/terminal-session-wiring.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

