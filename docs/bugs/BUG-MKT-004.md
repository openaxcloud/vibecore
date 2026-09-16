---
id: BUG-MKT-004
---

## Bug

**P2 — `og:title` manquant sur 4 pages.** `/solutions`, `/terms`, `/privacy`, `/changelog` n'émettent pas `<meta property="og:title">` alors que les 8 autres pages testées le font. Partagées sur un réseau social, ces pages n'affichent pas de titre maîtrisé. Repro : `curl -s https://e-code.ai/terms \

## 📤 Dispatché

grep -c 'property="og:title"'` → `0`.

## 💻 Codé

✅ 06/08

## ✅ Testé live

✅ `2a0b4124`

## Preuve

✅ 10/08

