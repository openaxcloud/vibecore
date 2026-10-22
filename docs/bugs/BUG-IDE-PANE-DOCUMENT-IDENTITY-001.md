---
id: BUG-IDE-PANE-DOCUMENT-IDENTITY-001
---

# Onglets de panneaux associés au document global

## 📤 Dispatché

22 octobre 2026 : investigation du flaky docking de #763. Le retour B→A reste une piste distincte, non attribuée à ce défaut.

## 💻 Codé

Correction locale sauvegardée dans `4ec690fc`, publication #763 en préparation : contenu et opérations d’édition liés au chemin de l’onglet du panneau, sélection des onglets flottants. Aucun changement des délais, seuils ou exemptions.

## ✅ Testé live

Reproduction sur le build local combinant 9609abf9 et main 18cf74fd : ouvrir other.txt dans le panneau flottant puis audit.txt dans le panneau ancré remplace le texte du premier par celui du second, malgré son onglet other.txt. Échec réel conservé, assertion 5 s inchangée. Le build corrigé `4ec690fc` passe le scénario de deux documents indépendants, sélection flottante, docking et conservation des brouillons. Les deux retours B→A passent à 390/768 px sans reproduire l’ancien flaky. Recette locale : 45/45 IDE, 3/3 fichiers, 6/6 confirmations et 12/12 menus sans retry/omission dans les passages finaux ; les rouges intermédiaires et leurs causes sont conservés. Le test de panneaux coupe runtime/sauvegardes : aucune certification de persistance distante ou de production. [Preuves et limites](ux-followup-2026-10-21/main-18cf-docking/README.md).
