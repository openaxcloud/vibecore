---
id: BUG-QA-PROVIDERS-SSR-ENV-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**L'UI Connexions annonce « aucun fournisseur configuré » alors que la clé est posée et que le fournisseur répond.** `vite-plugin-node-polyfills` shimme `process` dans le bundle SSR : `process.env` y est un objet **vide**, donc toute lecture `process.env[NOM]` y renvoie `undefined` quel que soit l'environnement réel du pod.

## 📤

✅

## 💻

✅ **`6a12e803` sur `main`**

## ✅

✅ **12/08** défaut prouvé live

## Preuve

**Preuve du défaut, bout en bout, dans l'env de test** : (1) la clé est bien dans le secret — `ANTHROPIC_API_KEY` **présente, 108 caractères, préfixe `sk-ant-`** ; (2) le **pod web la voit côté Node** — `process.env.ANTHROPIC_API_KEY` **présente, 108 caractères** ; (3) et pourtant `GET /api/configured-providers` (session réelle) renvoie **HTTP 200, 22 fournisseurs, 0 configuré**, Anthropic à `isConfigured:false / configMethod:"none"`. Correctif : passer par `readRuntimeEnv` (`globalThis.process.env`), le contournement déjà utilisé par require-session / ai-usage / preview-tenant. **Deux routes** alimentent la même surface et portaient le même piège : `api.configured-providers.ts` (baseUrlKey **et** apiTokenKey) **et** `api.check-env-key.ts`. Tests `provider-env-ssr.spec.ts` **6/6**, rouge→vert vérifié (**4/6 échouent** sans les correctifs).

