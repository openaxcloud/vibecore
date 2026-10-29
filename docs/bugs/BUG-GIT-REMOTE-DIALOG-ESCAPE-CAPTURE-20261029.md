---
id: BUG-GIT-REMOTE-DIALOG-ESCAPE-CAPTURE-20261029
---

## Bug

Le dialogue Git distant fermait avec Escape depuis son champ URL, mais pas
depuis ses boutons Fermer ou Enregistrer : le raccourci global en phase capture
consommait Escape avant le gestionnaire local du dialogue non modal.

## 📤 Dispatché

☑ 29/10/2026 — reproduction pendant la revue de l'assemblage Publish/Projets/Git.

## 💻 Codé

☐ main — correction locale : le dialogue ouvert expose `data-state="open"`,
contrat déjà reconnu par le gestionnaire global. Aucun changement de celui-ci,
aucun ajout de modalité ou capture de focus globale.

## ✅ Testé live

☐ production — composant réel et hook de raccourcis réel sous jsdom uniquement.

## Preuves

Avant correction : deux tests rouges (Escape sur Fermer/Enregistrer), deux témoins
verts (Escape dans URL ; Ctrl+S et Escape extérieur). Après correction : quatre
tests d'intégration, neuf tests clavier Git et six tests de routage des dialogues
passent, soit 19 tests. Aucun appel réseau émis par ces interactions. Cette preuve
ne valide ni OAuth ni connexion réelle au fournisseur, ni navigateur de production.
