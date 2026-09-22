---
id: BUG-MESSAGE-MENU-IOS-001
---

## Bug

**P1 — iPhone : le menu à l'appui long sur un message ne marche pas** (Avi, 08/09 07:47, deux captures) : « s'affiche pas toujours au même endroit pour chaque message, jamais l'icône disparaît, sur un message de l'agent je comprends pas ce que je copie, ça fait bugger la page et je dois recharger ». Captures : barre flottante (copier / régénérer / modifier / pouce) posée à des hauteurs différentes, un rond « crayon » isolé qui flotte au milieu du texte, la barre reste après le geste.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 08/09 **DÉPLOYÉ EN PROD run 1554 (e4b2d7d), 08/09 14:23 UTC** — image web reconstruite, `helm upgrade` fait, étape « Verify running imageIDs match the release manifest » verte (les pods tournent bien cette image). — MESURÉ dans le code : chaque message tenait SON état de menu (hook par message) → un appui long sur un second message ouvrait un second menu sans fermer le premier (la barre de l'agent + le rond « Modifier » du message utilisateur, ce sont deux menus) ; position = sous le doigt (clientX/Y) → différente à chaque appui ; fermeture uniquement par le voile ou Échap → un défilement le laissait ouvert ; et rien n'empêchait Safari de sélectionner le texte et d'afficher sa bulle « Copier » par-dessus. Correctif : magasin partagé `menuDeMessageOuvert` (un seul menu dans tout le fil, clé `user:<id>` / `assistant:<id>`), ouverture au doigt AU-DESSUS DE LA LIGNE du message, centrée (`pointDOuverture`), fermeture au premier défilement (capture) et à tout appui hors du panneau, `-webkit-touch-callout: none` + `user-select: none` sur les lignes en mobile (copier passe par le menu).

## ✅ Testé live

☐ live iPhone

## Preuve

épinglé par `app/components/chat/message-context-menu.spec.ts` (pointDOuverture), `MessageContextMenu.spec.tsx` (un seul menu, défilement, câblage) + `tests/e2e/ide-mobile-chrome.spec.ts` « menu d'un message : un seul à la fois, posé au-dessus de la ligne, fermé au défilement »

