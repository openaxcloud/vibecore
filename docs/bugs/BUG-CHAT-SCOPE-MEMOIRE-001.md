---
id: BUG-CHAT-SCOPE-MEMOIRE-001
---

## Bug

**P2 — `BaseChat` LIT la mémoire d'IDE dans un scope que le chat n'ÉCRIT jamais, donc l'identifiant de conversation vivante y est TOUJOURS vide.** Conséquence visible : dans « Conversation history », la conversation COURANTE apparaît en doublon — le filtre censé la retirer (`BaseChat.tsx:5122`, `conversation.id !== activeConversationId`) ne retire jamais rien.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☐ — **je n'ai pas corrigé : décider quel scope fait autorité est un arbitrage, pas une évidence**

## ✅ Testé live

☐

## Preuve

**MESURÉ le 10/09, chemin lu et non déduit.** `projectIdeMemory.ts:276-284` : `scopeKey(projectId, workspaceId)` rend `workspace:<id>` OU `projectId`, et `scopeEndpoint` route vers deux ENDPOINTS distincts. `getProjectIdeMemory` (`:863-885`) lit `memoryCache.get(scopeKey(...))` **sans aucun repli croisé**. Or `BaseChat.tsx:5171` appelle `getProjectIdeMemory(safeProjectId, safeWorkspaceId)` tandis que TOUT le chat écrit au scope nu — `useChatHistory.ts:133/474/566`, `Chat.client.tsx:534/938/1090/2304/2346`. Témoin règle 14 : `grep -c 'currentWorkspaceId,' BaseChat.tsx` → **9** (la recherche fonctionne) ; le même motif sur `useChatHistory.ts` → **0**. `currentWorkspaceId` est bien posé en production (`projects.$projectId.ide.tsx:124-127`). Le doublon visuel est donc **permanent et préexistant**, et il SURVIT au correctif de duplication de CONV-001 — ce que le patch d'origine affirmait à tort réparer. **Deux correctifs légitimes s'excluent** : faire écrire le chat dans le scope workspace, ou faire lire `BaseChat` au scope nu. Le premier suit le contexte d'exécution, le second suit la propriété de la donnée (une conversation appartient au PROJET, pas au workspace qui l'a servie). Trancher demande de savoir ce qui doit survivre à un changement de workspace — c'est une décision produit.

