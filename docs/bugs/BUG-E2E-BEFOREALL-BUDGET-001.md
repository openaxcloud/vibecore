---
id: BUG-E2E-BEFOREALL-BUDGET-001
---

## Bug

**Un montage E2E qui dépasse son délai fait échouer des tests qui n'ont JAMAIS ÉTÉ TENTÉS.** Mesuré le 10/09 dans le **canari WebKit iPhone** du run E2E de #527 — sa toute première exécution : `"beforeAll" hook timeout of 30000ms exceeded` sur `agent-scroll-pill.spec.ts:142`. Le fil de test n'a jamais été semé ; le test a été compté `flaky` alors qu'AUCUNE assertion produit n'avait été tentée. Un rouge qui ne dit rien du produit, et qui use la tolérance qu'on accorde aux vrais rouges. **Mécanisme structurel, pas accidentel** : `playwright.config.ts` fixe `timeout: 30_000` ; les tests s'accordent ensuite 180 s par `test.setTimeout` — mais un `test.setTimeout` posé DANS un test **n'atteint pas le hook**. Tout `beforeAll` qui fait du réseau travaille donc sous un budget six fois plus court que les tests qu'il prépare.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

⚠️ **LE COMMENTAIRE N'AVAIT PROTÉGÉ QUE SON PROPRE FICHIER.** `agent-composer-panel-viewport.spec.ts` avait DÉJÀ rencontré ce piège et l'avait corrigé chez lui, avec un commentaire qui l'explique très bien. **Trois autres fichiers portaient exactement le même défaut** (`agent-scroll-pill`, `agent-action-list-density`, `mobile-device-matrix`) et le commentaire n'en a protégé aucun — la règle 15 mot pour mot. Les trois sont corrigés, et c'est la RÈGLE qui est tenue, pas l'occurrence (règle 7). épinglé par `tests/guards/montage-e2e-a-son-budget.spec.ts` : tout `beforeAll` de `tests/e2e` doit relever son propre délai, avec un témoin positif (le fichier qui a corrigé le piège le premier) et un contrôle de la MESURE elle-même (un corps de hook qui déborderait jusqu'aux tests attraperait leur `setTimeout` et rendrait la garde vide de sens). Contre-épreuve : le hook remis dans l'état où le canari l'a trouvé → rouge, fichier et ligne nommés. **Le canari a rendu son verdict complet** : `9 passed, 1 flaky, 3 skipped`, `webkit-iphone exit: 0` — et les 3 sauts sont délibérés et documentés (deux formats de bureau exclus d'un profil iPhone, un test qui pilote lui-même ses largeurs).

