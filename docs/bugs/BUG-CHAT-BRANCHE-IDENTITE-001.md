---
id: BUG-CHAT-BRANCHE-IDENTITE-001
---

## Bug

**P2 — basculer de branche de conversation change le FIL mais pas l'IDENTITÉ : le message suivant écrit la transcription de la branche basculée dans la conversation PRÉCÉDENTE.** Même mécanisme que la moitié duplication de CONV-001 — fil et identité découplés — sur un troisième site.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☐ — **non corrigé délibérément : il n'y a pas d'identifiant serveur à adopter, et choisir le comportement est un arbitrage produit**

## ✅ Testé live

☐

## Preuve

**MESURÉ le 10/09.** `useProjectChatBranches.ts:230-245` — `switchTo` fait `saveProjectIdeMemory(projectId, { chat: { id, messages, clearMessages, conversations } })` et ne touche NI `chat.metadata.aiConversationId`, NI `backendAiConversationIdRef`. Vérifié : `grep 'aiConversationId\

