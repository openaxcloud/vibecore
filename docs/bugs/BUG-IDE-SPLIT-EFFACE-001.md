---
id: BUG-IDE-SPLIT-EFFACE-001
---

## Bug

**P2 — un partage de panneau (« Split active right ») DISPARAÎT tout seul ~2,5 s après avoir été fait, quand la machine est chargée.** Mesuré au chronomètre dans la page : 1 feuille à 27 493 ms, **2 feuilles à 29 959 ms** (le partage a bien eu lieu), **1 feuille à 32 481 ms** — et AUCUN appel réseau entre les deux, donc une remise à zéro purement côté client. C'est ce qui fait échouer `rpl-ide-live-proof.spec.ts:219` (le partage vertical vise un panneau qui vient d'être remplacé : « element was detached from the DOM, retrying »), l'un des trois tests qui bloquent la barrière de livraison.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☐ — **cause racine NON établie, et je ne livre pas un correctif sur une route déduite (règle 1)**

## ✅ Testé live

☐

## Preuve

**DEUX HYPOTHÈSES ÉCARTÉES PAR LA MESURE, pas par la lecture.** (1) « Le re-merge après conflit 412 de `projectIdeMemory` renvoie l'état serveur dans CE tabulateur, et l'écouteur de BaseChat l'applique sans garde » — séduisant, et faux : la trace ne montre **aucun PUT**, donc aucun 412. (2) « La restauration d'état IDE écrase la disposition » — la garde `laDispositionPeutEtreRestauree` existe déjà pour exactement ce défaut (tracé le 02/09) et `paneTreeRef` est réassigné à chaque rendu. **PISTE RESTANTE, non vérifiée** : cette garde lit un `ref` mis à jour AU RENDU ; si la restauration se résout depuis le cache mémoire (aucun réseau — ce que montre la trace) avant que React n'ait rendu le partage, la garde compare encore la disposition PAR DÉFAUT et laisse passer l'écrasement. Cela expliquerait pourquoi le défaut n'apparaît que sous charge. **⚠️ ET J'AI FAILLI ACCUSER MON PROPRE COMMIT** : `875e63f` collait 3 collapses sur 3 pendant que `cc94547` et `6f9369f` tenaient — j'allais conclure à une régression. Relancé sur machine tranquille, `875e63f` tient **3 fois sur 3**. Les trois premières mesures avaient été prises juste après des campagnes E2E lourdes. C'est la règle 2 mot pour mot, et la règle 11 : une mesure sans son environnement consigné n'est pas une mesure.

