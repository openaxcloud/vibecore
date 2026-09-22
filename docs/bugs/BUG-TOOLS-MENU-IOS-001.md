---
id: BUG-TOOLS-MENU-IOS-001
---

## Bug

**P1 — Zone de saisie sur iPhone : le menu « ••• » s'ouvre au mauvais endroit, coupé, par-dessus le composeur** (Avi, 07/09 08:07, deux captures : « la boîte de dialogue qui s'ouvre n'est toujours pas fixée, on ne voit rien ; assure-toi aussi que chaque item de cette boîte s'ouvre parfaitement, responsive et adapté à tous les écrans »). Même mécanique que BUG-COMPOSER-MENUS-IOS-001 : le menu se rend DANS le composeur (confinement, collant, défilement) — le portail du 06/09 n'a été posé que sur « Agent » et « Économique ». Et une deuxième chose attrapée en ouvrant chaque entrée : la palette de design (popover Radix) sortait de 85 px par le haut à 390 (620 px de contenu pour 469 disponibles au-dessus de la feuille). Et deux autres, en cliquant DANS ce qui s'ouvre : « Ouvrir Supabase » n'ouvrait RIEN — sur téléphone comme sur bureau (le menu se fermait à l'ouverture et démontait l'entrée qui porte le dialogue ; sonde probe-supabase.mjs : 0 dialogue) ; un clic dans le dialogue MCP le faisait disparaître (le gestionnaire « clic dehors » du menu ne connaissait pas les surfaces ouvertes depuis lui ; sonde probe-menu-dialogs.mjs).

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main`) — le menu « ••• » se rend par portail à la racine mobile (`porterSurTelephone` dans ChatBox, un appui dedans n'est plus « dehors ») : feuille ancrée sur le socle, six entrées entières (palette, outils MCP, récupérer une URL, Supabase, améliorer le prompt, paramètres de l'agent) ; la palette se borne à `--radix-popover-content-available-height` ; un appui dans un dialogue, un popover ou la feuille n'est plus « dehors » ; « Ouvrir Supabase » ne ferme plus le menu à l'ouverture. Deux autres trouvés en mesurant : la palette posée à 12 px avait son titre SOUS l'en-tête fixé (marge de collision haute à 64 px) ; les dialogues Radix (z 9999) passaient SOUS les feuilles du téléphone (z 12021–12022) — `bolt-dialog-overlay` / `bolt-dialog-content` à 12059 / 12060 sur téléphone, un dialogue est modal. Le test E2E exige pour chaque entrée (hors « paramètres ») une surface neuve, dans l'écran, sous l'en-tête, PEINTE au-dessus de tout, et qui survit à un appui dedans. Vérifié sur Chromium (E2E, 390 et 820 : chaque entrée ouverte, sa surface dans l'écran) et WebKitGTK à 390. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§22) + `tests/e2e/ide-mobile-chrome.spec.ts` (menu « ••• », téléphone 390 et tablette 820). Note : l'icône Supabase du menu vient de `cdn.simpleicons.org` (image externe) — absente si ce domaine est bloqué.

## ✅ Testé live

☐

## Preuve

07/09 08:07.

