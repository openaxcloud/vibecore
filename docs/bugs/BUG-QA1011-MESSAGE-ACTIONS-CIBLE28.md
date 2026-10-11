---
id: BUG-QA1011-MESSAGE-ACTIONS-CIBLE28
section: "2026-10-11 — Reprise vérifiée"
---

# Le menu de message propose une cible de 28 px sur mobile et tablette

Mesuré dans les résultats JSON de Production E2E 38177258728 sur #714, head 6d5192a4 : `agent-panel-states.spec.ts` trouve le bouton « Message actions » à 28 × 28 px en 390 et 768 px, à chacun des trois essais. Les 66 fichiers attendus sont présents ; ce rouge vient d’une mesure, pas d’une annulation ni d’un manque de rapport.

La règle globale du chevron fixait 28 px sans plancher responsive. Le correctif utilise le jeton tactile existant sous 1024 px et sur pointeur grossier, tout en gardant le bouton absolu et la taille bureau. Le test local reprend le détecteur géométrique réel du scénario CI dans Chromium, sur le Sass compilé, avec témoin positif de la cible.

État : correction en préparation sur la branche de #714, pas sur main, pas servie. Le passage CI du nouveau head et la mesure utilisateur en production restent requis.
