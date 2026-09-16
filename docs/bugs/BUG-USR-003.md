---
id: BUG-USR-003
---

## Bug

**P1 — toutes les cartes de projet du tableau de bord affichent un grand rectangle vide.** `GET /api/projects/<id>/thumbnail` répond **502 au bout de 32,5 s** ; côté API le journal montre « incoming request » et **aucune ligne de fin** : le handler attend le stockage objet (`OBJECT_STORAGE_ENABLED=true` sur l'env de test, bucket injoignable) et le client GCS réessaie sans plafond, jusqu'à ce que le loader Remix abandonne à 30 s. Côté navigateur c'est le pire cas : l'`<img>` ne charge pas **et** n'échoue pas, donc `onError` ne part jamais et l'état de repli « Aucun aperçu » — qui existe pourtant dans le code — n'apparaît jamais. La carte reste un trou noir pendant une demi-minute. ⚠️ Le mécanisme est indépendant de l'environnement : toute lenteur du stockage objet en production produit le même écran.

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09

## ✅ Testé live

**Revérifié le 09/09 : corrigé.** La recherche de vignette est bornée dans le temps (`withStorageDeadline`, budget sur l'opération ENTIÈRE et non par appel) et un dépassement rend 404 — la carte bascule sur « Aucun aperçu » au lieu de rester un rectangle vide pendant 32 s.

## Preuve

☐ live iPhone

