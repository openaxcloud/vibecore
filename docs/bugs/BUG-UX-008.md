---
id: BUG-UX-008
---

## Bug

Les dates et nombres de la user area utilisent la locale implicite du navigateur ou du serveur au milieu d'une interface anglaise

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`44e89509` introduit les formateurs déterministes `en-GB`/UTC et `795c00b1` migre les surfaces hors IDE avec un garde-fou contre les `toLocale*` implicites. Vérifié avec un navigateur forcé en `fr-FR` : Playwright vert sur 1440/1024/768/390, clair/sombre, captures `user-area-locale-*`; 518 fichiers et 3 862 tests verts, typecheck/lint/build verts.

