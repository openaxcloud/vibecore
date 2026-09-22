---
id: BUG-USR-009
---

## Bug

**(P2) Nom de projet whitespace-only / trop long accepté.** `POST /orgs/:org/projects` et `PATCH /projects/:id/settings` : le nom vide est bien rejeté (400 `min(1)`), mais `"   "` (espaces) **passait** `min(1)` → projet créé littéralement nommé `"   "` (slug `project`) ; aucune borne max (nom de 400 car. accepté). Constaté live (compte QA jetable, API réelle).

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `fix/user-area-flows` (voir SHA PR)

## ✅ Testé live

☐ *(AVANT live API prod ; APRÈS spec + CI, pas déployé)*

## Preuve

AVANT : `POST …/projects {"name":"   "}` → **201** (projet nommé « », slug « project ») ; `{"name":"A"×400}` → **201**. FIX : `z.string().trim().min(1).max(200)` (create + rename) → whitespace/trop-long **400**, nom valide **trimmé**. APRÈS : `user-area-flows.spec.ts` 5/5 (empty 400, whitespace 400, >200 400, padded trimmé, rename whitespace 400).

