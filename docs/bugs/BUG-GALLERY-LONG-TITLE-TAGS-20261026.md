---
id: BUG-GALLERY-LONG-TITLE-TAGS-20261026
---

## Bug

Les titres et tags longs sans espaces dépassent leur carte Galerie et sont masqués malgré un document horizontalement contenu.

Avant12999 à320 : titre client246px/scrollWidth287px ; tag936px avec bord droit973px, masqué par clipping alors que documentWidth320. Le contrat adminGalleryListingSchema accepte ces titres/tags nonvides sans limite de longueur ; données synthétiques valides. Contrepreuve DOM sur4modes : overflow-wrap:anywhere et max-width100% contiennent les textes, sans supprimer le contenu.

## 📤 Dispatché

☑ 26/10/2026 — Lot Discovery P1, cause reproduite et delta local revu par le parent.

## 💻 Codé

☐ Sur main. Deux classes locales de `app/routes/gallery._index.tsx` corrigées ; aucune modification de navigation, API/action ou composant partagé. Correction et preuves consolidées localement, sans fusion/livraison déclarée ici.

## ✅ Testé live

☐ En production. Chromium local et catalogue synthétique ; aucune publication, remix, acquisition, achat ou donnée réelle.

## Validation locale et preuves

[Avant, cause et correction](ui-discovery-2026-10-26/README.md) :7tests existants Galerie SSR/detail, lint et Prettier verts. La baseline Discovery280observations concerne14URL/15IDs, pas280tests ni15écrans indépendants. Première navigation Galerie invalide par course de harness conservée et exclue ; reçus navigation corrigés séparés.

[Après13099 compilé](ui-discovery-2026-10-26/after13099/receipt.json), build commun `fbb678704` :20observations Galerie ×5formats320/390/844paysage/820/1440 ×FR/EN×thèmes, quatre parcours clavier Enter→détail→Back. Titres/tags complets conservés, scrollWidth≤clientWidth+2 et bornes dans carte ; document contenu, zéro erreur JS, aucun POST tenté. Empreinte source Galerie identique au build commun documentée dans l’archive.

La capture de carte seule est partiellement recouverte par le header fixe ; la capture page depuis le haut montre le titre et les tags. Ces limites restent conservées. Aucun replay des280observations du reste Discovery, ni zoom200%, Safari/Firefox, lecteur d’écran, clavierOS, safeareas physiques ou contraste calculé. Couverture partielle seulement, main/live faux.
