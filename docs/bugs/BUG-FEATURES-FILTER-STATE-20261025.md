---
id: BUG-FEATURES-FILTER-STATE-20261025
---

## Bug

Filtre Features actif absent de l’état accessible. Les filtres fonctionnent et changent les cartes, mais aucun aria-pressed ou équivalent ne représente le bouton actif.

## 📤 Dispatché

Mission UI globale, complément isolé pendant CI/livraison #792 et #795. Périmètres concurrents inspectés et conservés.

## 💻 Codé

Correctif local uniquement, pas sur main : aria-pressed relié au même état activeTab, sans changer le filtrage ni sa présentation.

## ✅ Testé live

Non. Navigateur local et fixtures synthétiques ; aucune mutation cliente, création d’accès, invitation ou envoi réel.

## Preuves

Quatre groupes clavier avant correction ; validation compilée9799 :4groupes et24activationsclavier, étatARIAexclusif etfocus/resize/compteurs conservés. Pas de test lecteur d’écran réel. [Matrice et limites](user-area-tertiary-2026-10-25/README.md).
