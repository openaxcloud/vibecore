---
id: BUG-PERF-PRELOAD-ALLROUTES
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**2ᵉ cause de la lenteur, distincte et plus grosse : la home marketing précharge des chunks de routes NON appariées.** Après correction du barrel, il reste **103 `<link rel="modulepreload">`** sur `/`, dont `ide-new-route`, `admin-oauth-providers`, `client-runtime-residual`, `runtime`, et surtout **`vendor-monaco-core` (573 Ko)** + **`vendor-terminal` (81 Ko)**. Vérifié que ce n'est PAS un import statique : un traceur de graphe (statique, incluant les paquets `@vibecore/*`) sur `app/root.tsx` atteint 209 modules et **zéro** import lourd ; idem depuis la route `_index` (33 modules) et depuis `utils/debugLogger` (198 modules). Dans les chunks déployés, `vendor-monaco-core` n'apparaît que dans la table `__vite__mapDeps` de `root-*.js`, `logger-*.js` et `_index-*.js` — c'est-à-dire la carte de dépendances d'un **import dynamique**, que la liste de préchargement embarque quand même.

## 📤 Dispatché

✅ 12/08

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

Cause à confirmer côté manifeste React Router / `vite.config.ts`. Gain attendu ≈ **654 Ko** de plus par page. Lot **SÛR** (perf).

