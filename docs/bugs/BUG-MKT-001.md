---
id: BUG-MKT-001
---

## Bug

**P1 — `robots.txt` annonce un sitemap qui n'existe pas.** `public/robots.txt` porte `Sitemap: https://e-code.ai/sitemap.xml` ; cette URL renvoie **HTTP 404**. Le site publie donc son propre pointeur mort : tout robot qui suit la directive tombe sur une erreur et aucune page n'est découverte par ce canal. Repro : `curl -s -o /dev/null -w '%{http_code}' https://e-code.ai/sitemap.xml` → `404`, alors que `curl -s https://e-code.ai/robots.txt \

## 📤 Dispatché

grep Sitemap` renvoie la directive. Tous formats, tous thèmes (indépendant du rendu).

## 💻 Codé

✅ 06/08

## ✅ Testé live

✅ `2a0b4124`

## Preuve

✅ 10/08

