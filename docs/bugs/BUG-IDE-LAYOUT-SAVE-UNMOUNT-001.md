---
id: BUG-IDE-LAYOUT-SAVE-UNMOUNT-001
section: "IDE — initialisation et persistance"
---

## Bug

Le timer de sauvegarde du layout dans `BaseChat.tsx` attend une seconde avant
même de transmettre l'état à `saveProjectIdeMemory`. Un démontage pendant cette
seconde annule le timer : ni la copie locale ni le flush `pagehide` de la couche
mémoire ne reçoivent le dernier layout. Cette couche possède déjà son propre
debounce réseau.

## 📤 Dispatché

☑ — 21 octobre 2026, reprise indépendante Monaco/layout depuis main
`4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`.

## 💻 Codé

☐ — candidat sur branche dédiée, non fusionné. Suppression du timer extérieur ;
la copie locale est mise à jour dans l'effet, et le debounce réseau existant
reste actif. La portée projet/workspace doit avoir été restaurée avant toute
écriture : le fallback d'affichage ne vaut pas restauration réussie.

## ✅ Testé live

☐ — aucune production ni recette complète certifiée. La contre-épreuve exécute
l'effet réel extrait de `BaseChat` : deux échecs sur main (sortie immédiate et
fenêtre secondaire), puis succès avec le candidat. Elle vérifie aussi la
sélection encore en attente, la conservation d'une fenêtre sœur et les gardes
de restauration. Voir le rapport de reprise pour les validations finales.

## Limite causale

Ce défaut statique est reproduit, mais il n'explique pas à lui seul les E2E de
main. Dans le premier viewport local, `ide-state` conserve `audit.txt` et un
panneau flottant après navigation. Ne pas conclure à une perte physique des
fichiers ni déclarer les E2E corrigés sur la seule base de cette contre-épreuve.
