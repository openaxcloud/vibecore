---
id: BUG-QA-THUMBNAIL-SLOW-PAGE-001
---

## Bug

**Sur le tableau de bord, une vignette pourtant valide met plus de 20 secondes à apparaître ; pendant tout ce temps la carte affiche « No preview yet ».** Mesuré en production : à **20 s** après chargement de la page, les 6 balises `<img>` de vignette sont encore `complete:false, naturalWidth:0` — donc **les 6 cartes** affichent l'état « aucun aperçu », y compris les 3 dont la vignette est parfaitement servie. Relevé plus tard, la même balise passe à `complete:true, naturalWidth:1280, visibility:visible`. En parallèle, la **même URL** chargée isolément via `new Image()` répond en **450 à 1531 ms**. L'écart n'est donc pas dû au backend. Les balises portent `loading="lazy"` alors qu'elles sont **dans le viewport** (`visible:true`) — piste à vérifier, de même qu'une éventuelle annulation/reprise des requêtes lors des rendus successifs de la page (la console émet par ailleurs des `AbortError: signal is aborted without reason` sur la restauration d'état de l'IDE). **Effet** : un utilisateur qui revient sur son tableau de bord voit d'abord « No preview yet » partout, ce qui est **faux** pour les projets qui ont un aperçu. C'est la première impression au retour sur le produit.

## 📤

☐

## 💻

☐

## ✅

✅ **27/08** mesuré live prod

## Preuve

Mesures et commandes : `docs/audit/evidence-2026-08-27/vignettes-tableau-de-bord.md`. ⚠️ **Piste non confirmée** : je n'ai pas isolé la cause exacte du retard (lazy-loading, concurrence des 6 requêtes, annulation au re-rendu). Le fait mesuré est l'écart entre **> 20 s sur la page** et **< 1,6 s en isolé**, sur la même URL et la même session.

