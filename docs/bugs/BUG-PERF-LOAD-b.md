---
id: BUG-PERF-LOAD
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

(mise à jour) **Le barrel `@vibecore/editor` dans le graphe de la route racine** — 1ʳᵉ cause, corrigée.

## 📤 Dispatché

✅

## 💻 Codé

✅ `df8eb531` **sur `main`**

## ✅ Testé live

✅ **12/08**

## Preuve

**AVANT** (artefact `main` `2c104f24b7` déployé sur l'env de test, mesure serveur sans cache) : 110 assets référencés, **1 971 Ko**, chunks IDE **926 Ko** (`vendor-monaco-core` 573 + `vendor-codemirror` 257 + `vendor-terminal` 82 + CSS). Navigateur réel : 118 requêtes, 2 113 Ko transférés, **8 101 Ko décodés**. **APRÈS** (image `web:perffix001`, même env, même mesure) : 109 assets, **1 705,5 Ko**, chunks IDE **666,9 Ko** — **`vendor-codemirror` (257 Ko) totalement disparu de la liste de préchargement**, sur **toutes** les pages. Le build Docker réel valide le sous-chemin `@vibecore/editor/install-pwa-sw`. Garde `app/lib/perf/root-route-graph.spec.ts` 3/3, rouge→vert vérifié (1/3 échoue si `root.tsx` réimporte le barrel).

