---
id: BUG-MESSAGE-FOOTER-HIDDEN-001
---

## Bug

**P2 — Fil de l'agent sur iPhone : le pied du dernier message de l'agent (« Léger · ×0.530 k jetons ») est caché sous la zone de saisie** (Avi, 08/09 07:48, entouré en rouge : « ce message qui s'affiche dans le dernier message de l'agent est caché »). Modèle imposé : Replit (captures 07:49 et 07:51) — sous le dernier message, deux lignes repliables « Worked for 2 minutes » (Time worked / Work done / Items read / Agent usage) et « Checkpoint made 25 days ago » (message du commit, date, boutons « Rollback here » et « Changes »), même police ; point de restauration créé AUTOMATIQUEMENT ; « Rollback here » ouvre la feuille « Rollback to this checkpoint? » (Files / Database / Agent memory, Cancel / bouton bleu) ; « Changes » ouvre le commit dans l'onglet Git. Suivi de parité : `REPLIT_PARITY.md` RP-CKPT-01…07.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 08/09 **DÉPLOYÉ EN PROD run 1554 (e4b2d7d), 08/09 14:23 UTC** — image web reconstruite, `helm upgrade` fait, étape « Verify running imageIDs match the release manifest » verte (les pods tournent bien cette image). — mesuré à 390 : composeur collant remonté de 80 px (barre du bas + 8) au-dessus du bas de la boîte qui défile → ses 80 derniers pixels passaient dessous (dernier message jusqu'à 677, composeur dès 642). La boîte réserve désormais ce soulèvement (`padding-bottom` de `.bolt-project-agent-scroll`, 0 clavier ouvert) ; les puces sont remplacées par le bloc FinDeTour (RP-CKPT-01…07).

## ✅ Testé live

☐ live iPhone

## Preuve

épinglé par `app/styles/agent-transcript-mobile.spec.ts` + `tests/e2e/ide-mobile-chrome.spec.ts` « fin de tour à la Replit »

