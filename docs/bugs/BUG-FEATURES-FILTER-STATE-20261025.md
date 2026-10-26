---
id: BUG-FEATURES-FILTER-STATE-20261025
---

## Bug

Filtre Features actif absent de l’état accessible. Les filtres fonctionnent et changent les cartes, mais aucun aria-pressed ou équivalent ne représente le bouton actif.

## 📤 Dispatché

Mission UI globale, complément isolé pendant CI/livraison #792 et #795. Périmètres concurrents inspectés et conservés.

## 💻 Codé

☑ Fusionné normalement dans main par [#796](https://github.com/openaxcloud/vibecore/pull/796), commit `ea2ff01c5cf6ffc5116f6ae98e9aaa4a43a807af`. [Suivi de livraison distinct](https://github.com/openaxcloud/vibecore/actions/runs/40249728903) ; ce statut de code sur main ne vaut pas validation UI en production.

Correctif : aria-pressed relié au même état activeTab, sans changer le filtrage ni sa présentation.

## ✅ Testé live

Non. Navigateur local et fixtures synthétiques ; aucune mutation cliente, création d’accès, invitation ou envoi réel.

## Preuves

Quatre groupes clavier avant correction ; validation compilée9799 :4groupes et24activationsclavier, étatARIAexclusif etfocus/resize/compteurs conservés. Pas de test lecteur d’écran réel. [Matrice et limites](user-area-tertiary-2026-10-25/README.md).
