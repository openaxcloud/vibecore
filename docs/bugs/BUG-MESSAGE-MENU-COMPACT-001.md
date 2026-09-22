---
id: BUG-MESSAGE-MENU-COMPACT-001
---

## Bug

**P1 — Menu d'un message sur iPhone (appui long) : boîte trop grosse avec libellés, cachée derrière la zone de saisie sur le premier/dernier message, et le fil disparaît derrière (fond gris vide)** (Avi, 07/09 08:03, deux captures : « ça affiche une boîte de dialogue trop grosse, on n'a pas besoin du contenu, il faut que les icônes ; parfois on la voit pas si je prends le premier ou dernier message, c'est caché ; on ne voit plus le contenu à l'arrière-plan, c'est pas Fortune 500 »). Mesuré sur WebKitGTK à 390 (sonde `webkit-probe.mjs menu-dernier` / `menu-peinture`), trois causes : (1) le VOILE du menu (`.bolt-message-context-menu-veil`, plein écran) était peint en couleur de carte — rgb(238 242 247) — par la règle de thème des bulles `body :where([class*='message'] …) { background-color }`, qui attrape tout élément dont la classe contient « message » : c'est ce qui vidait le fil (déjà visible sur la capture WebKit du 06/09, que j'avais lue sans la regarder) ; (2) rendu DANS la bulle, le menu restait dans le contexte d'empilement du fil et le composeur collant (z-index 50, frère du fil) passait devant : sur le dernier message, menu jusqu'à 744 px pour une zone de saisie à 647 ; (3) 305 × 253 px de libellés pour cinq actions. Et Échap ne fermait pas : le gestionnaire de raccourcis du projet consomme la touche (`stopPropagation`) avant tout écouteur en bouillonnement.

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main`) — voile `background: transparent` explicite ; menu rendu par portail à la racine du gabarit mobile (comme les feuilles du composeur) ; sur téléphone une BARRE D'ICÔNES (cinq disques de 44 px, libellés dans `aria-label`, trait vertical entre actions et avis) posée au-dessus du doigt, centrée, jamais sous l'en-tête ni sous la zone de saisie (`placerLaBarre`) ; focus sans défilement ; Échap en phase de capture. Le bureau garde ses libellés. Vérifié sur Chromium (E2E) et WebKitGTK à 390 : barre 249 × 54 à 425–479 px pour un doigt à 491 et une zone de saisie à 647, fil peint derrière. Épinglé par `app/components/chat/message-context-menu.spec.ts` (placerLaBarre), `app/components/chat/MessageContextMenu.spec.tsx` (portail), `app/styles/ide-mobile-panels.spec.ts` (§21) et `tests/e2e/ide-mobile-chrome.spec.ts` (menu contextuel : barre de 44 px nommée ; dernier et premier message : au-dessus de la zone de saisie, sous l'en-tête, fil immobile ; français : dans l'écran sans infobulle).

## ✅ Testé live

☐

## Preuve

07/09 08:03.

