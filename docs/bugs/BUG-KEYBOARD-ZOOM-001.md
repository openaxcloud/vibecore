---
id: BUG-KEYBOARD-ZOOM-001
---

## Bug

**P1 — iPhone Safari : toucher la zone de saisie de l'agent ZOOME la page** (Avi, 08/09 07:58, capture : page blanche, socle mobile flottant au-dessus du clavier, zone de saisie hors de vue, barre d'accessoires iOS « ^ v ✓ » visible). « Tu as pas réglé le problème de zoom dans iPhone quand je clique dans la zone de saisie pour écrire ». Piste iOS connue : Safari zoome sur tout champ dont la police CALCULÉE est < 16 px ; puis la fenêtre visuelle décale (offsetTop) et notre coque, calée sur la hauteur visuelle seulement, reste en haut → blanc.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 08/09 **DÉPLOYÉ EN PROD run 1554 (e4b2d7d), 08/09 14:23 UTC** — image web reconstruite, `helm upgrade` fait, étape « Verify running imageIDs match the release manifest » verte (les pods tournent bien cette image). — MESURÉ : le champ est bien à 16 px (seul champ du panneau, plancher `!important` sous 1024 px) et la capture ne montre AUCUN agrandissement (socle à taille normale) : ce n'est pas un zoom, c'est un DÉFILEMENT. Safari fait défiler le document pour garder le champ visible (`offsetTop` ≈ hauteur du clavier) ; la détection « recouvrement bas = mise en page − hauteur − décalage » tombait alors à 0 → socle affiché, composeur soulevé de barre + 8, et la coque (calée sur la hauteur visuelle, posée en haut du document) hors de l'écran. Correctif : détection par le RÉTRÉCISSEMENT (mise en page − hauteur visuelle) + `window.scrollTo(0, 0)` tant que le clavier est ouvert et que le document est décalé.

## ✅ Testé live

☐ live iPhone (non mesurable sur Chromium : la fenêtre visuelle n'y bouge pas)

## Preuve

épinglé par `app/components/chat/visual-viewport-bottom.spec.ts` (cas 844/369/475 + câblage BaseChat)

