---
id: BUG-AGENT-BANDEAU-ARRET-FAUX-001
---

## Bug

**P2 — le bandeau « la génération s'est arrêtée en route » s'affiche après un tour qui a RÉUSSI.** Remonté par la session mobile le 2026-09-30.

## 📤 Dispatché

☑ 2026-09-30 — consigné par la session livraisons, à reprendre.

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**Non encore mesurée par cette session.**

Le bandeau vient du constat d'honnêteté de génération (`generationEstHonnete`, `app/lib/runtime/generation-incomplete.ts`), consommé par `AppliedFilesToast`. Il a été ajouté pour empêcher un mensonge inverse — annoncer un succès sur une génération qui n'avait pas produit son point d'entrée.

**La piste à mesurer avant tout correctif** : le constat cherche des entrées comme `src/main.tsx`. Un projet qui réussit avec une autre structure — pas de `src/`, un autre point d'entrée, une application déjà existante qu'on modifie sans la recréer — serait déclaré malhonnête à tort.

⚠️ **Le risque en corrigeant** : élargir la condition jusqu'à ne plus jamais rougir. Le bandeau a été écrit contre un vrai défaut ; le désarmer rendrait la coche verte menteuse à nouveau. Toute correction doit garder une contre-épreuve dans les deux sens — une génération tronquée doit continuer à faire apparaître le bandeau.
