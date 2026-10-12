# Typecheck global — dérive des dépendances restaurées

## Verdict et périmètre

Lot local séparé sur `audit/typecheck-dependencies-20261012`, au-dessus de
`5aceeb05e066372f09e5b7e123d2309728c4df5a`. Les deux correctifs A-37
(`643b320e7` et `5aceeb05e`) sont conservés. Aucun code applicatif, type,
garde-fou, lockfile ou lien de dépendance n'est modifié.

**Les six diagnostics précédents ne prouvent pas un défaut du code de main
avec ses dépendances verrouillées.** Quatre disparaissent avec le compilateur
verrouillé déjà présent ; les deux autres exposent un conflit entre deux
graphes Vite. Le typecheck global reste bloqué et A-37 reste ouvert.

## Versions réellement résolues

| Dépendance | `pnpm-lock.yaml`, importeur racine | Lien racine effectif |
| --- | --- | --- |
| TypeScript | 5.8.3 | 5.9.3 |
| `@types/node` | 25.6.0 | 25.9.9 |
| Vite | 5.4.21, contexte Node 25.6.0 / lightningcss 1.32.0 / Sass 1.99.0 | 5.4.21, contexte Node 25.9.9 |

Le lock interne `node_modules/.pnpm/lock.yaml` indique lui aussi les versions
verrouillées. Il ne certifie donc pas les liens effectifs. Le plugin React
résout Vite dans l'ancien contexte ; le code racine résout le nouveau.
Les fichiers `package.json`, `dist/node/index.d.ts` et `dist/node/index.js`
des deux Vite ont des SHA-256 identiques, mais leurs dépendances divergent :
Rollup 4.60.3 contre 4.64.5, PostCSS 8.5.14 contre 8.5.29 et esbuild 0.27.7
(override du dépôt) contre 0.21.5. L'identité de version Vite ne suffit pas.

L'origine de la dérive n'est pas établie. Le wrapper pnpm observé délègue
simplement à Corepack. Aucun installateur n'a été appelé pendant ce diagnostic.
Le préflight `scripts/verifier-installation.mjs` ne vérifie que la présence
des manifests, ignore `@types/node` et ne compare pas les versions ou peers.
Son succès ne permet pas de conclure à une restauration conforme.

## Contre-épreuves exécutées

1. Typecheck web réel, sources inchangées, seul binaire remplacé par celui
   du lock déjà présent : **code de sortie 2, deux diagnostics TS2769**.
   Les quatre diagnostics buffers disparaissent. Journal complet :
   [TypeScript 5.8.3](mesures/2026-10-12-typecheck-ts583.txt).

   ```sh
   NODE_OPTIONS=--max-old-space-size=3072 node \
     node_modules/.pnpm/typescript@5.8.3/node_modules/typescript/bin/tsc \
     --project tsconfig.web.json --noEmit --pretty false
   ```

   Dans `lib.dom.d.ts`, `BufferSource` passe de `ArrayBufferView | ArrayBuffer`
   en 5.8.3 à `ArrayBufferView<ArrayBuffer> | ArrayBuffer` en 5.9.3.
   Cela explique les incompatibilités des `Uint8Array<ArrayBufferLike>` à
   `workbench.ts:4398`, `api.projects.$id.files.$.tsx:97`,
   `api.projects.$projectId.project-action.ts:55` et
   `packages/runtime-remote/src/index.ts:1165`.
   Aucun défaut de conversion binaire à l'exécution n'est établi par ces
   diagnostics ; aucun cast ou changement de conversion n'est introduit.

2. Fixture virtuelle compilée par TypeScript 5.8.3 :
   `defineConfig({ plugins: [react()] })`. Avec les imports racine effectifs :
   **TS2769**. En changeant uniquement l'import `defineConfig` de cette fixture
   vers l'instance Vite déjà utilisée par le plugin : **zéro diagnostic**.
   Aucune source ou résolution du projet n'est modifiée.
   [Résultats complets et chemins physiques](mesures/2026-10-12-typecheck-dependency-probe.json).

   ```sh
   export PATH=/workspace/.onboarding/bin:$PATH
   NODE_OPTIONS=--max-old-space-size=2048 pnpm exec tsx \
     scripts/audit/typecheck-dependency-probe.ts
   ```

   Ce script émet des observations, pas un statut de validation globale.
   Son code de sortie zéro signifie que le diagnostic s'est exécuté.
   Il ne restaure pas les dépendances et ne remplace pas un typecheck réel.

Le contrôle TypeScript strict ciblé du script et son contrôle Prettier passent.
Commandes :

```sh
node node_modules/.pnpm/typescript@5.8.3/node_modules/typescript/bin/tsc \
  --noEmit --strict --skipLibCheck --target ES2022 \
  --module NodeNext --moduleResolution NodeNext --types node \
  scripts/audit/typecheck-dependency-probe.ts
pnpm exec prettier --check scripts/audit/typecheck-dependency-probe.ts
git diff --check
```

Les compilations ont été séquentielles, limitées à 3 Gio pour le projet et
2 Gio pour la fixture, sous une limite cgroup de 16 Gio ; mémoire au repos
environ 307 Mio. Aucun parallélisme de compilateurs lourds.

Revue indépendante favorable par `review_a37` : relance de la fixture
confirmant TS2769 puis zéro diagnostic, vérification des trois hashes Vite
et des versions Rollup/PostCSS/esbuild, aucune réserve bloquante. La revue
confirme aussi que le script ne modifie ni sources, ni dépendances, ni liens.

## Blocage restant et validation requise

Une restauration cohérente et vérifiée contre le lockfile est nécessaire avant
de relancer `pnpm typecheck` complet. Elle n'est pas effectuée : installation et
téléchargements sont exclus du mandat. Le test avec le binaire 5.8.3 conserve
le graphe mixte ; il n'est **pas** une certification main/lockfile.
Les phases scripts, Electron et packages du contrôle global, ainsi que build
global et parcours live, ne sont pas validées par cette contre-épreuve web.

Aucune installation, modification réseau, GitHub API, IA, dépense, publication,
runtime distant, modification GCP ou push. Les preuves antérieures de galerie
gardent leurs réserves sur les versions restaurées. Aucun point canonique n'est
passé en « testé live » ni en « résolu ».
