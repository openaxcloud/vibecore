---
id: BUG-BRAND-001
---

## Bug

Le splash pré-hydratation « Loading E-Code » affiche encore le carré orange hérité de bolt.diy sur l’IDE et les pages marketing ; audit complet favicon/PWA/OG/title/assets requis

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

Correctif `b1404989` poussé sur `main` ; déploiement `29346264927` vert. Test pré-hydratation réel sur `app.e-code.ai` et `e-code.ai`, clair/sombre : 4/4 PASS, SVG inline, variante exclusive correcte, zéro image externe et zéro carré legacy. Captures + rapport : `docs/ui-ux-evidence/2026-07-14/branding-splash/`.

