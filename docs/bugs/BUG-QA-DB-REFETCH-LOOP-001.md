---
id: BUG-QA-DB-REFETCH-LOOP-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**(P1) Boucle de rechargement infinie du panneau Base de données** — ~110 requêtes / 30 s depuis **un seul onglet**, CPU de l'API à **212 %**, HPA de 2 à 10 réplicas. **Il y avait DEUX boucles, pas une.** `useFetcher()` renvoie un objet d'identité **nouvelle à chaque rendu** : (1) `useEffect(…, [fetcher, base])` gardé par `!fetcher.data` relançait le chargement à chaque rendu dès qu'il n'aboutissait à aucune donnée — le cas exact d'un provisionnement échoué ; (2) l'effet de rechargement post-provisionnement rappelait `fetcher.load()` à chaque rendu parce que `provisionFetcher.data.ok` **reste vrai** après coup.

## 📤

✅

## 💻

✅ **`3b81b10b`**

## ✅

✅ **13/08**

## Preuve

Les deux effets sont gardés par une ref, et `fetcher` sort des dépendances : l'identité qui compte est `base`, pas l'objet fetcher. **Mesure live** sur le panneau ouvert : **5 requêtes au total**, toutes dans une fenêtre de **3,4 s**, puis **~49 s sans aucune requête** (dernière requête à −65 s sur une page vieille de 68 s). À comparer aux ~110 / 30 s **en continu** relevées par la QA.

