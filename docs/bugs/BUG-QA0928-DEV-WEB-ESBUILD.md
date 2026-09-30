---
id: BUG-QA0928-DEV-WEB-ESBUILD
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**GÊNANT (équipe, pas utilisateur) — `pnpm run dev:web` plante sur toute installation neuve depuis la montée d'esbuild à 0.27.7 (#569, 18/09).**

`package.json` force `vite>esbuild` à `0.27.7`. L'optimiseur de dépendances de Vite 5.4 garde sa
cible par défaut (`chrome87`, `edge88`, `es2020`, `firefox78`, `safari14`), et esbuild 0.27 refuse
d'y abaisser la déstructuration :

```
✘ [ERROR] Transforming destructuring to the configured target environment ("chrome87", "edge88",
  "es2020", "firefox78", "safari14" + 2 overrides) is not supported yet
    node_modules/.pnpm/vite-plugin-node-polyfills@0.22.0…/shims/buffer/dist/index.cjs:269:7
…
 ELIFECYCLE  Command failed with exit code 1.
```

Le build de production passe (`build.target: 'esnext'`), la CI aussi : elle lance Playwright avec
`PLAYWRIGHT_SKIP_WEB_SERVER` contre l'image Docker. Personne ne voit donc la panne — sauf qui lance
`pnpm dev` ou `npx playwright test` en local (`playwright.config.ts:7` démarre `pnpm run dev`). Un
ancien cache `node_modules/.vite` peut la masquer.

## Repro

```sh
git checkout --detach 5cd5e6db7 && pnpm install --frozen-lockfile
rm -rf node_modules/.vite
pnpm run dev:web --port 5183 --host 127.0.0.1     # meurt au pré-bundling, rien n'écoute
```

Mesuré le 2026-09-28, macOS, Node 24.10.0, worktree propre.

## Correctif suggéré

`optimizeDeps.esbuildOptions.target: 'esnext'` dans `vite.config.ts` (aligné sur `build.target`).
Non essayé ici — la contre-épreuve reste à faire.

## 📤

☑ 30/09 #610

## 💻

☑ 30/09 fusionnée `d9335f199`

## ✅

☐ pas encore servi en prod au 30/09 13:45

## Preuve

Journal de démarrage ci-dessus. Aucun test — point OUVERT.

**30/09 — PROUVÉ.** `vite optimize` : 4 864 erreurs → 0 ; build electron main : 11 erreurs → vert ; contre-épreuves rouges. En CI, le build desktop est vert sur #610 et rouge sur toutes les PR qui n'ont pas le correctif, avec exactement cette erreur (`Transforming destructuring … safari14`). Épinglé par `tests/guards/pre-bundling-cible.spec.ts`. Sans effet sur l'image servie (dev et desktop seulement).
