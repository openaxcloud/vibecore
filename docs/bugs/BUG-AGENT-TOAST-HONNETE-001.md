---
id: BUG-AGENT-TOAST-HONNETE-001
---

## Bug

La moitié VISIBLE de la garde d'honnêteté était du code mort. `AppliedFilesToast` acceptait déjà une prop `constat`, savait afficher « la génération s'est arrêtée en route » et nommer le module manquant — mais son seul appelant ne l'acceptait même pas en argument. Le bandeau annonçait « les patchs ont bien été appliqués », coche verte comprise, sur une application sans point d'entrée.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

relais posé (`constatDeGenerationStore`), remis à zéro à l'ouverture de chaque artefact pour qu'un constat périmé ne teigne pas le tour suivant ; le bandeau passe en `warning` sans fermeture automatique quand le constat est malhonnête + épinglé par `app/components/chat/applied-files-toast-honnete.spec.tsx` (8 tests). Contre-épreuve : relais retiré et ton remis à « success » → 2 rouges. Commit `c9f01892c`. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1597 de `deploy-main.yml` (SHA `e435692a1`, qui contient ces commits — vérifié par `merge-base` et par le comptage des marqueurs à ce SHA) : `Helm upgrade` 11:00:52→11:07:45, `Verify rollout` ✅, et surtout `Verify running imageIDs match the release manifest` ✅ — les pods qui tournent portent bien les images construites depuis ce commit ; l'étape de rollback est restée `skipped`. ⚠️ Le déploiement n'est PAS une vérification live : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran. **CORRIGÉ LE 10/09.** Le bandeau a DEUX points d'entrée : `BaseChat.tsx` passait le constat du tour, `app/utils/toast-batcher.ts` non — et peignait « les patchs ont bien été appliqués » avec sa coche verte même sur une génération sans point d'entrée, c'est-à-dire le mensonge exact que cette garde existe pour empêcher. C'est ce chemin qui sert quand le lot est groupé par le batcher. La garde ne visait qu'UN appelant ; elle vise maintenant la RÈGLE (règle 7), avec un cas qui confronte la liste écrite à la main au dépôt — sans lui, un troisième point d'entrée non inscrit rendrait la garde muette. épinglé par `app/components/chat/applied-files-toast-honnete.spec.tsx`. Contre-épreuve : constat retiré du batcher → rouge.

