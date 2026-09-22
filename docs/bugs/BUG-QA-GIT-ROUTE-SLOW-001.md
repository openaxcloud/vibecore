---
id: BUG-QA-GIT-ROUTE-SLOW-001
---

## Bug

**`/git` reste visuellement vide 7 à 18 s, puis affiche le chat générique au lieu d'une UI d'import Git.** La route `app/routes/git.tsx` est un `ClientOnly` : le SSR ne renvoie que la coquille « Chargement d'E-Code » (14 caractères de texte visible). Le contenu n'apparaît qu'après hydratation complète — mesuré **8,3 s / 18,0 s / 7,3 s** sur trois chargements anonymes en prod, contre **3,3–5,1 s** pour `/` et **4,0 s** pour `/login` : `/git` est 2 à 4× plus lent que les autres routes de la même app. Pendant tout ce temps l'écran est blanc, sans squelette ni indicateur de progression. Ce qui finit par s'afficher est le **fallback `BaseChat`** (accueil « Transformez vos idées en logiciels fonctionnels »), **sans aucun champ d'URL de dépôt** : `GitUrlImport` ne monte jamais son formulaire, car sans `?url=` son `useEffect` sort immédiatement (et, si `historyReady && gitReady`, fait un `window.location.href = '/'` — redirection **client** au lieu d'une redirection serveur, donc un second chargement complet de l'app). La frame principale navigue **3 fois** sur `/git` avant de se stabiliser. ⚠️ Ne pas confondre avec une page morte : une mesure prise à 2,5 s conclut à tort « page vide ».

## 📤

☐

## 💻

☐

## ✅

✅ **26/08** reproduit live prod

## Preuve

**Repro** (anonyme, prod) : `node /tmp/qa-sweep/git-timing.mjs` — Playwright ouvre `https://app.e-code.ai/git` en `waitUntil:'commit'` puis sonde `document.body.innerText.length` toutes les 250 ms. Résultats : `/git` firstContent **8303 ms** puis **17971 ms** ; `/` **3309/5082 ms** ; `/login` **4006/4110 ms**. Contrôle SSR : `curl -s https://app.e-code.ai/git` → 200, 26 516 octets, mais **14 caractères** de texte visible (« Loading E-Code »). Contrôle UI : après rendu, `input[placeholder*=repo\

