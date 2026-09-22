---
id: BUG-CI-004
---

## Bug

**P2 — `Quality Gates` echoue quand une execution HOMONYME depassee a ete annulee.** Un rouge qui n'est pas un defaut de la PR.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **OUVERT — mesure en prod 01/09**

## Preuve

L'action d'attente exige que TOUTES les executions portant le nom `Install, test, build, scan` soient `success` ou `skipped`. Or `ci.yml` annule les executions depassees sur une PR (a raison). Il reste donc sur la tete DEUX executions homonymes, une `success` et une `cancelled`, et la porte echoue. **Mesure** : #321, tete `35e863b8`, deux executions — `success` (17:48) et `cancelled` (17:33) ; journal : « The conclusion of one or more checks were not allowed. Allowed conclusions are: success, skipped ». Il a fallu relancer l'annulee puis rejouer la porte. **Ne PAS corriger en ajoutant `cancelled` aux conclusions autorisees** : une execution reellement annulee passerait pour verte. La correction juste est de ne considerer que l'execution la PLUS RECENTE par nom — a instruire separement.

