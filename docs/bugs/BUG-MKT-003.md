---
id: BUG-MKT-003
---

## Bug

**P2 — aucun `<link rel="canonical">` sur les pages marketing.** Vérifié sur 12 pages (`/`, `/pricing`, `/features`, `/solutions`, `/enterprise`, `/about`, `/contact`, `/blog`, `/terms`, `/privacy`, `/careers`, `/changelog`) : 0 balise canonique. Avec la négociation de langue servant deux contenus sur la même URL, l'absence de canonical laisse les moteurs arbitrer seuls.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `2a0b4124`

## ✅ Testé live

✅ 10/08

## Preuve

Non corrigé : à traiter avec BUG-MKT-002 (le canonical doit refléter la stratégie de langue retenue, sinon il faudra le réécrire deux fois). **✅ Testé live 10/08 (prod `e-code.ai`)** — audit SEO réel sur 12 pages marketing (`/`, `/pricing`, `/features`, `/solutions`, `/enterprise`, `/about`, `/contact`, `/blog`, `/terms`, `/privacy`, `/careers`, `/changelog`), toutes HTTP 200. **Vérifié** : `<link rel="canonical">` présent sur **12/12** (constat initial : 0/12), et émis en **https** — correctif `defb3dd9` (`X-Forwarded-Proto` honoré, TLS terminant sur l'ingress) : `https://e-code.ai/pricing`.

