---
id: BUG-AGENT-PROGRESS-SUMMARY-001
---

## Bug

**P2.** Le bloc d'optimisation de contexte ouvre `summary` puis `context` ; son `catch` n'écrivait qu'une annotation terminale, pour `context`. Un rejet de `createSummary` (429, dépassement de fenêtre — soit la situation même qui déclenche le résumé, abandon client) sautait par-dessus le `complete` de `summary`. La déduplication côté client étant indexée par étiquette, l'étape restait vivante : « Analysing request 66 % » avec l'anneau qui tourne, SOUS une réponse complète.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

corrigé au niveau de la RÈGLE : `creerSuiviDeProgression` enveloppe l'écriture et le chemin d'échec solde ce qui reste sans nommer les étiquettes + épinglé par `app/lib/.server/llm/progression-a-solder.spec.ts` (10 tests). Contre-épreuve : `catch` revenu à une étiquette nommée → 2 rouges. Commit `30addfe04`. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1597 de `deploy-main.yml` (SHA `e435692a1`, qui contient ces commits — vérifié par `merge-base` et par le comptage des marqueurs à ce SHA) : `Helm upgrade` 11:00:52→11:07:45, `Verify rollout` ✅, et surtout `Verify running imageIDs match the release manifest` ✅ — les pods qui tournent portent bien les images construites depuis ce commit ; l'étape de rollback est restée `skipped`. ⚠️ Le déploiement n'est PAS une vérification live : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

