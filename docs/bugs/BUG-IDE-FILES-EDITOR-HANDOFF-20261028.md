---
id: BUG-IDE-FILES-EDITOR-HANDOFF-20261028
---

## Bug

Le menu contextuel Fichiers ne ferme pas avec Escape et déborde sur mobile. Le passage entre CodeMirror et Monaco conserve le texte mais perd focus et sélection. Ces défauts ont été reproduits sur composants compilés, avec API synthétiques isolées ; aucune donnée cliente n'a été modifiée.

## 📤 Dispatché

☑ 28/10/2026 — lot Fichiers/éditeur, distinct de Memory ; basé sur les lots #833 et #836. Aucun changement du store workbench, des modèles ou du budget.

## 💻 Codé

☐ main — correctif local en validation, non publié, non fusionné et non déployé.

## ✅ Testé live

☐ production — contrepreuve finale Chromium locale réussie ; aucune recette production.

## Correction

Le menu Radix possède explicitement Escape, sans neutraliser Ctrl+S ou les raccourcis extérieurs. Sa largeur et hauteur suivent l'espace disponible, les libellés se replient et la limite basse tient compte de la navigation mobile réellement visible. Toutes les actions restent accessibles dans le défilement du menu ; aucun changement de navigation globale.

Le reçu éphémère de focus déjà existant transporte une sélection UTF-16 entre moteurs pour le même fichier, contenu et panneau. Le transfert est abandonné lors d'une composition IME, d'une interaction extérieure ou d'un contenu différent. Aucun cache permanent ou délai supplémentaire. Les sélections multiples et leur index principal sont conservés dans le contrat.

La destination Editor est préparée dès la navigation canonique, avant le resize. Une frontière sans DOM réserve le reçu pendant le chargement lazy et l'annule à la sortie, au changement d'identité ou après interaction extérieure. Les traces ont distingué le détour Agent de l'expiration du reçu avant le chargement de CodeMirror. Les autres destinations et l'entrée nue Agent restent inchangées.

## Preuves et limites

Avant correction : Escape échoue dans six contextes FR/EN ; à 390 px, des actions se trouvent sous la navigation basse. Trois transitions moteur perdent focus/sélection, sans perdre le texte. Après un premier patch, le passage Monaco vers mobile restait rouge : les traces ont montré Agent pendant la transition, puis l'expiration du reçu.

Tests ciblés, revue indépendante et contrepreuve finale sont consignés dans la matrice et les preuves de ce lot. Build final client/SSR et typage web officiel réussis. Les recettes ne prouvent pas un backend ou un Shell réel, Safari, appareil physique, clavier virtuel ou safe areas matérielles.

**Limite CRLF :** CodeMirror normalise les fins de ligne en LF alors qu'un modèle Monaco peut conserver CRLF. Le garde de contenu exact refuse alors le transfert ; il n'applique pas un offset erroné. Un témoin avec CodeMirror réel et modèle Monaco simulé caractérise cette limite, sans la présenter comme corrigée. La conversion de positions entre fins de ligne reste à traiter.

La contrepreuve finale passe trois transitions (390/820 vers 1280 et 1280 vers 390), focus/sélection/texte et absence de flash Agent, ainsi que le focus extérieur. Menu : 13 contextes et 143 cibles, plus zoom navigateur 200 %, puis smoke assemblé. [Captures et limites](files-editor-handoff-evidence-20261028/README.md).
