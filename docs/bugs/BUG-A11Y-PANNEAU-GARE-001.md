---
id: BUG-A11Y-PANNEAU-GARE-001
section: "Découvertes du canari mobile — 2026-09-16"
---

## Bug

**P2 — sur l'IDE mobile, le panneau quitté reste atteignable au clavier alors qu'il est garé hors écran.** Mesuré le 16/09 au Pixel 7 (pile locale, build `5de272fa`) : après le passage de l'Agent à l'Aperçu, l'éditeur glisse de 0 à **−412 px** (enveloppe `View` du Workbench, `motion.div absolute inset-0`, `transform: matrix(1, 0, 0, 1, -412, 0)`) et y reste **`display: block`, `visibility: visible`, sans `aria-hidden` ni `inert`**. Il garde 2 éléments focalisables (le contenu CodeMirror et « Open file history »). En pressant Tab depuis le panneau Aperçu, **le focus entre dans l'éditeur garé au 34ᵉ Tab** (`div` CodeMirror à −391 px) : l'utilisateur au clavier — ou VoiceOver avec un clavier Bluetooth sur iPhone — tape dans un panneau qu'il ne voit pas. Un panneau garé doit être `inert` (et `aria-hidden`) tant qu'il n'est pas le panneau actif.

## 📤

☑ 16/09 — trouvé en instruisant le reliquat 2 de BUG-QA-CI-NO-MOBILE-COVERAGE-001 (le helper `expectCompactIdeSurfaceFitsViewport` mesurait ce panneau garé comme un débordement ; en distinguant « garé » d'« amputé », la sonde a vérifié que garé ne voulait pas dire inaccessible). ⚠️ Le correctif et sa garde avaient été écrits et vérifiés le 16/09 (rouge sans, vert avec, suite canari 14/17) sur une branche locale jamais poussée : **perdus avec le conteneur** (règle 29). À refaire.

## 💻

☐ — `View` (`app/components/workbench/Workbench.client.tsx`), l'enveloppe des quatre panneaux (code, diff, aperçu, git), reçoit un prop `actif` ; un panneau non actif porte `inert` (attribut chaîne vide, React 18 ne connaît pas la propriété) et `aria-hidden`. Garde E2E (projet mobile) : contrôle positif d'abord — sur le panneau Éditeur, Tab atteint l'éditeur — puis, depuis l'Aperçu, 60 Tab ne font jamais entrer le focus dans `responsive-code-editor`. Contre-épreuve attendue : sans le correctif, rouge (`Received: 34`).

## ✅

☐ — à constater sur iPhone avec un clavier : depuis l'Aperçu, Tab ne fait jamais disparaître le focus hors écran.

## Preuve

Sonde du 16/09 (Chromium, Pixel 7, `?panel=agent` → `tab-preview`, attente 2,5 s) : `éditeur garé {"left":-412,"focusables":2,"exemples":["div","button[Open file history]"]}` puis `focus entré dans le panneau garé : {"tab":34,"dedans":true,"tag":"DIV","label":"# Tab panneau garé","left":-391}`. Vérifié sur Chromium seulement ; la preuve iOS reste à prendre.
