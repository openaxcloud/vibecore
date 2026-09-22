---
id: BUG-QA-STREAM-CHOPPY-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**= BUG-AGENT-STREAM-JUMP** — « l'agent quand il affiche les messages ça saute, ça jump, impossible de lire ». Le serveur envoie le texte par **gros blocs** : ~110 caractères toutes les ~700 ms (14 chunks sur 9,36 s, écart médian **695 ms**). Entre deux blocs le client n'a rien à peindre, donc la transcription avance par sauts visibles. **nginx est disculpé** (même cadence mesurée depuis l'intérieur du pod) et le lissage client à 40 ms **ne peut pas fabriquer des trames qui ne sont jamais arrivées** : seul le serveur peut les subdiviser. `smoothStream` est un transform de première classe du SDK `ai` 4.3.16, **disponible mais câblé nulle part**.

## 📤

✅

## 💻

✅ **`5cf54455` sur `main`**

## ✅

✅ **12/08**

## Preuve

Câblé en `experimental_transform: smoothStream({ chunking: 'word' })` sur `streamParams` (`app/lib/.server/llm/stream-text.ts`), donc sur **tous** les appelants — `api.chat`, `api.agent.self-repair`, `api.enhancer`, `api.llmcall` passent tous par ce wrapper. Placé **avant** `...filteredOptions` pour qu'un appelant puisse le surcharger. **Effet mesuré en rejouant la cadence réelle à travers le transform** : **AVANT 14 trames de 110 caractères → APRÈS 154 trames, 10 caractères au maximum (×11)**, texte **identique octet pour octet**. Rapporté aux 9,36 s mesurées, l'écart médian passe de **695 ms à ~61 ms** (objectif : ≪ 100 ms). Tests `stream-smoothing.spec.ts` **5/5**, rouge→vert vérifié (sans le câblage, les 2 tests de câblage échouent) ; voisinage LLM **20 fichiers / 249 tests** verts.

