---
id: BUG-DEBUG-I18N-001
---

## Bug

**P2 — panneau Débogueur : « Ajouter une montre » (watch → montre-bracelet) et « Regarder les expressions » (Watch expressions)** ; « Sortie de l’environnement d’exécution » affiche des lignes JSON brutes du workspace-agent, tronquées et corrompues (« …"port":5173,' failed"} »), répétées — `preview.proxy.unreachable` port 5173 (capture 05/09 23:01). Deux défauts : la traduction, et une sortie brute là où il faut une ligne lisible (niveau, service, événement, port). Le `preview.proxy.unreachable` lui-même est à examiner : l'aperçu n'était pas joignable à ce moment.

## 📤 Dispatché

☑ 05/09

## 💻 Codé

☑ 06/09 (`main`) — traductions corrigées (« Surveiller cette expression », « Expressions à surveiller », « Expressions surveillées ») ; `app/lib/ide/runtime-log-line.ts` rend niveau · service · événement · port, JSON valide ou tronqué. Épinglé par `runtime-log-line.spec.ts`. Le `preview.proxy.unreachable` reste à examiner en réel.

## ✅ Testé live

☐

## Preuve

Capture iPhone 23:01.

