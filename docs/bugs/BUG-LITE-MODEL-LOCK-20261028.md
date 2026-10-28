---
id: BUG-LITE-MODEL-LOCK-20261028
---

# Le verrou Lite empêche le choix explicite borné

📤 Dispatché : ☑ 28 octobre 2026, recette après livraison de #826.
💻 Codé : ☐ Correctif local, publication et livraison à confirmer.
✅ Testé live : ☐ Blocage observé en production ; correction non encore livrée ni vérifiée en production.

## Défaut

À 17:23 UTC, le projet de recette affiche Primary model désactivé avec « Available from Power upward ». Le verrou statique de `entreesDuMode('lite')` ferme à la fois le modèle et les réglages avancés. #826 a livré le contrat serveur borné mais a omis ce verrou d'entrée. Ce n'est pas une preuve de cache ou de défaut d'hydratation. Power n'est pas une solution : le contrat borné accepte Lite uniquement.

## Correction

Le sélecteur de modèle s'ouvre en Lite ; les réglages avancés restent verrouillés. L'écran modèle Lite n'expose aucun curseur d'effort et ne transmet aucun effort hérité. Les contrôles serveur, tarifs, plafond, fournisseur et Auto ne changent pas. Aucun appel fournisseur, recharge, accès ou secret créé.

## Validation

Tests de la feuille dans ses dispositions mobile et desktop, puis du composeur réel : clic d'ouverture, sélection explicite de Luna sans fast, persistance, remontage et affichage de la note budgétaire ; absence de curseur d'effort. Tests de refus serveur conservés. Typecheck, lint, build et CI doivent réussir avant livraison. Ces tests DOM ne prouvent ni le fonctionnement du fournisseur ni le parcours authentifié de production.

## Recette attendue

Après livraison : recharger le projet dédié, ouvrir Lite puis Primary model, sélectionner `gpt-5.6-luna` sans fast et sans Auto, laisser Plan désactivé. Vérifier la note de budget avant un seul envoi autorisé. Le montant estimatif du composeur n'est pas la réservation conservative du serveur. Les crédits et dépenses antérieures restent à vérifier par la recette coordonnée.
