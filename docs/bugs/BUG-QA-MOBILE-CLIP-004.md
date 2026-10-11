---
id: BUG-QA-MOBILE-CLIP-004
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P1 — en FRANÇAIS, à 1024 px, `/projects/:id/collaborators` ampute son contenu : `body.scrollWidth` 1034 pour 1024 (clair et sombre), sans défilement possible.** Révélé le 16/09 par la première exécution HONNÊTE des gardes de débordement (BUG-QA-GUARD-BLIND-001 : la métrique aveugle `documentElement.scrollWidth` ne pouvait pas le voir) : audit i18n, shard `desktop-1024`, rouge 3 tentatives sur 3. Reproduit en local, en français, à 1024 : **1068 pour 1024**. **Cause racine mesurée** : un `<select>` a pour largeur minimale son option la plus longue (« Éditeur — modification… », **401 px**) et un élément de grille ne descend jamais sous son min-content ; la colonne droite de 380 px (`lg:grid-cols-[1fr_380px]`) débordait donc à **445 px** (formulaire « Ajouter un membre par e-mail »). En anglais, les options plus courtes tiennent dans les 332 px utiles : le défaut n'existait qu'en français — la langue d'Avi.

## 📤

☑ 16/09 — instruit par cette session.

## 💻

☑ 16/09 — les contrôles des deux formulaires prennent la largeur de la colonne au lieu de la dicter (`w-full min-w-0` sur les `<select>` et l'`<input>`), les pistes sont clampées (`grid-cols-[minmax(0,1fr)]`, `lg:grid-cols-[minmax(0,1fr)_380px]`, `min-w-0` sur les colonnes) — même remède que CLIP-001/002/003 (#336). La page `env`, qui porte la même grille `lg:grid-cols-[1fr_380px]`, est clampée aussi (règle 23 : elle tenait en français aujourd'hui, elle n'attend qu'un libellé plus long). **Épinglé par `tests/e2e/collaborateurs-1024-fr.spec.ts`** (français forcé par le cookie `vibecore-lang` et `?lang=fr`, témoin `documentElement.lang === 'fr'`, mesure `body.scrollWidth` à 1024 sur `collaborators` et `env`) — en plus du shard `desktop-1024` de l'audit i18n qui l'a révélé.

## ✅

☐ — à constater en prod, en français, sur un écran de 1024 px (iPad paysage, petit portable) : `/projects/<id>/collaborators` ne défile pas horizontalement, le formulaire d'invitation tient dans sa colonne.

## Preuve

Run `35099141717`, job `104804142110` (PR #559, tête `65a4e891`) : `Error: /projects/…/collaborators (dark) horizontal overflow — Expected <= 1026, Received 1034`, idem `(light)`, sur trois tentatives. Sonde locale 16/09 (Chromium 1024×768, cookie `vibecore-lang=fr`, `?lang=fr`) : `bodyScrollW 1068`, formulaire 445 px, enfants (h2, labels, bouton) 401 px, `<input>` 401 px de `scrollWidth`. En anglais, même page : 1024/1024. **Après correctif (build local 13:28, même sonde, français, 1024)** : `collaborators` **1024/1024**, `env` **1024/1024** ; `tests/e2e/collaborateurs-1024-fr.spec.ts` **2 verts** (3,7 s). Contre-épreuve du garde : même métrique et même état que la sonde avant correctif (1068 pour 1024) et que l'assertion de l'audit i18n qui a rougi 3/3 sur `65a4e891` — le test mesure ce qui rougissait.
