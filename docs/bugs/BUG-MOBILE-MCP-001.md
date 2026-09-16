---
id: BUG-MOBILE-MCP-001
---

## Bug

**P1 — la feuille « Outils MCP » s'ouvre HORS de l'écran sur iPhone** (capture d'Avi 05/09 22:59, prod) : le panneau est ancré à droite de son déclencheur et déborde du viewport — titre « Outils MCP », bouton « Vérifier la disp… », « Aucun serveur M… », « Fermer » coupés ; le fil derrière est vide (fond gris). Inutilisable au doigt.

## 📤 Dispatché

☑ 05/09

## 💻 Codé

☑ 06/09 (`main`) — cause : `@keyframes vc-modal-in` animait `transform`, et `fill-mode: both` remplaçait le `translate(-50%,-50%)` de TOUTES les modales Radix (mesuré : 390 → left 195 px ; 1440 → left 720 px, bureau aussi). Animation passée sur `scale`. Mesuré après : left 12 px (390), 460 px (1440). Épinglé par `app/styles/ide-mobile-panels.spec.ts` + `tests/e2e/mcp-dialog-viewport.spec.ts`.

## ✅ Testé live

☐

## Preuve

Capture iPhone 22:59 ; preuve live locale Chromium.

