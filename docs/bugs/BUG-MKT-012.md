---
id: BUG-MKT-012
provenance: "extraite de la proposition #116, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P1 — le corps des pages marketing n'est pas rendu côté serveur.** En **production**, `https://e-code.ai/pricing` sert ~21 Ko contenant `<main>Loading E-Code</main>` et **0** `<h1>`, `<h2>`, `<h3>`, `<section>`, `<button>`, `<article>`, `<nav>`, `<footer>`. Tout le contenu visible est produit après hydratation. Les crawlers et scrapers sociaux qui n'exécutent pas JS ne voient donc aucun contenu. Repro : `curl -s https://e-code.ai/pricing \

## 📤 Dispatché

grep -c '<h1'` → `0`.

## 💻 Codé

✅ 06/08

## ✅ Testé live

☐ **non corrigé — architecture**

## Preuve

☐

