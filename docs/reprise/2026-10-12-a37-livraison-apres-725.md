# A-37 — intégration locale après le contraste #725

## Branche et parents

Branche de livraison : `delivery/a37-after-725-20261012`, dans
`/workspace/vibecore-offline-20261012`. Les cinq commits locaux sont conservés
avec leurs SHA, sans rebase ni cherry-pick :

1. `643b320e7b7ff668b40c42cbd784d70909dcc785` — wrapper HMR ESM.
2. `5aceeb05e066372f09e5b7e123d2309728c4df5a` — CommonJS et galerie.
3. `7de14a8f29fdb0b18c4d034447f347ca3a801ddd` — diagnostic de dérive.
4. `fa8ef74572886eebeceb0dd5422cbd9adf877f8b` — outillage et restauration isolée.
5. `58861323a5aa917947ea3275c569f45347658a93` — prérequis de galerie.

Le Git normal a récupéré `origin/main` à
`a1a8d5de554a2c996ffeef04dfb4712649203632` (#725), dont le premier parent est
`e1ba08b68c2e9ba82a838ca9c5dc8f0206fcac43`, base commune avec A-37.
La politique active de session permet le réseau ; le mandat le restreint ici
au transport Git vers `github.com`. Seule opération distante effectuée :

```sh
git -c rerere.enabled=false -c credential.interactive=false fetch --no-tags origin main
```

Le fetch a réussi. Aucun appel à `api.github.com`, aucune route alternative,
aucun push, PR, dispatch de workflow ou accès au cloud. L'état du déploiement
en cours n'a pas été interrogé ni présenté comme terminé.

## Essai d'intégration réel

Depuis `58861323a`, nouvelle branche puis :

```sh
git -c rerere.enabled=false -c rerere.autoupdate=false merge \
  --no-commit --no-ff a1a8d5de554a2c996ffeef04dfb4712649203632
```

Fusion automatique sans conflit ; `git ls-files -u` vide. Aucune résolution
forcée, aucune utilisation de rerere, aucune stratégie ours/theirs.
Le test de l'index a toutefois trouvé **418 annoncées contre 419 fiches** :
les deux branches avaient chacune ajouté une entrée et augmenté le même
compteur. [Preuve rouge](mesures/2026-10-12-a37-integration-index-red.txt).
L'outil canonique `node scripts/migrer-inventaire-bugs.mjs --index` a régénéré
le compteur à 419, seule ligne corrigée après la fusion automatique.
Aucune fiche source n'a été modifiée ; les six tests de l'index passent ensuite.

## Inspection des ajouts et suppressions

[Relevé fichier par fichier](mesures/2026-10-12-a37-integration-files.json) :
30 fichiers du lot avant ajout des présentes preuves de livraison, nombres
de lignes ajoutées/supprimées et comparaison des blobs. Les 29 fichiers autres
que l'index sont identiques à `58861323a`. Aucun fichier supprimé ou renommé.
L'index conserve les deux fiches et son compteur régénéré.

Diff de production **par rapport au main récupéré** :

| Fichier | Ajouts / suppressions | Comportement |
| --- | --- | --- |
| `app/lib/runtime/preview-manifest.ts` | +5 / −3 | Découverte cjs/cts, chemin transmis au réparateur HMR, maintien du wrapper API existant |
| `app/lib/runtime/vite-api-serve.ts` | +26 / −3 | Attente des configurations asynchrones et migration des footers historiques |
| `app/lib/runtime/vite-hmr-config.ts` | +91 / −16 | Typage contextuel, fusion asynchrone, prise en charge CommonJS et migrations idempotentes |

Les suppressions remplacent les wrappers antérieurs ; elles ne retirent ni
la compilation TypeScript ni les configurations utilisateur. Les autres
changements A-37 sont les tests, deux scripts d'audit et la documentation.

`EcodeProductMarketingPages.tsx`, `mobile-code-contrast.spec.tsx` et la fiche
`BUG-MOBILE-CODE-CONTRAST-001.md` sont **identiques octet pour octet à main**.
Le contraste #725 est donc préservé. Aucun diff supplémentaire d'hydratation,
workflow, manifeste, lockfile ou réglage de sécurité.
**Aucune dépendance nouvelle.**

## Validation sur le graphe conforme

Avant et après les contrôles : **324 dépendances directes, zéro écart**, et
inventaires identiques, y compris les chemins réels des dépendances critiques.
TypeScript 5.8.3, types Node 25.6.0, Vite 5.4.21, Vitest 3.2.6, tsx 4.21.0.
Vite et son plugin React utilisent la même instance physique.
[Avant](mesures/2026-10-12-a37-integration-deps-before.json),
[après](mesures/2026-10-12-a37-integration-deps-after.json).

Exécutables employés explicitement : Node
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` et pnpm
`/workspace/.onboarding/corepack/v1/pnpm/9.14.4/bin/pnpm.cjs`.
Un lanceur temporaire `/tmp/a37-delivery-bin/pnpm` appelle directement ces deux
chemins ; il est placé en tête du PATH pour les sous-processus des contrôles.
Il ne passe pas par la sélection de version de Corepack. `pnpm --version`
confirme 9.14.4. Aucun installateur n'est exécuté.

Le typecheck utilise `node <pnpm9>/bin/pnpm.cjs typecheck`, avec
`npm_config_workspace_concurrency=1`, `npm_config_offline=true`,
`COREPACK_ENABLE_NETWORK=0`, heap 3 Gio. Les tests utilisent directement
`node /workspace/vibecore-offline-20261012/node_modules/vitest/vitest.mjs run`
avec heap 2 Gio, un worker, et les mêmes six suites :

```text
app/lib/runtime/vite-hmr-commonjs.spec.ts
app/lib/runtime/vite-hmr-config.compilation.spec.ts
app/lib/runtime/vite-hmr-config.spec.ts
app/lib/runtime/vite-api-serve.spec.ts
app/lib/runtime/preview-manifest.spec.ts
scripts/index-a-jour.spec.mjs
```

- **Typecheck global : code 0**, phases web, scripts, Electron main/preload
  et packages du workspace réussies.
  [Journal](mesures/2026-10-12-a37-integration-typecheck.txt).
- **72/72 tests, six suites : code 0**, 24,41 s. Le build réel de la fixture,
  le rejet de l'export manquant et la stabilité des dépendances restent testés.
  [Journal](mesures/2026-10-12-a37-integration-tests.txt).
- ESLint ciblé sur les trois fichiers runtime et les quatre specs A-37 :
  code 0, aucune sortie ; `git diff --check` passe.

Les validations sont séquentielles, dans le worktree intégré. Pas de nouveaux
tests navigateur du contraste ni de build global revendiqués. Les derniers
ajouts après validation ne concernent que ce rapport et ses preuves.

## Effet d'une future publication Git

Lecture locale de tous les workflows, sans les déclencher :
[déclencheurs archivés](mesures/2026-10-12-a37-integration-workflows.json).

- Un **push seul** de `delivery/a37-after-725-20261012`, sans PR ouverte ni
  tag, ne correspond à aucun déclencheur `push` configuré dans ces workflows.
- Une **PR vers main** déclencherait Production CI, Production E2E, Security
  Analysis, Code Quality, French i18n live audit, PR Validation, Semantic PR
  (`pull_request_target`) et Desktop Electron (`app/**`). Les jobs peuvent
  ensuite appliquer leurs propres conditions. Un push ultérieur sur une
  branche ayant cette PR ouverte déclencherait aussi `synchronize`.
- Une **fusion sur main** correspondrait notamment aux contrôles, à Docs,
  Parity, Update Stable et au déploiement de production soumis à ses portes :
  les trois sources runtime ne sont pas dans les chemins ignorés.

Ces constats portent sur le code des workflows récupérés ; ils ne certifient
pas l'absence d'automatisations externes au dépôt. Rien n'a été poussé.

## Revue et limites conservées

Revue indépendante par `review_a37` : diff runtime relu fichier par fichier,
contraste main préservé, aucune suppression imprévue, déclencheurs CI vérifiés.
La seule correction propre à l'intégration est le compteur de l'index dérivé.

**A-37 reste ouvert.** Les six gabarits de galerie restent non certifiés faute
de dépendances exactes, comme détaillé dans le
[rapport des prérequis](2026-10-12-a37-galerie-prerequis.md). Aucune génération
par modèle, publication d'application ou validation live. Aucun accès GCP,
secret, dépense ou téléchargement de paquet. Le lot est préparé localement
pour une publication ultérieure ; celle-ci n'est ni exécutée ni autorisée par
ce rapport.
