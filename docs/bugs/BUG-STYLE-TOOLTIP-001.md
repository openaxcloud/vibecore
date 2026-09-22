---
id: BUG-STYLE-TOOLTIP-001
---

## Bug

**P1 — l'ancrage des infobulles pesait (0,2,0) et écrasait le style de tout composant portant `data-vc-tooltip`.** `[data-vc-tooltip]` compte (0,1,0) et **`:not()` compte la spécificité de son argument**, d'où (0,2,0) — au-dessus de n'importe quelle classe simple à (0,1,0). Deux victimes mesurées : `.bolt-agent-scroll-to-bottom` (pastille hors écran, corrigée par contournement le 01/09) et `.bolt-message-menu-trigger` de #387 — `position: absolute` écrasé en `relative`, donc un bouton **invisible** (`opacity: 0`) occupant **28 px de flux dans chaque message d'agent**. Expérience contrôlée, même bulle, variable isolée : **64 px** telle quelle, **36 px** le bouton retiré du DOM, **36 px** `position: absolute` forcé. #387 gagne 44 px en sortant le pied d'actions du flux et en rendait 28 : gain net **16 px au lieu de 44**. Ce qui rend le défaut coûteux : la source dit `absolute`, la feuille **servie** dit `absolute`, seul le **calculé** dit `relative`. **47 éléments** portent `data-vc-tooltip` sur la seule page IDE — ce n'étaient pas deux accidents, c'étaient deux tirages sur 47.

## 📤 Dispatché

☑ 05/09

## 💻 Codé

☑ 05/09 (`fix/regle-infobulle-specificite`, `3ab748771`) — `:where()` autour de l'attribut ET de l'argument de `:not()` ramène la règle à (0,0,0) : elle s'applique toujours quand rien ne la concurrence, et la moindre classe la bat. Correctif porté sur la RÈGLE, pas sur ses victimes.

## ✅ Testé live

☐

## Preuve

Mesure live (env d'audit, SHA `e77b61af5b`) : 64 → 36 px, variable isolée. **Épinglé par `app/styles/tooltip-anchor-specificity.spec.ts`** — le test extrait le sélecteur de la feuille et CALCULE sa spécificité, il ne lit aucun commentaire ; son calculateur porte ses propres témoins dont `[attr]:not([attr]) === 2`. Contre-épreuve : ancienne règle → `FAIL, l'ancrage pèse 2 contre 1` ; ancrage cassé → `1 failed \

