---
id: BUG-PUBLIC-DEEP-LINKS-20261025
---

## Bug

Ancres légales ignorées au chargement ou masquées. Les cibles Privacy/Terms et CTA Support-policy sont absentes du HTML serveur, puis montent après le défilement initial natif. Sur page montée, les titres sont masqués par l’en-tête fixe.

## 📤 Dispatché

Mission UI globale, complément isolé pendant CI/livraison #792 et #795. Périmètres concurrents inspectés et conservés.

## 💻 Codé

☑ Fusionné normalement dans main par [#796](https://github.com/openaxcloud/vibecore/pull/796), commit `ea2ff01c5cf6ffc5116f6ae98e9aaa4a43a807af`. [Suivi de livraison distinct](https://github.com/openaxcloud/vibecore/actions/runs/40249728903) ; ce statut de code sur main ne vaut pas validation UI en production.

Correctif : SSR existant activé uniquement sur les trois routes ; Support-policy importe directement la même coquille finale pour éviter son wrapper client-only. Marges locales sur Privacy/Terms et la seule CTA Support-policy reproduite. Autres ancres Support-policy non revendiquées corrigées.

## ✅ Testé live

Non. Navigateur local et fixtures synthétiques ; aucune mutation cliente, création d’accès, invitation ou envoi réel.

## Preuves

Privacy/Terms32cas compilés et4zooms200% verts ; Support-policy16reproductions, validation compilée finale9799 :16casSSR/froid/hash/Retour verts, cible sousheaderavec17,5pxminimum. [Matrice et limites](user-area-tertiary-2026-10-25/README.md).
