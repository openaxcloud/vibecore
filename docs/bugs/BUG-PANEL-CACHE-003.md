---
id: BUG-PANEL-CACHE-003
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**Défaut de code réel, préjudice utilisateur NON reproduit — désormais CORRIGÉ et tenu par des tests.** `loadPanel` détectait `status === 'error'` puis mettait quand même l'enveloppe en cache deux lignes plus bas, alors que le cache est documenté « last SUCCESSFUL payload ». La reproduction live a ÉCHOUÉ (le rafraîchissement silencieux périodique réécrit l'entrée avant qu'elle ne nuise) — c'est un défaut latent, pas un défaut observé.

## 📤

—

## 💻

✅

## ✅

❌ (latent, pas observable en réel)

## Preuve

Cache extrait dans `app/lib/ide/panel-payload-cache.ts` **sans changement de comportement** (il vivait en privé dans un fichier de 23 800 lignes — d'où zéro test). Garde ajoutée + `panel-payload-cache.spec.ts` : **7 tests verts**, dont 3 témoins et 2 contre-épreuves d'over-blocage (`status:'empty'` doit RESTER caché). **Contre-épreuve dans les deux sens (règle 6) : garde retirée → 3 tests rouges ; garde remise → 7 verts.**

