---
id: BUG-IDE-011
---

## Bug

**P0 (MOBILE) — le terminal se connecte mais n'accepte AUCUNE frappe.** Le PTY est pourtant sain : le WebSocket `/terminal?sessionId=terminal-managed` s'ouvre, la trame `hello` (`command:"/bin/jsh"`) part, et l'invite `/workspace $` s'affiche. Mais une commande tapée ne produit **aucun écho, aucune sortie, aucune trame émise** — et sur iPhone le clavier ne se lève pas.

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅ 19/08

## Preuve

**Repro live 17/08, viewport iPhone 13 (390)** — onglet Shell ouvert, appui au centre de la surface, saisie de `echo QA_MOBILE_TERMINAL` puis Entrée : l'écran reste à `Connexion à l'espace de travail… /workspace $`, inchangé. Trames observées sur le socket : **uniquement** `hello`. **Cause racine, mesurée** : après l'appui, `document.activeElement` reste la **div conteneur** (`h-full w-full`) — la zone de saisie de xterm n'est jamais focalisée. Relevé sur cette zone : `.xterm-helper-textarea` présente, `readOnly=false`, `disabled=false`, mais `opacity: 0` et **`z-index: -5`**, boîte `7×15` à `(113,172)` : l'appui atterrit sur l'élément qui la recouvre, la mise au point native de xterm ne se déclenche pas, donc aucune frappe n'est capturée ni transmise au PTY. **Correctif, mise en page GELÉE respectée** : `app/components/workbench/terminal/Terminal.tsx` — la surface reçoit un `onPointerDown` qui appelle `terminal.focus()` (xterm). `pointerdown` couvre tactile, souris et stylet d'un seul geste et s'exécute avant l'établissement du focus. **Aucun changement de balisage, de classe ni de disposition** — uniquement du comportement. Un terminal en lecture seule n'est pas focalisé (il n'accepte pas de saisie par construction). **Preuve rouge→vert** : `Terminal.focus.spec.tsx` — sans le correctif **2 tests rouges** (`expected "spy" to be called 1 times, but got 0 times`) ; avec, 3/3 verts (focus à l'appui, focus à chaque retour, jamais en lecture seule). **Certifié live 19/08** sur l'env de test redéployé (`web:de86d02bce`), aux **3 formats** (390/768/1440) : la surface xterm se monte, la frappe est **échoïsée** (`echo OK_390` visible à la saisie), la touche Entrée **exécute** (sortie `OK_390` affichée) et l'invite `/workspace $` revient. Mise en page mobile **inchangée** — je n'ai touché à rien, la référence gelée d'Avi est respectée. Capture : `terminal-390.png`.

