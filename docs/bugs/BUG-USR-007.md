---
id: BUG-USR-007
---

## Bug

**(P2, a11y WCAG 1.3.1) Ordre des titres cassé (h1→h3).** `/projects`, `/recent-projects`, `/dashboard/templates` sautent de `<h1>` directement à `<h3>` (les cartes projet/template sont des `h3`) sans `<h2>` de section — hiérarchie de titres non conforme (repère lecteur d'écran). `/dashboard` est correct (h1→h2 « Continue building »→h3). Constaté live via audit DOM (skip `1->3`).

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `fix/user-area-batch2` (voir SHA PR)

## ✅ Testé live

☐ *(APRÈS via code, pas déployé)*

## Preuve

AVANT : audit DOM `headingSkips: ["1->3"]` sur les 3 routes. FIX : `<h2 className="sr-only">…</h2>` de section avant chaque grille (h1→h2→h3), design visuel inchangé.

