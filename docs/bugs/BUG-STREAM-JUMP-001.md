---
id: BUG-STREAM-JUMP-001
---

## Bug

**P1 — Le fil saute pendant le streaming de l'agent, et le défilement de l'utilisateur est repris de force** (Avi, 08/09 08:2x, point 7 : « le contenu de l'agent n'arrête pas de sauter, c'est impossible de suivre le streaming proprement… je scroll pour aller en bas, ça restaure en haut, ensuite ça saute, je veux redescendre, ça m'a remonté, c'est impossible à gérer »). Deux symptômes probablement d'un même mécanisme (règle 7) : (a) le contenu SE DÉPLACE pendant qu'il s'écrit (remontée du texte déjà lu), (b) le conteneur REPREND la main sur le geste de l'utilisateur. Référence de qualité imposée : Claude / Replit, niveau Fortune 500.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 08/09 **DÉPLOYÉ EN PROD run 1554 (e4b2d7d), 08/09 14:23 UTC** — image web reconstruite, `helm upgrade` fait, étape « Verify running imageIDs match the release manifest » verte (les pods tournent bien cette image). — **CAUSE MESURÉE, et ce n'était pas le défilement.** Sonde MutationObserver à 390 sur le build de production, tour streamé piloté dans la page (`route.fulfill` livrerait le corps d'un coup : ce ne serait pas un flux) : `append` vient de `useChat` et change d'identité à CHAQUE lot de jetons ; la table `components` de react-markdown en dépendait (`useMemo(…, [append, setChatMode, model, provider])`), donc chacune de ses entrées changeait de TYPE à chaque lot et react-markdown démontait puis remontait tout le sous-arbre. Le markdown de TOUS les messages du fil — y compris des tours terminés depuis longtemps — était recréé toutes les 25 à 65 ms : **387 recréations sur 400 mutations relevées**, un bloc de code apparaissant et disparaissant **39 fois**, un à-coup de défilement de **−159 px**, et le dernier texte peint SOUS le bord de lecture sur 8 % des images. Aucun nœud ne survivait assez longtemps pour que le navigateur puisse y ancrer le défilement. Correctif : les rappels passent par une référence, la table est mémorisée sur `[model, provider]`. Même sonde, même build, après : **3 recréations sur 135 mutations**, 3 clignotements, plus aucun à-coup négatif. ⚠️ **Le second symptôme d'Avi (« je scroll pour aller en bas, ça remonte ») n'a PAS été reproduit sur Chromium**, ni avant ni après : le geste au doigt échappe correctement au verrou (0 réassignation de `scrollTop` après le glissement). Lien raisonné, non mesuré : `handleScroll` ignore tout défilement tant que `resizeDifference` est non nul, et le seul renfort qui reste — `handleWheel` — n'existe PAS sur iPhone ; la tempête de remontages entretenait précisément ce `resizeDifference`. À confirmer sur l'iPhone d'Avi.

## ✅ Testé live

☐ live iPhone

## Preuve

contre-épreuve dans les DEUX sens : correctif retiré → E2E rouge à **1486 et 1514 recréations** en 8 s (contre ≤ 20) et test unitaire de non-remontage rouge ; table stable mais rappel figé → le second test unitaire rouge. Épinglé par `app/components/chat/Markdown.stream-stability.spec.tsx` (2 tests) + `tests/e2e/ide-mobile-chrome.spec.ts` « un tour streamé ne recrée pas le markdown des messages déjà affichés »

