---
id: BUG-TEST-WEBKIT-001
---

# BUG-TEST-WEBKIT-001 — la validation mobile tourne sur un moteur que nos utilisateurs n'emploient pas

**Section** : Dette
**Gravité** : P1 — aucune panne directe, mais c'est le trou par lequel les
défauts mobiles nous arrivent par les yeux d'Avi au lieu des nôtres.

## Le constat

`playwright.config.ts` déclare bien un projet `webkit-iphone`
(`devices['iPhone 15 Pro']`), mais son `testMatch` ne retient que **quatre**
fichiers :

* `agent-message-density.spec.ts`
* `agent-scroll-pill.spec.ts`
* `agent-composer-panel-viewport.spec.ts`
* `ide-touch-targets.spec.ts`

Tout le reste de la suite mobile — les projets `mobile` et `tablet` — tourne sur
**Chromium**. Or Avi est sur **Safari iOS**, et les deux moteurs diffèrent
exactement là où nos défauts se logent.

## Ce que ça a déjà coûté, mesuré

* **2026-09-24, zoom iOS.** Mesuré sous Chromium : le composeur rendait 16 px,
  « donc pas de zoom possible ». Avi voyait pourtant un zoom. La reprise sous
  WebKit a montré un champ à **14 px** que Chromium n'avait pas signalé
  (`cm-content`, le `contenteditable` de CodeMirror) — et a confirmé, cette
  fois sur le bon moteur, que le composeur est bien à 16 px. Deux conclusions
  opposées selon l'instrument.
* **2026-09-01, barre d'actions d'un message.** La révélation dépendait de
  `:focus-within` sur une ligne rendue focalisable : Chromium focalise un
  conteneur non interactif au toucher, Safari iOS non. Vert sur Chromium, mort
  sur l'iPhone d'Avi.

## Ce qu'il faudrait

1. Faire tourner sous `webkit-iphone` les parcours mobiles qui décident :
   création de projet depuis un prompt, panneau Agent de bout en bout, Webview
   et aperçu, feuilles du composeur, onglets mobiles.
2. Ajouter au projet une garde de police : aucun champ de saisie atteignable ne
   descend sous 16 px, puisque c'est le seuil d'iOS. La mesure existe déjà
   (balayage `input, textarea, select, [contenteditable]` sur la page rendue) ;
   il lui manque un test.
3. Mesurer le coût en temps avant d'élargir : la suite mobile Chromium est déjà
   l'étape la plus longue de la CI, et doubler le moteur double la facture.

## Ce que ceci ne couvre pas

Playwright n'émule **ni le clavier iOS ni le zoom automatique de Safari** :
`visualViewport` reste à la taille de la fenêtre et `scale` à 1, avant focus,
après focus et après frappe. Les défauts qui dépendent du rétrécissement de la
zone visible restent invérifiables en CI, sur WebKit comme sur Chromium. Ils
demandent un appareil réel ou le simulateur iOS.
