---
id: BUG-METHODE-MODULE-MORT-001
---

## Bug

**LA RÈGLE derrière quatre défauts du même jour : un module que SEUL son propre spec importe.** Le code est juste, le spec est vert, la revue passe — il manque l'appel, et rien ne le rend visible. Quatre cas corrigés séparément le 10/09 (`analyserGeneration`, la prop `constat` du bandeau, `aptitude-fournisseur`, `generation-incomplete`) : les corriger un par un n'empêchait pas le cinquième. **Mesure sur `app/lib/**` + `app/utils/**` : 11 modules dans cet état**, dont `secrets-unifies.ts` (#522, écrit le jour même).

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

ligne de base épinglée par `app/lib/modules-morts.spec.ts` (10 tests), sur le modèle de celle du scanner i18n : elle rougit dans les DEUX sens — un module qui REJOINT la liste (une règle neuve que rien n'appelle) et un module qui la QUITTE (câblé : sa ligne doit être retirée délibérément, la liste ne peut pas se périmer en silence). Contre-épreuve faite dans les deux sens sur le dépôt réel. **Portée volontairement limitée** aux modules de logique : une route est montée par le routeur sans jamais être importée, et une garde qui l'accuse accuse 200 fichiers sains — leçon déjà payée par BUG-BUILD-ROUTE-EXPORT-001, dont la garde statique a dû être RETIRÉE pour cette raison exacte. ⚠️ **Un faux positif attrapé pendant l'écriture** : mon premier balayage déclarait `debugLogger.ts` mort ; il est en fait chargé par `import()` dynamique depuis cinq fichiers produit. Le scanner lit donc aussi les imports dynamiques et les ré-exports — sans quoi la garde aurait envoyé câbler du code déjà câblé. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1603 de `deploy-main.yml` (SHA `a670708ee`, qui contient ce commit — vérifié par `merge-base` ; marqueurs présents à la tête de `main`). Les quatre niveaux reconstruits (runtime, web, workspace-agent, admin), `Helm upgrade` 16:37:29→16:45:07, `Verify rollout` ✅, `Verify running imageIDs match the release manifest` ✅ 16:45:21→16:45:40 — les pods qui tournent portent les images construites depuis ce commit ; rollback resté `skipped`. ⚠️ Déployer n'est pas vérifier : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

