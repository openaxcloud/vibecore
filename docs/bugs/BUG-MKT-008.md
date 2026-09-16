---
id: BUG-MKT-008
---

## Bug

**P2 — `twitter:title` / `twitter:description` absents.** Seules les balises image étaient émises : la carte Twitter affichait donc un titre DEVINÉ dans le corps de la page. Repro : `curl -s https://e-code.ai/pricing \

## 📤 Dispatché

grep -c 'name="twitter:title"'` → `0`.

## 💻 Codé

✅ 06/08

## ✅ Testé live

✅ `2a0b4124`

## Preuve

✅ 10/08

