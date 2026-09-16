---
id: BUG-UX-019
---

## Bug

**P2 — le panneau STOCKAGE D'OBJETS reste sur « Vérification du stockage d'objets… » À VIE quand la sonde échoue, sans jamais afficher l'erreur.** L'utilisateur voit un chargement perpétuel là où le service est en panne depuis 30 s.

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

☐ *(corrigé ; à revalider live après déploiement)*

## Preuve

**Constaté live 17/08** en mobile 390 **et** desktop 1440 : le panneau affiche « Vérification du stockage d'objets… » indéfiniment (relevé encore identique après 30 s d'attente), alors que la sonde d'état a déjà répondu `500` (voir **BUG-STORAGE-002**). **Cause racine** : `app/components/chat/BaseChat.tsx` — le rendu est piloté par `enabled === null` (« Vérification… ») ; or `loadStatus()` sortait **sans jamais fixer `enabled`** (`if (!result) return;`) et n'avait **aucun `try/catch`**. Toute sonde non résolue laissait donc l'état à `null`, c'est-à-dire le chargement perpétuel. **Correctif** : `loadStatus()` traite désormais l'échec comme une réponse — `result` absent **ou** porteur d'un champ `error`, ainsi que toute exception, basculent le panneau en état connu (`enabled=false`) et affichent le message existant `baseChatAst.storage.unreachable` (« Impossible de joindre le stockage d'objets. » / « Object Storage could not be reached. »), déjà présent dans les deux catalogues.

