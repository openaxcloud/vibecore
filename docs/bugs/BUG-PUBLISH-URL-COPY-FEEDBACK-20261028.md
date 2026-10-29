---
id: BUG-PUBLISH-URL-COPY-FEEDBACK-20261028
---

# Copie d'URL sans retour exploitable

## Bug

Sur main `9ec6ebf75`, un refus du presse-papiers ou une API indisponible ne donne
aucun retour dans `DomainValue`, utilisé par le panneau de publication. Une
promesse de copie terminée après changement d'URL peut afficher « URL copiée »
pour la nouvelle URL, qui n'a pourtant pas été copiée. Trois tests du composant
réel reproduisent ces défauts avant correction.

Le correctif affiche un retour localisé et un champ en lecture seule permettant
de sélectionner l'URL complète manuellement. Une copie réussie est annoncée dans
une zone de statut. Les réponses des anciennes tentatives ou anciennes URL sont
ignorées ; les temporisations sont nettoyées. Le bouton permet une nouvelle
tentative après erreur. Copier et QR ont une cible de 44 px.

Les simulations de permissions du presse-papiers sont limitées aux tests. Aucun
mock n'est ajouté au produit, aucune URL cliente n'est utilisée, aucun lien ou
backend Domains n'est supprimé.

## 📤 Dispatché

☑ 28/10/2026 — audit Publish/Domaines et actions accessibles.

## 💻 Codé

☐ — correctif local ; non fusionné, non livré.

## ✅ Testé live

☐ — aucune recette authentifiée de production ou Safari matériel. Tests composant
locaux : refus, API absente, réponse tardive, reprise et ordre des réponses.
