---
id: BUG-SUPPORT-REPLY-DRAFT-20261026
---

## Bug

Un changement de page ou retour navigateur perd silencieusement la réponse Support en cours.

Avant11499 :4 groupes FR/EN×thèmes perdent le brouillon après Retour assistance puis Back ; quatre répétitions sans visite guidée reproduisent aussi la perte. La textarea non contrôlée ne conserve que sa longueur en état ; démontage du formulaire sans garde. Les44 géométries initiales et12 observations sans visite guidée ne sont pas des parcours supplémentaires.

Correctif dans `app/routes/support_.$id.tsx` et son catalogue i18n : textarea contrôlée, garde existante réutilisée, annulation conservant le texte, abandon explicite l’effaçant. Accusé JS `sent:true` seulement après succès API ; PRG302 conservé pour document HTML. Un texte modifié pendant la requête ne doit pas être effacé par son ancien accusé ; chaque accusé consommé une fois. Aucun stockage persistant ni contrat backend modifié.

## 📤 Dispatché

☑ 26/10/2026 — Lot UI local autorisé ; périmètre coordonné et revue indépendante des preuves/correctifs.

## 💻 Codé

☑ Sur main depuis la fusion protégée de [#800](https://github.com/openaxcloud/vibecore/pull/800), commit `f4f3716e14aea85f3254992f74ef3e2c60f0ece3`. Livraison suivie séparément ; aucune recette authentifiée en production déduite de cette fusion.

## ✅ Testé live

☐ En production. Tests Chromium locaux et données synthétiques seulement ; aucune recette authentifiée de production ni action client réelle.

## Validation locale et preuves

28 tests verts (15 existants et13 DataRouter), lint ciblé et validation consolidée réussis. Après11599 :4 groupes navigation/resize/Escape/Annuler/Abandon/Back,4 changements de langue avec beforeunload annulé ;8 cas d’action synthétique400/503/édition pendant attente/accusé rapide, FR/EN, plus1 document HTML302. Neuf POST uniquement vers fixture localhost en mémoire ;4 PATCH de préférences bloqués navigateur. Avant11499 les4 requêtes nonGET bloquées ne consignaient pas la méthode : ne pas les appeler POST ou PATCH par supposition.

[Défaut, correction et validation](ui-secondary-pages-2026-10-26/support-detail/README.md), [recette compilée11599](ui-secondary-pages-2026-10-26/support-detail/after11599/README.md). La matrice géométrique initiale n’est pas entièrement rejouée après correction. Pas d’envoi réel, authentification production, lecteur d’écran ou clavier OS. Le [complément zoom11799](ui-browser-coverage-2026-10-26/zoom/README.md) vérifie ensuite quatre parcours de brouillon/focus, sans remplacer la recette d’actions11599.

Les versions de chaque reçu restent distinctes ; l’intégration ultérieure de main ne constitue pas un replay navigateur. Aucun nouveau test produit exécuté pour rédiger cette fiche. Les états main et live restent faux jusqu’à preuves séparées.
