---
id: BUG-QA-LENTEUR-DASHBOARD-001
---

## Bug

**Le tableau de bord met 37 secondes à se stabiliser en 390 px — c'est la première page que voit un utilisateur qui revient.** Temps jusqu'à contenu stable (hors écrans de chargement), mesuré sur 144 relevés : **`/dashboard` en 390 px clair → 36 954 ms** ; `/dashboard` desktop sombre → **14 604 ms** ; `/dashboard` desktop clair → **10 232 ms** ; `/billing` desktop sombre → **12 158 ms** ; `/api-keys` desktop sombre → **11 236 ms** ; page d'accueil marketing `www/` en 390 px → **17 377 ms**. **Toutes les autres routes se stabilisent en 3,7 à 8 s** — l'écart n'est donc pas un bruit de fond général mais bien propre à ces pages. Le tableau de bord est **la pire des 24 routes**, et il cumule avec `BUG-QA-THUMBNAIL-SLOW-PAGE-001` : pendant ces dizaines de secondes, les cartes affichent « No preview yet » même pour les projets qui ont un aperçu. **Lien probable avec les vignettes** : `/dashboard` déclenche 6 requêtes `/api/projects/:id/thumbnail` en parallèle, dont **3 renvoient HTTP 500** (`BUG-QA-THUMBNAIL-500-001`) — piste à confirmer, non démontrée ici.

## 📤

☐

## 💻

☐

## ✅

✅ **30/08** mesuré, 144 relevés

## Preuve

**Méthode** : temps entre `goto` et deux relevés consécutifs identiques de `document.body.innerText.length`, **avec exigence d'absence de tout indicateur de chargement** (le critère naïf acceptait un écran « Chargement… » stable — voir la réserve de `BUG-QA-TABLET-MOBILE-PARITY-001`). Données : `/tmp/qa-sweep/mob/finition-art/finition.json`. ⚠️ **Réserve d'environnement, importante** : mesures prises sur l'environnement de test (Cloud SQL **`db-g1-small`**, 3 réplicas d'API), dont le runbook §2 précise que le « comportement sous charge réelle » n'y est **pas** prouvable. Les valeurs absolues **ne sont pas transposables à la production**. Ce qui reste solide est le **classement relatif, à conditions identiques** : `/dashboard` est 4 à 9× plus lent que les 18 autres routes de la même campagne. C'est cet écart qui doit être investigué, pas la valeur de 37 s. **À faire avant tout correctif** : rechronométrer sur un environnement dimensionné comme la production.

