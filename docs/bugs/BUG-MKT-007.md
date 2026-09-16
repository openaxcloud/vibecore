---
id: BUG-MKT-007
---

## Bug

**P2 — `og:type` et `og:site_name` absents.** Sans `og:type`, les agrégateurs devinent la nature de la page ; sans `og:site_name`, la marque n'apparaît pas dans l'aperçu.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `2a0b4124` (branche `fix/mkt-sitemap`, merge `6f97a890`)

## ✅ Testé live

✅ 10/08

## Preuve

Ajoutés au helper (`website` par défaut, `article` disponible pour le blog). **Preuve réelle** : 15/15 pages. **✅ Testé live 10/08 (prod `e-code.ai`)** — audit SEO réel sur 12 pages marketing (`/`, `/pricing`, `/features`, `/solutions`, `/enterprise`, `/about`, `/contact`, `/blog`, `/terms`, `/privacy`, `/careers`, `/changelog`), toutes HTTP 200. **Vérifié** : `og:type` ET `og:site_name` présents sur **12/12**.

