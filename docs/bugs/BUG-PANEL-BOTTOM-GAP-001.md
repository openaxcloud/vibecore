---
id: BUG-PANEL-BOTTOM-GAP-001
---

## Bug

**P2 — Panneaux d'outils sur iPhone (capture « Activité ») : bande vide entre le bas du contenu et la barre de navigation du bas** (Avi, 07/09 08:26, entourée en rouge : « cette espace ne sert à rien, on doit gagner de l'espace »). Mesuré (Chromium et WebKitGTK 390) : le panneau de service est fixé de 48 à 844, sous la barre ; son conteneur défile avec 88 px de rembourrage bas ; aucune règle ne le borne au-dessus de la barre — pas de bande ici. La cause est dans le voile de la barre (`.bolt-mobile-replit-nav-bg`) : `height: nav + 26px + safe-area` avec `backdrop-filter: blur(20px)`, soit 26 px de dégradé ET de flou AU-DESSUS de la pastille. Sur iOS le bord de la boîte floutée est une ligne nette : ces 26 px (plus l'étalement du flou, ~45 px sur la capture, rapportés à l'en-tête de 48) se lisent comme une bande vide ; Chromium rend un fondu doux, d'où la non-reproduction.

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main` — PAS EN PROD au 07/09 11:00 UTC, porte refusée : Production CI rouge sur l'empreinte du bloc gelé de BaseChat, re-scellée par 247eb27 ; redéploiement à confirmer) — voile ramené à la hauteur de la zone de navigation (`nav + safe-area`), dégradé sur 10 px : le contenu reste net jusqu'au bord haut de la pastille et passe sous elle en défilant. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§24 : hauteur exacte, plus de `+ 26px`) + `tests/e2e/ide-mobile-chrome.spec.ts` « panneaux d'outils : … pas de bande morte » (haut du voile = haut de la pastille ; 6 px au-dessus, c'est le panneau, sans flou). Le rendu iOS du flou n'est pas vérifiable ici : capture iPhone à confirmer.

## ✅ Testé live

☐

## Preuve

07/09 08:26.

