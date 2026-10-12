# A-37 — restauration isolée et validations sur le lockfile

## Résultat

Depuis `7de14a8f29fdb0b18c4d034447f347ca3a801ddd`, worktree séparé
`/workspace/vibecore-offline-20261012`, branche `audit/a37-offline-20261012`.
Les trois commits précédents restent intacts ; le worktree initial n'est pas
réinstallé. Aucun manifeste, lockfile ou réglage de sécurité du dépôt modifié.

Après restauration hors ligne et deux corrections ciblées des outils d'audit :

- **Typecheck global : code 0**, web 33,0 s, scripts 2,3 s, Electron main
  1,2 s, preload 0,9 s, packages du workspace 68,9 s.
- **Six suites A-37, 72 tests verts**, code 0, durée 20,77 s. Compilation,
  chargement Vite et build de la fixture exécutés réellement ; le test
  d'export manquant rejette toujours TS2305.
- **324 dépendances directes vérifiées contre les importeurs du lockfile :
  zéro écart** après les tests. TypeScript 5.8.3, types Node 25.6.0 ; Vite
  5.4.21 et plugin React partagent la même instance physique avec les peers
  verrouillés. Aucun défaut de conversion binaire applicatif établi.

[Typecheck complet](mesures/2026-10-12-offline-typecheck-green.txt),
[72 tests](mesures/2026-10-12-offline-tests-green.txt),
[versions, liens réels et scripts non exécutés](mesures/2026-10-12-offline-links-final.json).

## Restauration autorisée

Le cache déjà présent est `/workspace/.onboarding/pnpm-store/v3`.
La sélection pnpm dans le dépôt donne bien **9.14.4**. Commande utilisée :

```sh
export PATH=/workspace/.onboarding/bin:$PATH
CI=true COREPACK_ENABLE_NETWORK=0 NODE_OPTIONS=--max-old-space-size=2048 \
  pnpm install --offline --frozen-lockfile --ignore-scripts \
  --store-dir /workspace/.onboarding/pnpm-store \
  --child-concurrency=1 --network-concurrency=1 --reporter=append-only
```

La première exécution, sans `CI=true`, passe en 30,9 s. La seconde, nécessaire
après l'incident décrit ci-dessous, passe en 1,3 s. Le premier journal atteste
**downloaded 0** ; le second indique « Already up to date » puis le rétablissement
des trois liens, en mode offline, sans compteur de téléchargement distinct :
[première](mesures/2026-10-12-offline-restore-initial.txt),
[seconde](mesures/2026-10-12-offline-restore-final.txt).
`ignore-scripts` reste actif ; aucun `rebuild` ou script d'installation n'a été
lancé explicitement. Aucun paquet requis manquant n'a bloqué l'installation.

La liste `pendingBuilds` reste conservée dans la preuve JSON : esbuild,
watcher, protobufjs, Prisma/engines, workerd, sharp, msgpackr-extract,
core-js, electron-winstaller, re2, node-pty et le projet racine. Aucune
reconstruction de ces composants n'a été nécessaire aux validations exécutées.
Leur fonctionnement natif complet n'est pas certifié par ce lot.

## Deux défauts de l'outillage local corrigés

### Import du script galerie

La première restauration fait disparaître les six anciens diagnostics web.
Le contrôle global atteint alors `tsconfig.scripts.json` et révèle TS2835
sur l'import relatif sans extension de `a37-gallery-local.ts`, puis TS2345
sur `content` devenu `unknown` faute de résolution.
[Preuve rouge](mesures/2026-10-12-offline-typecheck-red.txt).

L'ajout de `.js` à l'import `template-catalog/src/server` respecte NodeNext
et suit le script existant `seed-gallery-real-apps.ts`. Le contrôle global
passe ensuite, sans cast ni assouplissement TypeScript.

### Build de fixture et sélection du gestionnaire de paquets

Une première exécution des 72 tests a réécrit les liens du worktree restauré
vers TypeScript 5.9.3, types Node 25.9.9 et le contexte Vite divergent.
Les trois liens ont l'horodatage identique `08:30:29.724273480 UTC`, pendant
le test de build. Le shim `.bin/tsc` réécrit contient le chemin de cette fixture
`/tmp/vibecore-hmr-compile-pTqI0r` : la mutation provient du build temporaire
qui partage `node_modules`, et non d'un nouveau défaut applicatif.

Le test lançait `pnpm run build` avec la fixture comme répertoire courant.
Hors dépôt, Corepack sélectionne **12.11.2**, constaté avec `pnpm --version`
et son `lastKnownGood.json`, au lieu de 9.14.4. La source locale d'un autre
pnpm récent, **11.25.0**, contient un contrôle pré-script configuré pour
installer les dépendances ; elle explique le mécanisme plausible, mais n'est
pas présentée comme le code source exact du binaire natif 12.11.2.

Cette installation implicite n'était pas prévue ni autorisée comme telle.
Le sous-processus héritait de `COREPACK_ENABLE_NETWORK=0` et
`npm_config_offline=true`. Sa sortie était capturée par le test puis perdue :
aucun compteur de téléchargements ou journal de scripts de cette opération
implicite n'est disponible. Le premier résultat « 72 verts » a donc été
**écarté comme preuve sous lockfile**, et le contrôle global lancé sur ce
graphe contaminé a de nouveau échoué.

Le test lance désormais `pnpm --dir <fixture> run build` **depuis le dépôt**.
Corepack sélectionne le gestionnaire du dépôt avant que pnpm change de
répertoire. Le build réel `tsc -b && vite build` est conservé. Une assertion
compare les chemins réels et contenus des manifests TypeScript, types Node
et Vite avant/après le build. Après seconde restauration, les 72 tests passent
avec cette assertion ; le contrôle externe des 324 dépendances reste conforme.
Les trois manifests critiques et le chemin Vite du plugin sont identiques
à ceux de la première restauration. Aucun réglage pré-script n'a été désactivé.

## Commandes finales et revue

```sh
export PATH=/workspace/.onboarding/bin:$PATH
COREPACK_ENABLE_NETWORK=0 npm_config_offline=true \
  NODE_OPTIONS=--max-old-space-size=3072 npm_config_workspace_concurrency=1 \
  pnpm typecheck

COREPACK_ENABLE_NETWORK=0 npm_config_offline=true \
  NODE_OPTIONS=--max-old-space-size=2048 pnpm exec vitest run \
  app/lib/runtime/vite-hmr-commonjs.spec.ts \
  app/lib/runtime/vite-hmr-config.compilation.spec.ts \
  app/lib/runtime/vite-hmr-config.spec.ts \
  app/lib/runtime/vite-api-serve.spec.ts \
  app/lib/runtime/preview-manifest.spec.ts scripts/index-a-jour.spec.mjs \
  --maxWorkers=1 --minWorkers=1
```

Compilateurs séquentiels ; heap principal plafonné à 3 Gio pour le typecheck,
2 Gio pour les tests, 1 Gio pour leurs compilations enfants. Mémoire cgroup
observée jusqu'à environ 5,4 Gio sur 16 Gio, cache de fichiers inclus.
ESLint ciblé, Prettier sur les deux fichiers modifiés et `git diff --check`
passent. La revue indépendante `review_a37` approuve les deux corrections
et confirme la réserve sur les versions de source pnpm.

Une recherche accessoire du reviewer sous `/tmp` a reçu
`Permission denied (os error 13)` sur `/tmp/codex-daemon-1000` ; cette
recherche a été arrêtée, sans contournement. Elle ne bloque pas la validation.

## Limites

**A-37 reste ouvert.** Ce lot prouve le typecheck global et les tests locaux
précisés, pas un build global, une génération par modèle, un runtime distant,
une publication réelle, ni les critères live. Les réserves de versions propres
aux gabarits de galerie restent distinctes. Aucun accès GitHub API, push,
publication, appel IA ou intervention GCP n'a été effectué.
