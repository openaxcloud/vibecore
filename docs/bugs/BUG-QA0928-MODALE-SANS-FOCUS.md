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

☑ 30/09 #616

## 💻

☐ PR #616 ouverte — verdict CI attendu

## ✅

☐ pas encore servi en prod au 30/09 13:45

## Preuve

Mesure prod. Aucun test — point OUVERT.

**30/09 — CORRIGÉ, pas encore prouvé en CI.** Local : rouge sur `main` sur les deux moteurs, vert ×2 sur Chromium et webkit-iphone ; contre-épreuves : sans le piège → rouge partout, avec l'ancien piège → vert Chromium / rouge WebKit. En CI, tentative 1 : mon test ✓, mais `user-area-navigation.spec.ts:323` ✘ 3/3 (expiration de 3 min sur `goto('/dashboard')`, run de 1 h contre 31–40 min ailleurs). `useFocusTrap` n'est pas utilisé sur ce chemin et le test n'appuie jamais sur Tab ; relance du même commit en cours pour trancher. Épinglé par `tests/e2e/modale-accueil-prend-le-focus.spec.ts` (projet webkit-iphone) et `app/lib/use-focus-trap.spec.tsx`.
