---
id: BUG-PERF-LOAD
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug (mots d'Avi)

« **Le site prend un temps fou à charger.** » Chargement initial marketing + app anormalement long.

## 📤 Dispatché

✅ 12/08

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve / état

**MESURÉ EN PROD 12/08** (public, sans login), navigateur réel sur `https://e-code.ai/` : TTFB **92 ms** (serveur sain), DOMContentLoaded **1 220 ms**, **`load` = 6 062 ms**, **118 requêtes**, **2 113 Ko transférés**, **8 101 Ko décodés**. Le HTML (31 Ko) émet **104 `<link rel="modulepreload">`**, soit 1 877 Ko à lui seul, sur une page **marketing**. Top chunks : `vendor-monaco-core` **573 Ko**, `vendor-codemirror` **257 Ko**, `runtime` **223 Ko**, `vendor-react` **221 Ko**, `vendor-terminal` **82 Ko** → **~912 Ko (43 %) de code exclusivement IDE** téléchargés par un visiteur qui lit la page d'accueil. Le préchargement couvre même des routes admin (`admin-billing`, `admin-stripe`, `admin-wallets`, `audit-logs`, `database-restore`, `enterprise-sso-settings`). Cause racine côté graphe de modules : `app/root.tsx:30` importe **statiquement** le barrel `@vibecore/editor` (`installEditorPwaServiceWorker`) ; ce barrel (`packages/editor/src/index.ts:1-20`) importe en **valeur** tout `@codemirror/*` → CodeMirror entre dans le graphe de la route racine, donc de **toutes** les pages. Ordre de préchargement observé : `entry.client` → `vendor-react` → `root` → **`vendor-monaco-core`** (4ᵉ). Serveur hors de cause (TTFB 92 ms, HTML 31 Ko). Lot **SÛR** (perf pure). Correctif en cours. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/lib/perf/root-route-graph.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

