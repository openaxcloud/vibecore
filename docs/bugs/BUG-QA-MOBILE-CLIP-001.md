---
id: BUG-QA-MOBILE-CLIP-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P1 — sur iPhone (390 px), `/organization-roles` ampute 266 px de la matrice de permissions et l'utilisateur ne peut PAS y accéder.** La carte « Permission matrix » mesure **656 px** dans un viewport de **390 px**. Les colonnes `Member`, `Editor`, `Viewer` sont hors écran, la phrase d'explication est coupée en plein mot (« …determines which per▌ »), et le bord droit de la carte est invisible. **Aucun défilement horizontal n'est possible** : `html` et `body` portent `overflow-x: clip` (`app/styles/index.scss:77`), qui contient le débordement **sans créer de conteneur de défilement** — `window.scrollTo(9999,0)` laisse `scrollX = 0`. Le contenu n'est donc pas « à faire défiler », il est **perdu**. **Cause racine mesurée** : `<div className="grid gap-6">` (`app/routes/organization-roles.tsx:204`) n'a pas de piste explicite ; la colonne implicite est dimensionnée `auto`, donc par le **min-content** de ses enfants. Mesuré en direct : conteneur `width = 362 px` mais `grid-template-columns` calculé à **642 px**. L'enfant qui gonfle la piste est le wrapper `overflow-x-auto` du tableau (640 px) — qui, gonflé à sa taille de contenu, **ne défile plus non plus** (`scrollWidth == clientWidth`). Sévérité utilisateur : la surface de gestion des rôles est illisible sur iPhone.

## 📤

☐

## 💻

☐

## ✅

✅ **01/09** mesuré live + capture

## Preuve

Env d'audit `vibecore-audit-test-20260807`, `web`/`api` sur `040dd2976d`, 01/09. `https://app.34.163.208.161.sslip.io/organization-roles`, viewport 390×844, `deviceScaleFactor 3`, thème clair. **Mesure** : `body.scrollWidth = 656`, `documentElement.clientWidth = 390` → **+266 px amputés** ; `maxScrollX = 0`, `canScrollH = false` ; `getComputedStyle(html).overflowX = "clip"`, idem `body`. **Capture** : `proof-_organization_roles-390.png` (colonnes Member/Editor/Viewer absentes, texte tronqué). **Correctif prouvé en direct** : injection de `:where(.grid) > * { min-width: 0 }` → amputation **266 → 0 px** ; variante `grid-template-columns: minmax(0,1fr)` → **266 → 0 px** également. Capture après correctif : `apres-fix_organization_roles-390.png` (carte entière visible, phrase complète, tableau redevenu défilable). **Présent sur `origin/main`** : `git show origin/main:app/routes/organization-roles.tsx` ligne 204 → `<div className="grid gap-6">` à l'identique — ce n'est donc pas un artefact du build plus ancien de l'env d'audit. **768 px : sain** (`body.scrollWidth = 768`).

