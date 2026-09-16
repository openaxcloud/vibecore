---
id: BUG-AGENT-003
---

## Bug

**P1 — les 5 sous-agents parallèles échouent tous, le consensus est rejeté à 0 %, et le run est quand même affiché « Terminé 100 % ».** Le panneau Agent affiche « Plan 0/5 terminées », les cinq voies (Architecte, Frontend, Backend, DevOps, QA) portant chacune « Cet agent spécialisé n'a pas pu terminer sa tâche », et « Consensus · quorum · **Rejeté** · 0 % d'accord » — pendant que l'en-tête du run affiche « Agent · **Terminé** · **100 %** ». Statut malhonnête : un échec total de la voie multi-agents est présenté comme un succès complet. La dernière action fichier (`src/lib/taskLogic.test.ts`) est en outre marquée « **Arrêté** » (32,3 s) sans que cela dégrade le statut global.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Même run que BUG-AGENT-001 (projet `cmsusbw8q00040nbf7dddmsq1`). Relevé textuel du panneau Agent, format desktop 1440. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/components/chat/bundled-artifact-state.spec.ts`, `app/components/chat/qa-status-truth.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

