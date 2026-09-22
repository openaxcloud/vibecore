---
id: BUG-A-REVISION-ROUTE-SHADOWED
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Constat

**Ma route de révision n'était jamais atteinte.** Le client visait `/api/projects/:id/files/revision`, or la route splat `api.projects.$id.files.$` capture ce chemin et interprète « revision » comme un **nom de fichier** → 404 `PROJECT_FILE_NOT_FOUND`. Le signal 3 n'était donc pas câblé du tout.

## 📤

✅

## 💻

✅ `99015dca`

## ✅

✅

## Preuve

Point d'entrée déplacé **hors** de `files/` (`/files-revision`) — un projet a le droit d'avoir un fichier nommé `revision`. Vérifié live : 200 `{revision:"2bf7df29…"}`, et le marqueur porte enfin la révision.

