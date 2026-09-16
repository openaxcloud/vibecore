---
id: BUG-MKT-009
---

## Bug

**P2 — les pages 404 étaient indexables.** Aucune balise `robots` n'était servie sur une URL inexistante : une page « introuvable » pouvait entrer dans un index. Repro : `curl -s https://e-code.ai/page-inexistante-xyz \

## 📤 Dispatché

grep -c 'name="robots"'` → `0`.

## 💻 Codé

✅ 06/08

## ✅ Testé live

✅ `2a0b4124`

## Preuve

✅ 10/08

