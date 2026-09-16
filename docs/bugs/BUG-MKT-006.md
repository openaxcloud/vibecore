---
id: BUG-MKT-006
---

## Bug

**P2 — `og:url` absent de toutes les pages.** Un partage social ne portait pas l'adresse canonique de la page ; les agrégateurs retombaient sur l'URL de partage (souvent suffixée d'UTM). Repro : `curl -s https://e-code.ai/pricing \

## 📤 Dispatché

grep -c 'property="og:url"'` → `0`.

## 💻 Codé

✅ 06/08

## ✅ Testé live

✅ `2a0b4124`

## Preuve

✅ 10/08

