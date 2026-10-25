---
id: BUG-ACCOUNT-NAVIGATION-20261025
---

## Bug

À 320px en français, la navigation Compte cache la destination « Données et confidentialité » : largeur visible 292px, largeur défilante 424px, bord droit du dernier lien437,906px. Aucune flèche ni indication du contenu restant. Les liens entre routes sont annoncés comme des onglets sans protocole clavier des onglets.

## 📤 Dispatché

25 octobre 2026 : mission UI/UX globale, lot isolé Compte. Main a18c7defb et PR ouvertes inspectés avant édition ; navigation commune, styles globaux, Deploy/Git/Domains#788, hub intégrations, Fleet#789 et pipeline exclus. Aucune opération#768/#764 retentée.

## 💻 Codé

Fusion normale #791 le 25 octobre 2026 : main `d09045d5a2fca53dbd7dbab61b4e505ad251d728`. Navigation nommée native, liens NavLink avec aria-current, retour à la ligne sans couper les libellés. Tous les contrôles de tête `9aa0eb4` sont passés ; déploiement et recette production restent distincts. Aucune fonction supprimée.

## ✅ Testé live

Non. Pas de session production disponible. Aucune recette production ni version déployée revendiquée.

## Preuve

Voir [recette, captures et matrice](account-navigation-2026-10-25/README.md). Les hypothèses de débordement des champs et de police mobile14px ont été réfutées à320px (les styles existants donnent255px et16px) ; aucun correctif inutile appliqué.

## Second défaut du lot : confirmation Facturation non annoncée

Le message positif d'enregistrement n'avait aucune région live. Il expose maintenant un statut poli ; test formulaire avec routeur mémoire et réponses synthétiques réussite/erreur. 15 tests Facturation passent. Aucun changement métier, aucun abonnement ni montant modifié ; lecture vocale réelle et recette écran Facturation non exécutées.
