---
id: BUG-THREAD-TOP-GAP-001
---

## Bug

**P3 — Fil de l'agent sur iPhone : bande vide entre l'en-tête et le premier message** (Avi, 07/09 08:06, entourée en rouge : « à quoi sert ce que j'ai entouré, ça ne fait que perdre de la place »). Sur la même capture, « le premier message est toujours coupé » (colonne rétrécie, pastille à droite) = BUG-SCROLL-PILL-GUTTER-001, dont la prod de 08:06 ne portait pas encore le correctif (run 1517). Mesuré à 390 sur Chromium ET WebKitGTK : la première bulle est à 2 px SOUS le bas de l'en-tête (le rembourrage haut du fil, `--vc-mobile-panel-gutter-tight` = 14 px, compense un décalage de 12 px : ramené à 4 px, la bulle passe 8 px sous l'en-tête — essai retiré avant commit). La bande de ~15 px de l'iPhone n'est PAS reproduite ici : cause encore à trouver (terme propre à Safari iOS — zone sûre, réserve de la barre de contexte ou du sélecteur de langue).

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main`, déployé run 1530 (9c7483b), 15:59 UTC) — ÉTAT DE DÉPART corrigé : `.bolt-mobile-agent-start-state` portait `margin-top: 55px + réserve` (réserve à 0 depuis le retrait de la bascule de langue, les 55 px restés) ; mesuré Chromium 390 : en-tête 49 → carte 103 (54 px). Marge = gouttière serrée + barre de contexte. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§26) + `tests/e2e/ide-mobile-chrome.spec.ts` « panneau Agent, état de départ : … sans bande vide » (≤ 24 px ; rouge sur le build sans le correctif : 54). L'état AVEC bulles : cause trouvée le 08/09 (Avi a renvoyé la capture du 07/09 08:06 : « tu as pas réglé ce point déjà ? retire cette espace, ça cache le contenu et perd de la place »). Le « 2 px » du 07/09 mesurait le rectangle de la bulle, pas ce qui est VISIBLE : la boîte qui défile est le `div` interne de StickToBottom, posé DANS le `padding-top` (gouttière 14 px) de `.bolt-project-agent-scroll`, qui ne défile pas — 13 px de bande morte entre l'en-tête (49) et la boîte (62) ; et le quai de la ligne d'état, rendu même vide (`[] && …` est vrai) avec `-mt-6` (−21 px avec la base rem mobile de 14 px) + écart de colonne 6 px, plaçait la première bulle à 47 : ses 15 premiers pixels débordaient en défilement négatif, inatteignable — un point à 2 px sous son haut touchait le conteneur, pas la bulle. Sur la capture iPhone, mêmes proportions (≈ 10 px de bande, bulle rognée). Correctif : `padding-top` de `.bolt-project-agent-scroll` sans gouttière (seules les réserves conditionnelles, à 0), `padding-top: 6px` sur `.bolt-project-agent-transcript`, quai `.bolt-agent-statusline-dock` rendu seulement si `progressAnnotations.length > 0`, sans marge négative (`margin-top: -6px` en mobile pour se coller sous l'en-tête). Épinglé par `app/styles/agent-transcript-mobile.spec.ts` (3 tests) + `tests/e2e/ide-mobile-chrome.spec.ts` « fil de l'agent : … sans bande morte et sans être rogné » (rouge sur le build d'hier : boîte à 62). Déployé run 1541 (0f578f4), 08/09 06:10 UTC.

## Preuve

☐ live iPhone

