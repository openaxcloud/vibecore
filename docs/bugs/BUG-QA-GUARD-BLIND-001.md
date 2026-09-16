---
id: BUG-QA-GUARD-BLIND-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P1 (dette de vérification) — TOUS les garde-fous de débordement horizontal du e2e sont structurellement incapables d'échouer sur ce produit.** Les 8 specs qui vérifient l'absence de débordement mesurent `document.documentElement.scrollWidth <= window.innerWidth + 1` : `ecode-marketing-content.spec.ts:51`, `public-homepage.spec.ts:73/101/192`, `mobile-device-matrix.spec.ts:388/908`, `dashboard.spec.ts:312/519`, `responsive-ide.spec.ts:87/250/315/385`, `rpl-ide-live-proof.spec.ts:100`, `auth-theme.spec.ts:76`, `i18n-french-live.spec.ts:538`. Or `app/styles/index.scss:64` et `:77` posent `overflow-x: clip` sur `html` **et** `body`, pour la coque marketing **et** pour tout l'espace utilisateur (`.vc-app-shell-grid`). `overflow-x: clip` **borne `documentElement.scrollWidth` à `clientWidth` par construction** : la métrique ne peut plus bouger, quoi que fasse la mise en page. Ces gardes ne mesurent donc plus rien — ils se lisent pourtant comme une couverture. C'est exactement ce qui a laissé passer CLIP-001/002/003. ⚠️ **Le commentaire de `index.scss:68-73` décrit d'ailleurs mot pour mot le défaut** (« at 390px a grid item's min-content width … could push the page wider than the viewport ») : `overflow-x: clip` y a été introduit comme **contention du symptôme**, et a de surcroît aveuglé la mesure.

## 📤

☐

## 💻

☐

## ✅

✅ **01/09** contre-épreuve live, 3 routes

## Preuve

**Contre-épreuve décisive** (env d'audit, 01/09, 390×844) : injection dans la page d'un `<div style="width:3000px">` sur `/dashboard`, `/community` et `/organization-roles`. Résultat identique sur les **3 routes** : `documentElement.scrollWidth` reste à **390** et le verdict du garde reste **« PASSE ✅ »**, tandis que `body.scrollWidth` lit correctement **3000**. Un débordement de 3 000 px est donc invisible au garde. **Second contrôle** : avant injection, `/organization-roles` donne `documentElement.scrollWidth = 390` (garde **PASSE**) alors que `body.scrollWidth = 656` (**266 px réellement amputés**) — le garde est vert sur une page cassée. **Métrique honnête** : `document.body.scrollWidth`. **Portée** : ~20 sites d'appel dans 8 fichiers ; la migration complète est laissée à une décision explicite (elle peut révéler d'autres pages amputées et rougir la CI), mais le nouveau spec `tests/e2e/mobile-content-clipping.spec.ts` la matérialise sur les 3 routes corrigées **et embarque la contre-épreuve** qui manque aux gardes existants.

