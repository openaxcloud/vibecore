---
id: BUG-CHAT-THINKING-002
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P0 latent — le contournement de `BUG-CHAT-THINKING-001` est INERTE, et il le sera au retour du crédit Anthropic.** `withThinkingDisabled` (câblé à `stream-text.ts:1036`) écrit `providerOptions` que le fournisseur installé ne lit jamais. Le tier « Economy » route vers `claude-opus-5`, qui émet des blocs de réflexion par défaut ; le SDK installé n'en connaît pas la forme et tue le flux au premier bloc. L'utilisateur voit « Service unavailable ».

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

**Re-mesuré le 10/09, lecture directe de `node_modules/@ai-sdk/anthropic/dist/index.js` (23 107 octets, témoin positif : 37 occurrences de « anthropic »)** — `providerOptions` = **0**, `thinking` = **0**, `signature` = **0**. Version installée `@ai-sdk/anthropic@0.0.39`, celle que `package.json` épingle. **Le défaut est donc réel et actuel, ce n'est pas un test périmé.** Épinglé par `app/lib/.server/llm/anthropic-thinking-effectivity.spec.ts`, qui échoue en le disant. ⚠️ **Il est MASQUÉ depuis que le crédit Anthropic est épuisé** : aucun tour opus ne part, donc aucun bloc `thinking` n'arrive. Au rechargement du crédit, les générations « Economy » retomberont dessus immédiatement. ⚠️ Les trois rouges observés depuis un worktree sont un ARTEFACT : le spec lit un chemin relatif au `cwd` et `node_modules/` n'existe pas dans un worktree — sa sentinelle « la sonde lit bien le paquet installé » a fait exactement son travail.

