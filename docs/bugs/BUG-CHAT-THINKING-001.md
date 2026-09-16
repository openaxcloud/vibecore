---
id: BUG-CHAT-THINKING-001
---

## Bug

**P0 — « Une erreur inattendue est survenue pendant la génération » (500, `UNKNOWN`) sur le tier Puissance.** Journaux du pod **web** (c'est lui qui sert `/api/chat`, pas le service `api`) : `stream onError code=UNKNOWN (Type validation failed: Value: {"type":"content_block_start","content_block":{"type":"thinking",…}})`, puis `thinking_delta` et `signature_delta`. **Cause** : `claude-fable-5` émet des blocs de réflexion étendue ; `@ai-sdk/anthropic` **0.0.39** (très en retard sur `ai@4.3.16`) ne connaît pas ces événements, sa validation de schéma les rejette et le flux meurt au premier d'entre eux. Le HTTP est pourtant **200** — le flux démarre puis meurt, d'où l'intermittence : seules les générations où le modèle réfléchit échouent. **Ni timeout, ni clé API, ni 5xx fournisseur, ni parsing d'outil.** Contournement : demander explicitement `thinking: { type: 'disabled' }`. Vrai correctif : monter le SDK puis réactiver la réflexion.

## 📤 Dispatché

☑

## 💻 Codé

☑ *(contournement)*

## ✅ Testé live

☐ **Constaté live 18/08 16:06 UTC**

## Preuve

Journaux pod web, projet `cmsy68rek00060nbe8i3966kl` ; `app/lib/.server/llm/anthropic-thinking.ts`

