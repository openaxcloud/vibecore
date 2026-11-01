---
id: BUG-MOBILE-APPLIED-NOTICE-FLOW-20261101
---

## Bug

P1 — le toast de fichiers appliqués reste superposé au rapport malgré sa réduction (y=113 px inchangé dans la preuve de #881). La première version du complément figeait aussi sa destination pendant la navigation et partageait un identifiant DOM entre dock et conteneur. Le complément conserve désormais un hôte unique mobile entre les panneaux et des identifiants distincts.

## 📤 Dispatché

☑ 01/11 — complément distinct demandé après validation de #881. Menu inférieur et avertissements conservés.

## 💻 Codé

☐ — branche fix/mobile-toast-flow-20261101, séparée de la tête verte 4692759e0946789104cb9df9770e51adeb30f256 de #881. Pas intégré sur main.

## ✅ Testé live

☐ — pas de validation de production ni d’iPhone physique. Validation locale compilée : 6 parcours Chromium/WebKit à 390/393/430 px, paysage et fenêtre réduite ; déplacement de lecture 0 px à l’apparition en portrait (scrollTop=500 uniquement), commandes 44 px hors du fil. Les 12 parcours de navigation avec notification active passent aussi (unicité des IDs, clavier, état et temporisation). Build, typage web, lint, 1 502 tests chat et 16 tests index passent. [Preuves](mobile-toast-flow-20261101/README.md).
