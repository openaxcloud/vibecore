---
id: BUG-IDE-PANE-DOCUMENT-IDENTITY-001
---

# Onglets de panneaux associés au document global

## 📤 Dispatché

22 octobre 2026 : investigation du flaky docking de #763. Le retour B→A reste une piste distincte, non attribuée à ce défaut.

## 💻 Codé

Correction locale en validation : contenu et opérations d’édition liés au chemin de l’onglet du panneau, sélection des onglets flottants. Aucun changement des délais, seuils ou exemptions.

## ✅ Testé live

Reproduction sur le build local combinant 9609abf9 et main 18cf74fd : ouvrir other.txt dans le panneau flottant puis audit.txt dans le panneau ancré remplace le texte du premier par celui du second, malgré son onglet other.txt. Échec réel conservé, assertion 5 s inchangée. Validation du correctif encore en cours ; aucune certification production.
