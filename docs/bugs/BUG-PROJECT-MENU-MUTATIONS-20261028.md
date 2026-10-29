---
id: BUG-PROJECT-MENU-MUTATIONS-20261028
---

# Mutations répétées et saisie perdue dans le menu des projets

## Bug

Sur main `63e663830`, le menu accepte une nouvelle mutation pendant une requête.
Le renommage peut envoyer deux demandes avec Entrée puis perte du focus ; une
réponse `ok:false` ferme le formulaire et perd la saisie. Le dialogue de suppression
vérifie le nom dans le navigateur sans transmettre `confirmName` au contrat API
existant. Aucune suppression ou connexion fournisseur réelle n'a servi de test.

Le correctif local réserve la soumission avant le changement d'état du routeur,
ignore les anciennes réponses, conserve le brouillon après erreur et permet une
reprise. Échap annule sans soumission ultérieure lors de la perte du focus. Le
toast d'archivage reste émis dès le résultat, avant le démontage de la carte.
La confirmation transmet le nom exact saisi pour un projet déployé, sinon le nom
affiché dans le dialogue ; le backend existant peut ainsi vérifier ce nom.

Reproduction initiale : 11 assertions rouges et 3 témoins verts. Après correction,
21 tests passent, dont un vrai routeur avec action retardée, erreur puis réussite.
Les premiers essais de ce test routeur avaient des incompatibilités jsdom/Node
dans le harnais ; ils ne sont pas comptés comme des défauts produit.

La recette navigateur a aussi mesuré 36 px sur les boutons du dialogue de
suppression à 320/390/768 px, après la fin de l'animation. Une règle globale plus
spécifique écrase leur classe de hauteur minimale. Un minimum local explicite de
44 px sur Annuler et Confirmer corrige ce conflit sans modifier les styles partagés.

## 📤 Dispatché

☑ 28/10/2026 — lot indépendant du correctif Publish #831.

## 💻 Codé

☐ — correctif local, non fusionné et non livré.

## ✅ Testé live

☐ — aucune validation authentifiée en production. Recette locale : deux scénarios
de renommage erreur API puis reprise persistée passent à 320/1440 px ; après le
correctif de hauteur, six scénarios distincts passent à 320/390/768/1024/1440 px
et au zoom Chromium natif 200 %. Le build initial des deux renommages ne diffère
du build final que par les styles des boutons du dialogue. Les erreurs de harnais,
l'interruption et les reproductions rouges de hauteur sont conservées séparément.
