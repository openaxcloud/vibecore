---
id: BUG-TOOLTIP-TOUCH-001
---

## Bug

**P2 — Infobulles au doigt** : « Copier le message » au-dessus du menu (13:35), « Modifier et renvoyer ce message » sous le menu utilisateur (17:57), « Mode de l'agent : Économique… » sous le composeur après l'appui (sonde Chromium). `GlobalTooltip` affiche `data-vc-tooltip` (posé automatiquement depuis `aria-label`) au survol ET au focus ; au toucher les deux arrivent sans survol réel.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, déployé run 1509 (13ba717), 23:04 UTC) — un pointeur tactile ou stylet ne déclenche rien, un focus qui suit un toucher (1 s) non plus, ni aucun focus sur un appareil `hover: none`. Épinglé par `app/components/ui/infobulle-tactile.spec.ts`.

## ✅ Testé live

☐

## Preuve

Vaut pour tout l'IDE : c'est la règle, pas la première occurrence.

