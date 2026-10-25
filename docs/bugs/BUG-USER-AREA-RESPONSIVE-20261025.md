---
id: BUG-USER-AREA-RESPONSIVE-20261025
---

## Bug

Lot utilisateur après #791 : fenêtre de suppression du compte sans retour du focus et sans description ARIA ; erreur de limite Facturation hors écran après soumission ; recherche Projets désynchronisée avec navigation, Retour/Avancer et réponses lentes ; noms illisibles en liste mobile ; bouton d'effacement sous le champ à cause d'un conflit de transform animé ; ouverture du menu Projet mobile qui remonte le document et masque les actions.

## 📤 Dispatché

25 octobre 2026, mission UI/UX globale poursuivie en parallèle : Compte, Projets, Facturation. Branche locale séparée basée sur la tête exacte #791 `5ee605bf3`. Le produit #791 reste inchangé pendant sa CI. Aucun fichier produit réservé à #788 ni opération refusée #768/#764 touché.

## 💻 Codé

Correctifs validés localement, pas sur main. Dialog réutilise restauration du focus et description existantes ; erreur Facturation reçoit le focus après réponse ; recherche distingue réponse locale, frappe plus récente et navigation externe, sans écrire pendant navigation ; liste mobile affiche le nom ; SearchInput positionne son bouton indépendamment du transform Framer ; ProjectCardMenu évite le verrouillage modal responsable du saut de scroll, sans changer les autres Dropdown.

## ✅ Testé live

Non. Pas de production ni d'opération financière. Fixtures API synthétiques locales ; tests routeurs mémoire et navigateur compilé distingués dans la matrice. Aucun succès backend réel revendiqué.

## Preuves et restes

[Captures, contre-preuves, matrice et scripts](user-area-2026-10-25/README.md). Le premier correctif recherche a échoué sur Avancer dans Chromium ; sa preuve rouge est conservée. Les cas de réponse lente et de collision de navigation ont été ajoutés avant validation finale.

Palette dashboard hors écran : voir la fiche séparée ; source réservée à #788, patch proposé non appliqué.
