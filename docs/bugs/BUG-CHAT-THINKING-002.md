---
id: BUG-CHAT-THINKING-002
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P0 latent — le contournement de `BUG-CHAT-THINKING-001` est INERTE, et il le sera au retour du crédit Anthropic.** `withThinkingDisabled` (câblé à `stream-text.ts:1036`) écrit `providerOptions` que le fournisseur installé ne lit jamais. Le tier « Economy » route vers `claude-opus-5`, qui émet des blocs de réflexion par défaut ; le SDK installé n'en connaît pas la forme et tue le flux au premier bloc. L'utilisateur voit « Service unavailable ».

## 📤 Dispatché

☑

## 💻 Codé

☑ — montée à `@ai-sdk/anthropic@1.2.12` et **retrait** du contournement.
`app/lib/.server/llm/anthropic-thinking.ts` supprimé, `withThinkingDisabled`
absent de `stream-text.ts` (à `origin/main`, seule occurrence restante du nom :
le spec qui interdit son retour).

## ✅ Testé live

☑ 2026-09-28 — mesuré **dans l'image servie**, pas en local.

## Preuve

**⚠️ Le défaut n'était plus mesurable là où je l'ai d'abord cherché, et j'ai
failli le rouvrir à tort.** Le checkout principal est SALE : son `package.json`
et son `pnpm-lock.yaml` portent `0.0.39` en modification indexée. Lu là, tout
concordait avec l'ancien constat. C'est `origin/main` qui fait foi — il demande
**`1.2.12`** (règle 27).

Mesure du 2026-09-28 sur le SHA servi `d4a6f1df28`, dans les deux images qui
portent le SDK (`kubectl exec`, lecture de fichiers — jamais de variables
d'environnement) :

| Cible | Version | `=== "enabled"` | `=== "disabled"` | `thinking_delta` | témoin `anthropic` |
|---|---|---|---|---|---|
| pod `web` (`/app/node_modules/…`) | **1.2.12** | 1 | **0** | 2 | 80 |
| pod `platform-api` (`/runtime/node_modules/…`) | **1.2.12** | 1 | **0** | 2 | 80 |

Bundle de 41 061 octets dans les deux cas (contre 23 107 au constat du 10/09 :
le paquet a bien changé). `signature` = 11, `redacted-reasoning` = 2.

**La cause réelle, et pourquoi le contournement ne pouvait pas marcher** : le SDK
ne lit `thinking` que pour l'ACTIVER — `=== "enabled"` existe, `=== "disabled"`
n'existe pas. `{ type: 'disabled' }` voulait donc dire « ne pas activer », ce qui
était déjà le défaut. Il n'y a pas d'interrupteur « désactiver la réflexion ».
Le contournement reposait sur une prémisse fausse ; la montée, elle, apprend au
SDK à LIRE les blocs de réflexion au lieu de tuer le flux au premier.

**Épinglé par `app/lib/.server/llm/anthropic-thinking-effectivity.spec.ts`** —
cinq cas : la sentinelle « la sonde lit bien le paquet installé », la cause
(`enabled` présent / `disabled` absent), le gain (`thinking_delta`,
`signature_delta`, `redacted-reasoning`), le retrait du contournement, et le
témoin version déclarée ↔ version installée. ⚠️ Ce spec ne peut pas être lancé
depuis un worktree sans dépendances installées : sa sentinelle rougit en le
disant (règle 27). Les cinq assertions ont donc été vérifiées ici **directement
sur le bundle servi**.
