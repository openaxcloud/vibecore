# A-37 — suite locale CommonJS et galerie

## Périmètre et verdict

Suite sur `audit/a37-local-20261012`, depuis le commit local validé
`643b320e7b7ff668b40c42cbd784d70909dcc785`, conservé sans amendement.
**A-37 reste ouvert.** Aucun appel IA, projet utilisateur, runtime distant,
publication, installation, GitHub API ni modification GCP. Aucun push.

Le [premier rapport](2026-10-12-a37-compilation-locale.md) reste la preuve du
lot ESM. Cette suite traite CommonJS et exécute réellement les compilateurs
et builds disponibles sur les instantanés du catalogue. Aucun gabarit de galerie
n'a été modifié sur la base d'une dépendance manquante ou d'une version différente.

## Défauts CommonJS reproduits et correctif séparé

Avant modification de cette suite : **3 tests rouges sur 5**. Les configurations
`module.exports = async ...` et `module.exports = Promise.resolve(...)` perdent
`base` après fusion HMR : `mergeConfig` recevait une promesse non résolue.
Le JavaScript émis échoue aussi sous TypeScript strict/checkJs/Node16 : TS2305
sur `mergeConfig`, TS7006 sur `env`, TS2349 sur la branche devenue `never`.

Le correctif :

- attend la configuration réelle avant fusion dans les wrappers HMR et API CJS ;
- conserve `require('vite')`, y compris celui de l'utilisateur, avec un type
  explicite limité à `defineConfig` et `mergeConfig`. Les déclarations ESM Vite
  sont sélectionnées par `resolution-mode: import` pour typer l'API réelle,
  car l'entrée CJS Vite 5 expose un `index.d.cts` non typé ;
- utilise JSDoc pour JavaScript et une annotation TypeScript pour `.cts` ;
- découvre les fichiers `.cjs` et `.cts` dans le vrai réparateur de manifest,
  sans ajouter un second `vite.config.ts` ;
- migre les footers connus, directs ou imbriqués dans le wrapper API, avant ou
  après l'ajout historique du port 5173. Les secondes passes sont idempotentes.

La revue indépendante a ajouté deux contre-épreuves essentielles. Un import
Vite dynamique injecté casse le chargement sous Vite 5 lorsque le fichier
contient aussi un `require('vite')` utilisateur ; la version finale conserve
CommonJS. Un `.cts` peut contenir `export default` : avant adaptation, cette
forme introduisait TS2305 ×2 et TS7006. Elle passe maintenant via le helper CJS
correctement typé, avec compilation et chargement effectifs. Les migrations
ESM antérieures reconnues dans un `.cts` et son fallback sont également testés.

Fichiers fonctionnels : `vite-hmr-config.ts`, `vite-api-serve.ts` et
`preview-manifest.ts` sous `app/lib/runtime/`. Nouvelle suite :
`vite-hmr-commonjs.spec.ts` ; les attentes existantes des suites HMR/API sont
actualisées. Aucune désactivation de TypeScript et aucun changement des scripts
de build des projets.

## Galerie : compilations réellement exécutées, preuve limitée

Commande reproductible, uniquement outils présents :

```sh
export PATH=/workspace/.onboarding/bin:$PATH
NODE_OPTIONS=--max-old-space-size=2048 pnpm exec tsx \
  scripts/audit/a37-gallery-local.ts /tmp/a37-gallery-results.json
```

Le script matérialise les **16 instantanés actuels** dans des répertoires
temporaires, sans modifier leurs fichiers, et réutilise `node_modules` restauré.
Il exécute `tsc --noEmit -p tsconfig.json`, puis les étapes réelles du build
lorsqu'elles sont disponibles. Un échec de `tsc -b` arrête son build avant Vite ;
un compilateur requis absent rend le build indisponible, jamais vert.
Il n'appelle ni installateur, ni serveur, ni application générée.

Compilateurs réellement présents : TypeScript **7.0.2** pour les gabarits qui
le demandent, **6.0.3** pour Next, **5.9.3** satisfaisant `~5.9.2` pour Expo.
Le bundler présent utilisé est **Vite 5.4.21**, pas le **8.1.4** demandé par la
galerie. React/types React **18** remplacent également le graphe React **19**
absent. Ces écarts sont consignés pour chaque dépendance dans le
[rapport brut](mesures/2026-10-12-a37-galerie-locale.json), avec les contentHash,
versions, codes de sortie et diagnostics complets.

**Aucun résultat ne certifie l'installation exacte d'un gabarit.** Il s'agit
bien d'exécutions réelles des sources avec le graphe restauré, pas d'une preuve
que les dépendances déclarées sont installables ou compatibles entre elles.

| Gabarit | Typecheck | Build | Limite constatée |
|---|---|---|---|
| docs-copilot | 0 | 0 | Graphe restauré différent |
| neon-trivia-arena | 0 | 0 | Idem |
| vendor-risk-review | 1 | 0 | sql.js et types Express absents ; build propre au gabarit = Vite seul |
| field-service-inspector | 2 | non exécuté | Expo et son tsconfig de base absents |
| revenue-cohort-explorer | 0 | 0 | Graphe restauré différent |
| qbr-generator | 1 | 0 | Types Express absents, deux arbres de types Vite incompatibles ; build = Vite seul |
| incident-postmortem-explainer | 0 | 0 | Graphe restauré différent |
| warehouse-layout-planner | 1 | 1 | three/types three absents ; arrêt au compilateur |
| pipeline-crm | 0 | 0 | Graphe restauré différent |
| storefront | 1 | 1 | sql.js, Stripe/types Express absents ; build échoue aussi |
| react-saas | 0 | 0 | Graphe restauré différent |
| next-dashboard | 2 | non exécuté | Next absent ; erreurs associées de types/configuration |
| fastify-api | 0 | non défini | Aucun script build dans le gabarit ; Fastify restauré 5.8.5 au lieu de 5.10.0 |
| ai-agent | 0 | 0 | Compilation seule, aucun appel IA |
| landing-page | non défini | 0 | Aucun typecheck déclaré ; Vite restauré différent |
| mobile-starter | 0 | 0 | Graphe restauré différent |

Bilan : **9/15 typechecks passent**, 6 échouent ; **11/13 builds exécutés
passent**, 2 échouent. Deux builds supplémentaires indisponibles et un non défini.
Les verts Vite de vendor-risk-review/qbr-generator ne masquent pas leurs échecs
de typecheck. Aucun nouveau défaut du code des gabarits n'est établi isolément
par les erreurs d'un graphe incomplet ou substitué.

Exécution séquentielle : 15,77 s, RSS maximal enfant 305 748 Kio, mesuré avec
`resource.getrusage(RUSAGE_CHILDREN)`. Le heap Node est plafonné à 1 536 Mio ;
cette option n'est pas une limite du compilateur natif TypeScript 7. Aucun swap,
limite mémoire cgroup 16 Gio. Mesure par enfant, pas somme du groupe.

## Les six diagnostics globaux exacts

`NODE_OPTIONS=--max-old-space-size=3072 npm_config_workspace_concurrency=1 pnpm typecheck`
s'arrête à l'étape web. Les six en-têtes sont **identiques** à ceux du premier
lot et de sa contre-épreuve sur les sources de base `e1ba08b68` avec ces mêmes
dépendances restaurées. Cela distingue ce lot d'un problème de base/environnement ;
ce n'est pas une affirmation sur la CI ou la production.

```text
app/lib/stores/workbench.ts(4398,30): error TS2345: Argument of type 'string | Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'FileSystemWriteChunkType'.
app/routes/api.projects.$id.files.$.tsx(97,23): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
app/routes/api.projects.$projectId.project-action.ts(55,23): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
packages/runtime-remote/src/index.ts(1165,9): error TS2322: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BodyInit | null | undefined'.
vite-electron.config.ts(20,29): error TS2769: No overload matches this call.
vite.config.ts(130,29): error TS2769: No overload matches this call.
```

Les deux dernières erreurs détaillent des `Plugin`/`PluginOption` incompatibles
entre les installations Vite 5.4.21 liées respectivement aux types Node 25.6.0
et 25.9.9. La [sortie complète non tronquée](mesures/2026-10-12-a37-diagnostics-globaux.txt)
conserve toutes les causes imbriquées. Aucun de ces six fichiers n'est modifié
par cette suite.

## Contrôles du lot et limites restantes

Validation finale : **6 suites, 72 tests verts**, code de sortie 0, dont
18 contre-épreuves CommonJS. Durée Vitest 23,62 s ; processus complet 25,77 s,
RSS maximal enfant 425 648 Kio, un worker et heap Node principal de 2 Gio.
Le build du projet temporaire de la suite ESM reste vert.

```sh
NODE_OPTIONS=--max-old-space-size=2048 pnpm exec vitest run \
  app/lib/runtime/vite-hmr-commonjs.spec.ts \
  app/lib/runtime/vite-hmr-config.compilation.spec.ts \
  app/lib/runtime/vite-hmr-config.spec.ts \
  app/lib/runtime/vite-api-serve.spec.ts \
  app/lib/runtime/preview-manifest.spec.ts scripts/index-a-jour.spec.mjs \
  --maxWorkers=1 --minWorkers=1

NODE_OPTIONS=--max-old-space-size=2048 pnpm exec tsc --noEmit --strict \
  --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler \
  --esModuleInterop --types node \
  app/lib/runtime/vite-hmr-commonjs.spec.ts \
  app/lib/runtime/vite-hmr-config.compilation.spec.ts \
  scripts/audit/a37-gallery-local.ts

NODE_OPTIONS=--max-old-space-size=3072 pnpm lint
git diff --check
```

Typecheck ciblé : sortie 0. Lint global : sortie 0, zéro erreur et 51
avertissements. Diff : aucune erreur d'espacement. Relecture indépendante finale
favorable et relance **18/18 CommonJS verts**, en 8,49 s avec un worker/heap
1,5 Gio, sans édition par le relecteur. Le dernier typecheck global après
finalisation du code rend encore les mêmes six diagnostics, archivés ci-dessus.

Aucun vert global n'est revendiqué : les étapes scripts/Electron/packages de
`pnpm typecheck` et le build global Vibecore restent non validés après l'arrêt web.
Le typage strict de tout le middleware API injecté reste hors preuve ; les tests
contrôlent sa composition et son comportement, pas une certification de tous ses
fichiers TS. Le chargement local des configurations ne vaut pas aperçu distant.

A-37 exige toujours une génération fraîche autorisée, la compilation du projet
final après toutes les transformations, un aperçu fonctionnel, une publication
et une interaction réelle sur l'URL publiée, associés au SHA livré. Ces preuves
ne sont pas acquises ici.
