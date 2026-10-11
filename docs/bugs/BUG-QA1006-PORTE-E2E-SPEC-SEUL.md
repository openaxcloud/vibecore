---
id: BUG-QA1006-PORTE-E2E-SPEC-SEUL
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Le mode « spec seul » de Production E2E (`workflow_dispatch`, entrée `spec`), fait pour prouver un correctif
sans la suite entière, rendait la porte ROUGE à chaque fois — même quand le test avait réussi quatre fois sur
quatre. Et la porte écrivait le dernier verdict lu, ce qui aurait fait d'un échec suivi d'une réussite un faux
vert.**

### Mesuré (2026-10-06)

Run 37437259815, `tests/e2e/retour-ne-recule-pas.spec.ts` seul : en mode spec seul, CHAQUE tranche joue tout le
spec. Les quatre rapports portent chacun ce test, réussi. La porte a répondu « ✖ un rapport ne porte AUCUN test ».

Trois défauts liés dans `scripts/e2e-gate.mjs` :
1. « vide » se mesurait comme « n'apporte aucun test NOUVEAU » : les tranches 2 à 4, qui rejouent le même test,
   étaient jugées vides ;
2. `results.set(key, …)` écrasait : avec un même test dans plusieurs rapports, le dernier verdict gagnait ;
3. la couverture attendait les 60 fichiers de la suite, pas le spec demandé.

Corriger le 1 seul aurait rendu le 2 atteignable : un faux vert. Les trois vont ensemble.

Conséquence pratique : ce mode était inutilisable, et prouver un correctif demandait la suite entière, avec ses
jobs et sa file d'attente — le goulot connu.

## Correctif

- « vide » = le rapport ne porte AUCUN test ;
- un échec n'est jamais écrasé par une réussite ;
- en mode spec seul (`E2E_SPEC`, posé par le workflow), la couverture attendue est ce fichier.

Épinglé par `tests/guards/porte-e2e-spec-seul.spec.ts` (la vraie porte, sur des rapports au format Playwright).
Contre-épreuves :
- porte d'origine → 3 cas rouges sur 4 ;
- protection « l'échec gagne » retirée seule → son cas rougit ;
- une tranche réellement vide est toujours refusée, et en suite entière un spec seul reste une couverture
  amputée.

Sur les VRAIS rapports du 2026-10-06 : run avec correctif → `rc=0` « ✔ gate passes » ; run de contre-épreuve →
`rc=1`, le test du retour en échec. Gardes `tests/guards` : 82/82.

## 📤

☑ session balayage, 2026-10-06

## 💻

☑ codé, en cours de preuve — branche `fix/porte-e2e-spec-seul`, non fusionnée

## ✅

☐

## Preuve

Épinglé par `tests/guards/porte-e2e-spec-seul.spec.ts`.
