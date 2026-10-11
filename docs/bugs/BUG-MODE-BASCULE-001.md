---
id: BUG-MODE-BASCULE-001
---

## Bug

**P1 — le mode choisi pendant le chargement de l'IDE est perdu : « Assistant » redevient « Agent » sans un mot, et le message suivant part en mode Agent (qui modifie le projet).** Trouvé le 01/10 en instruisant un test dit « instable » (`ide-mobile-chrome` › menus « Agent » et « Économique », rouge au 1er essai 19 fois sur 60 passages CI). À l'ouverture, l'IDE affiche d'abord une COQUILLE (`PendingComposerShell`, un `BaseChat` déjà utilisable), puis la remplace par le vrai chat quand la mémoire du projet arrive : React démonte et remonte BaseChat. La frappe et le focus traversaient déjà la bascule (passe-plat `composer-handoff.ts`) ; le mode, état local de BaseChat (`useState('agent')`) et `chatMode` de ChatImpl (`'build'`), non. Mesuré à 390, mémoire du projet retenue : choix « Assistant » pris dans la coquille, puis « Agent » après la bascule — 3 fois sur 3.

## 📤 Dispatché

☑ 01/10 (trouvé et traité par la session mobile)

## 💻 Codé

☐ branche `fix/mode-garde-a-la-bascule` poussée, pas encore sur `main`. Correctif : la coquille déclare chaque choix de mode au passe-plat (`setPendingComposerMode`, même portée que la frappe) ; au montage, BaseChat le reprend en phase layout et rend l'affichage ET le `chatMode` envoyé avec la requête.

## ✅ Testé live

☐

## Preuve

Contre-épreuve locale le 01/10 (`81a4e8c5d` + correctif, pile froide, sans nouvel essai, code servi vérifié) : avec le correctif 9/9 vert (dont la frappe, inchangée, en 390 et 1440) ; sans, 3/3 rouge « mode perdu à la bascule : « Assistant » est redevenu « Agent » ». Épinglé par `tests/e2e/agent-composer-input-handoff.spec.ts` « le mode choisi pendant le chargement survit à la bascule — mobile 390 » (vérifie aussi `chatMode: 'discuss'` dans la requête) + `app/components/chat/composer-handoff.spec.ts`. Point OUVERT tant que non servi et vu en production.
