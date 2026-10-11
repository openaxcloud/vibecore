---
id: BUG-TYPE-NOCHECK-008
---

## Bug

**DETTE — `app/components/chat/BaseChat.tsx` est exclu du typage par `// @ts-nocheck` (ligne 2), et personne ne le savait.** Le fichier fait **23 800 lignes** et porte le **panneau Agent** — l'écran où Avi passe son temps, et d'où vient la moitié des défauts visuels ouverts. Sa propre note interne donne le chiffre : « DETTE MESURÉE le 2026-08-30, directive retirée le temps de la mesure : **16 erreurs** », dont quatre `TS2304` sur le panneau Intégrations. **Conséquence mesurée le 2026-09-05** : tout `tsc` sur ce fichier rend « 0 erreur » quoi qu'on y écrive — vérifié en injectant `const __TEMOIN_TYPE: number = "pas un nombre"`, **jamais rapportée**, ni par `tsconfig.json` ni par `tsconfig.web.json` (où le fichier est pourtant listé). Plusieurs sessions y ont travaillé aujourd'hui en le croyant vérifié, et **tous les « 0 erreur dans BaseChat » annoncés le 2026-09-04 et le 2026-09-05 sont vides**, y compris ceux de #439 et #442. **Ce n'est pas une panne d'outil : tsc se tait à juste titre.** Un silence légitime est plus dangereux qu'une panne — il n'y a rien à réparer, donc rien qui alerte.

## 📤

—

## 💻

—

## ✅

❌

## Preuve

Directive lue en ligne 2 de `BaseChat.tsx`. Témoin : erreur de type injectée **dans ce fichier**, non rapportée ; la même erreur injectée dans `panel-payload-cache.ts` EST rapportée — c'est ce qui distingue « l'outil marche » de « l'outil regarde ce fichier ». Rendu explicite par `app/components/chat/panel-single-flight.spec.ts`. Correction non demandée à ce stade : le point est qu'il cesse d'être invisible.

