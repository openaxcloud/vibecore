---
id: BUG-PREVIEW-BLANK-001
---

## Bug

**Récidive « Webview blanc » (launch-blocker)** — un projet Vite au runtime sain (running, port 5173 `ready:true`, process actif, `postMortemCount 0`) rend un **écran 100 % blanc, silencieux, sans état d'erreur** : l'app servie DANS l'iframe lève une erreur non-catchée au module-eval (cas rapporté : `Uncaught TypeError: Cannot redefine property: process`, injectée de l'extérieur — instrumentation navigateur Codex ou dépendance user, **jamais par E-Code**), React ne monte jamais, `#root` reste vide. Le reporter injecté postait bien `PREVIEW_ERROR`/`PREVIEW_BLANK` au parent mais **ne rendait RIEN de visible dans l'iframe**, et son watchdog blank n'agit qu'à ~18 s. Résultat vécu : blanc invisible pendant 120 s. **Cause racine « process » INFIRMÉE côté E-Code** : audit code complet + repro réelle prouvent que E-Code n'injecte aucun shim `process` dans les projets servis ; son seul `process` navigateur (vite-plugin-node-polyfills, bundle IDE) utilise `globalThis.process = globalThis.process \

## 📤 Dispatché

\

## 💻 Codé

shim` (assignation gardée, ne peut PAS jeter « Cannot redefine »). Le vrai défaut E-Code = **le blanc invisible**, pas le `process`.

## ✅ Testé live

✅ 05/08

## Preuve

☐ (branche `fix/preview-blank-loaderror-overlay`, PR, **PAS sur main** — touche preview-proxy prod, déploiement à coordonner avec Avi)

