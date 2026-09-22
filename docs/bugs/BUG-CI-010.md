---
id: BUG-CI-010
---

## Bug

**P2 — la porte CI « French i18n live audit » n'a JAMAIS été verte, et masque un vrai défaut SEO sur 61 pages.** Sur ses 50 derniers runs : **37 annulés, 12 échecs, 0 succès**, et elle n'a **jamais tourné sur `main`** (uniquement sur des branches de travail), donc elle bloque potentiellement toute PR sans jamais protéger `main`. Le défaut qu'elle révèle est réel : `tests/e2e/i18n-french-live.spec.ts` compte **228 × `one Twitter title`**, **228 × `one Twitter description`** et **72 × `one Open Graph type`** manquants, sur **61 pages distinctes** (`/`, `/about`, `/blog`, `/ai-agent`, `/compare/heroku`, `/case-studies`, `/contact`, `/account-settings/connected`…), en EN et FR, thèmes clair et sombre. S'y ajoutent 25 `browser console errors` dus à des **404 sur `fonts.gstatic.com`** (flakiness réseau du runner) et un échec en cascade de « Verify complete proof set » (846 JSON pour 282 attendus, 1692 captures pour 564) causé par les 3 retries.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté 17/08**

## Preuve

Signature d'échec **identique** (mêmes lignes 556/566/567/589/653/731/738, mêmes compteurs) sur trois branches sans rapport : `fix/marketing-en-solutions` (2 runs) et `qa/sweep-2026-08-15`. Donc **pré-existant et indépendant de toute branche**. Relevé en voulant merger la PR #140 : 18 checks verts, ces 4 rouges. Deux chantiers distincts à ouvrir : (a) ajouter `twitter:title`/`twitter:description`/`og:type` sur les 61 pages ; (b) décider du sort de cette porte (la rendre verte, ou la retirer des checks de PR tant qu'elle ne tourne pas sur `main`). **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `tests/e2e/i18n-french-live.spec.ts`, `tests/guards/i18n-bascule-repliee.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

