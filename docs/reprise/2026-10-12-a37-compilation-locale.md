# A-37 — compilation locale du code actuel

## Verdict et base

**A-37 reste ouvert.** Un défaut actuel du post-traitement ESM HMR est reproduit
et corrigé localement. Aucune génération IA, clé, application utilisateur,
publication, dépense ou opération GCP. Aucun accès GitHub API, push ou PR.

Dépôt propre au départ. `git fetch origin main` autorisé a actualisé la référence
`7ce2aa9ce` vers `e1ba08b68`. La branche personnelle
`audit/a37-local-20261012` part de cette référence, descend de `cb4b7821e`
et conserve #723. Aucun changement des prompts ni des délais de génération.

## Chemins réellement inspectés

- `services/api/src/app.ts`, `starterFiles` : une création `sourceType: ai`
  ne fournit qu'un README. Les fichiers de l'application viennent ensuite du
  modèle ; aucun gabarit de jeu avec `MAX_HISTORY` n'a été retrouvé dans le code
  produit actuel. Un test artificiel ne reconstitue pas une sortie IA historique.
- Même fichier, `vitePackageJson` / `viteConfigTs` : starter générique React/Vite,
  build `vite build`, lecture de `process.env` pour HMR. Ce build transpile,
  sans promettre un typecheck TypeScript strict ; aucun changement ici.
- `packages/template-catalog/src/server.ts`, `scaffolds.ts` et `apps/*` : les
  créations depuis le catalogue recopient de vrais instantanés. Plusieurs
  déclarent `tsc -b && vite build`, avec TypeScript 7.0.2, Vite 8.1.4 et plugin
  React 6.0.3. Ce graphe exact n'est pas restauré intégralement ici : **pas de
  validation complète de la galerie avec substitution silencieuse de versions**.
- `app/services/agent/post-validate.ts`, `validateGeneratedFiles`, et
  `app/lib/stores/workbench.ts`, `#validateWorkspaceImportsAfterArtifactClose` :
  validation du contenu/imports, distincte d'une compilation du projet installé.
- `workbench.ts`, `#syncPreviewManifestFromRuntimeOnce` : Project Doctor, puis
  `buildPreviewManifestRepair`, puis écriture des fichiers supplémentaires.
  C'est là que `vite-hmr-config.ts` transforme une configuration existante,
  éventuellement suivie de `vite-api-serve.ts`.
- `services/api/src/deploy-workspace-build.ts` et `deployments.ts` : installation,
  exécution de la commande de build, rejet d'un exit non nul, puis récupération
  de l'artefact. Le lot ne contourne aucune de ces étapes et ne les appelle pas
  contre un runtime distant.

## Rouge puis vert et contre-épreuves

Le nouveau test `app/lib/runtime/vite-hmr-config.compilation.spec.ts` matérialise
un projet temporaire, avec `strict: true`, configuration Vite incluse dans le
projet TS, et build `tsc -b && vite build`. Il réutilise les dépendances restaurées
par lien local, sans installation. Le graphe satisfait les plages du réparateur
(`typescript ^5.7.2`, `vite ^5.4.19`) ; il ne constitue pas une installation
hermétique des dépendances d'un projet client.

Avant correction : **6 tests rouges**, diagnostics TS7006 sur `env` et TS2349
sur la configuration objet. Le compilateur accepte les configurations source
avant post-traitement ; les tests gardent cette contre-épreuve.

Après correction : configurations objet, fonctions avec/sans argument, fonction
async et promesse compilées ; chargement réel par `loadConfigFromFile`, maintien
de `base` et du port utilisateur sans proxy, puis port 5173/strictPort/HMR 443
avec proxy. Les sorties restent du JavaScript valide pour `.js`/`.mjs`.
Migration des anciens wrappers, idempotence et composition HMR/API contrôlées.

Une application au graphe d'import/export cohérent construit réellement `dist`.
Retirer l'export `MAX_HISTORY` produit TS2305, sans désactivation du compilateur.
Ce mutant prouve le contrôle, **pas** un défaut actuel du catalogue.
Le retrait de `types: ['node']` n'a pas reproduit l'ancien échec `process` avec
le graphe restauré : les déclarations Vite référencent transitivement Node.
Il faut donc vérifier le graphe et le tsconfig réels de toute future application.

## Commandes et résultats

Toutes les commandes utilisent `export PATH=/workspace/.onboarding/bin:$PATH`,
pnpm 9.14.4, les dépendances déjà restaurées, et aucun appel réseau.

```sh
NODE_OPTIONS=--max-old-space-size=3072 pnpm exec vitest run \
  app/lib/runtime/vite-hmr-config.compilation.spec.ts \
  app/lib/runtime/vite-hmr-config.spec.ts \
  app/lib/runtime/vite-api-serve.spec.ts \
  app/lib/runtime/preview-manifest.spec.ts scripts/index-a-jour.spec.mjs \
  --maxWorkers=1 --minWorkers=1

NODE_OPTIONS=--max-old-space-size=2048 pnpm exec tsc --noEmit --strict \
  --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler \
  --esModuleInterop --types node \
  app/lib/runtime/vite-hmr-config.compilation.spec.ts \
  app/lib/runtime/vite-hmr-config.spec.ts
NODE_OPTIONS=--max-old-space-size=3072 npm_config_workspace_concurrency=1 pnpm typecheck
NODE_OPTIONS=--max-old-space-size=3072 pnpm lint
node scripts/migrer-inventaire-bugs.mjs --index
git diff --check
```

- Validation finale : **5 suites, 54 tests verts**, dont 12 nouvelles
  contre-épreuves de compilation/configuration ; code de sortie 0, 16,05 s
  Vitest (17,79 s processus complet). Build du projet temporaire inclus.
- Versions finales exécutées : Node 24.19.0, TypeScript 5.9.3, Vite 5.4.21.
- Typecheck ciblé des deux suites et de leurs modules importés : sortie 0.
- `pnpm lint` global : sortie 0, **0 erreur, 51 avertissements existants**.
- `pnpm typecheck` global : sortie 1, **6 diagnostics web**, avant les étapes
  scripts/Electron/packages. Quatre incompatibilités `Uint8Array<ArrayBufferLike>`
  dans workbench, deux routes API et runtime-remote ; deux TS2769 dus aux arbres
  de types Vite distincts dans les configurations Vite web/Electron.
  Aucun de ces fichiers n'est corrigé dans ce lot.
- Contre-épreuve de base : même TypeScript et même tsconfig web avec un
  `CompilerHost.readFile` substituant les contenus `git show HEAD:<chemin>` des
  fichiers modifiés, sans toucher le checkout. **Les mêmes six diagnostics**
  (mêmes chemins, positions et codes) subsistent. Les problèmes globaux sont
  donc déjà présents sur la base avec ces dépendances restaurées.
- Le build global Vibecore n'a pas été lancé après cet échec ; seul le build
  réel du projet temporaire est validé. Aucune CI native n'a été exécutée.
- Index de bugs régénéré : 418 entrées, puis ses 6 tests relancés et verts
  après finalisation des états documentaires. `git diff --check` : sortie 0.

Mémoire : limite cgroup 16 Gio, aucune swap ; environ 17 348 Mio disponibles
au départ au niveau machine. Vitest utilise un seul worker, heap principal
plafonné à 3 Gio et compilateurs enfants à 1 Gio. La relecture a utilisé un
worker à 2 Gio ; le typecheck a été lancé avec concurrence pnpm limitée à 1.
Mesure finale par `resource.getrusage(RUSAGE_CHILDREN)` : **430 520 Kio** de RSS
maximal enfant (maximum individuel, pas mémoire cumulée du groupe).
`/usr/bin/time` étant absent, la mesure a été faite avec Python, sans installation.
Les sorties brutes de cette session restent dans `/tmp/a37-*.log`.
Mesure compacte conservée dans [le JSON local](mesures/2026-10-12-a37-compilation-locale.json).

## Relecture et preuve encore requise

Relecture indépendante du diff et exécution séparée : 3 suites HMR/API/
compilation, **32 tests verts** sur le lot avant l'ajout de trois contre-épreuves
supplémentaires. Aucun défaut nouveau bloquant relevé dans le périmètre ESM.
La revue a détecté le risque réel de fusionner une promesse comme un objet vide :
le correctif API et les tests de composition répondent à cette observation.

CommonJS reste inchangé. Le typage strict de tout le middleware API injecté
n'est pas validé par les tests de compilation HMR : les tests API exercent ici
son comportement réel. Ces limites interdisent de généraliser le vert à toute
application générée.

La validation supplémentaire doit porter sur les **fichiers finaux après**
`#syncPreviewManifestFromRuntimeOnce`, donc après Doctor, manifest, HMR et API,
avec leurs dépendances et leur configuration TS effectives. Compiler seulement
le dépôt Vibecore, ou contrôler le prompt avant ces transformations, ne suffit pas.
Pour clôturer A-37 : génération fraîche autorisée sur version livrée identifiée,
compilation/build du projet final, aperçu réellement fonctionnel, publication,
URL publiée et interaction centrale. Aucune de ces preuves live n'est acquise ici.
