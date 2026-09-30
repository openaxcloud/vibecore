---
id: BUG-QA0928-MODALE-SANS-FOCUS
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**GÊNANT (accessibilité) — la modale « Comment souhaitez-vous continuer ? » de l'accueil ne prend pas le focus.**

Après « Créer maintenant », le focus reste derrière le voile : sur WebKit (iPhone 13) sur un
élément de la page (« Plateforme de développement d'entreprise… »), sur Chromium 1440 sur le bouton
« Build now ». Clavier et VoiceOver restent dans la page masquée.

## Repro (PRODUCTION, sans compte)

```sh
node docs/bugs/qa-2026-09-28/repro-anon-handoff.mjs
# webkit-390   : "focusedInDialog":"Plateforme de développement d’entreprise"
# chromium-1440: "focusedInDialog":"Build now"
```

Artefacts : `artefacts/handoff-webkit-390-2-modal.png`, `artefacts/handoff-chromium-1440-2-modal.png`.

Observé, à confirmer : sur la capture 390 px les **deux** cartes portent un contour orange, alors
que seule « Recommandé » a une bordure orange calculée (`border-color`) — probablement un `:hover`
collant du toucher sous le point de l'appui précédent.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Mesure prod. Aucun test — point OUVERT.
