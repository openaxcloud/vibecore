---
id: BUG-MKT-013
provenance: "extraite de la proposition #116, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P2 — décalage de mise en page sur les captures produit.** `ProductCapture` rendait ses images en `loading="lazy"` et `h-auto w-full` **sans `width`/`height`** : le navigateur ne pouvait réserver aucune hauteur, donc tout le contenu situé en dessous sautait à l'arrivée de l'image. Portait aussi un `sizes` sans `srcset`, donc sans effet. Touche `/community` et `/templates`.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `fix/mkt-flows`

## ✅ Testé live

☐

## Preuve

`width`/`height` rendus **obligatoires par le typage** — un futur appel qui les oublierait ne compilerait pas. **Preuve réelle** : `/community` → 1200×747, `/templates` → 1440×900 ; ratio déclaré **identique** au ratio intrinsèque (1,606 et 1,600), donc la place réservée est exacte.

