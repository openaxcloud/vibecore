---
id: BUG-BUILD-ROUTE-EXPORT-001
---

## Bug

**⚠️ MA FAUTE — j'ai cassé la construction sur `main` (run 1578, `8d0bff8`, refusé en 100 s).** En corrigeant BUG-STORAGE-001 j'ai EXPORTÉ une fonction depuis un module de route pour pouvoir la tester. React Router considère tout export d'un module de route comme un export de ROUTE, en retire le code serveur, et s'arrête : « But other route exports in '…' depend on `~/lib/enterprise-api.server` » → `PLUGIN_ERROR`.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**CE QUI A LAISSÉ PASSER LA FAUTE** : j'avais lancé `typecheck` et les 8151 tests unitaires, tous verts, mais **PAS `pnpm run build`** sur ces commits-là. Typecheck et tests ne sont pas la construction. Les deux fonctions vivent désormais dans `app/lib/ide/` et la route les importe ; construction verte. **GARDE STATIQUE TENTÉE PUIS RETIRÉE, et c'est délibéré** : deux formulations, deux règles FAUSSES — « aucun export étranger dans une route » accusait 89 fichiers sains, puis « … dans une route qui importe du `.server` » en accusait encore 41, alors que la construction les accepte tous. Un test qui accuse ce qui va bien ne protège de rien : on finit par le désactiver. La construction reste l'autorité, et la vraie correction est de PROCÉDÉ. **ET J'AI RECOMMENCÉ AU COUP SUIVANT, autrement** : le run 1579 (`ecc11f3`) a été refusé sur **Production CI**, cette fois parce que mon correctif BUG-GIT-002 ajoutait une phrase anglaise EN DUR (`new Error('A workspace id or project id is required…')`) et que le garde `pnpm run i18n:check` interdit toute nouvelle copie codée en dur. Je ne l'avais pas lancé non plus. Deux refus, deux gardes que j'avais sautées. **La leçon n'est donc pas « lancer le build » mais « lancer CE QUE LA CI LANCE »** : `lint`, `i18n:check`, `typecheck`, `test`, `build` — les cinq, dans cet ordre, avant toute poussée. Corrigé en faisant porter au message le CODE lui-même, via une constante partagée : les mots pour l'utilisateur restent dans le catalogue, traduits. Les cinq gardes sont vertes. **✅ SERVI EN PRODUCTION — run 1580 (`36d0610`), 17:20 UTC**, vérifié étape par étape et non sur la couleur : quatre étages construits (runtime 16:14→16:48, **web** 16:48→16:58, workspace-agent, admin), porte de vulnérabilités et signatures cosign vertes, `helm upgrade` par empreinte 17:12→17:19, « Verify rollout » 17:19 et « Verify running imageIDs match the release manifest » 17:20. **GARDE POSÉE LE 10/09** (le correctif était là, rien ne l'épinglait — règle 16 non satisfaite). ⚠️ La règle GLOBALE serait fausse : « aucun module de route n'exporte quoi que ce soit touchant un binding serveur » produit **quinze faux positifs** mesurés sur des fichiers sains. La garde est donc posée à la maille DU FICHIER qui a cassé. Trois assertions, trois mutations, trois rouges vérifiés — dont la plus utile : `required-checks.json` exige des jobs PAR NOM, donc **renommer un job dans `ci.yml` décâblait silencieusement la porte de livraison** et la prod serait passée sur un contrôle qui ne contrôle plus rien. épinglé par `tests/guards/exports-de-route-et-portes-ci.spec.ts`.

