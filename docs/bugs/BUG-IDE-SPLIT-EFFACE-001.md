---
id: BUG-IDE-SPLIT-EFFACE-001
---

## Bug

**P2 — un partage de panneau (« Split active right ») DISPARAÎT tout seul ~2,5 s après avoir été fait, quand la machine est chargée.** Mesuré au chronomètre dans la page : 1 feuille à 27 493 ms, **2 feuilles à 29 959 ms** (le partage a bien eu lieu), **1 feuille à 32 481 ms** — et AUCUN appel réseau entre les deux, donc une remise à zéro purement côté client. C'est ce qui fait échouer `rpl-ide-live-proof.spec.ts:219` (le partage vertical vise un panneau qui vient d'être remplacé : « element was detached from the DOM, retrying »), l'un des trois tests qui bloquent la barrière de livraison.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 16/09 — **cause racine MESURÉE, pas déduite** (build instrumenté, CPU ×20 + 4 boucles CPU, puis reproduction déterministe). `BaseChat` est monté **trois fois** au démarrage de l'IDE : la coquille `ClientOnly` (t = 21,1 s sous charge), la coquille `Suspense` pendant le chargement différé de `Chat.client` (t = 30,4 s), puis le vrai composant (t = 36,2 s) — et `Chat` garde encore sa propre coquille tant que `GET …/ide-state` n'a pas répondu. Chaque coquille est un `BaseChat` complet, donc pleinement interactif ; puis elle est remplacée par un TYPE différent à la même position, et React démonte tout. **La remise à « 1 feuille » n'était pas une restauration : c'était le remontage**, et il emportait le geste. Les 2,5 s du 09/09 sont le temps de chargement du vrai composant sous charge ; « aucun appel réseau » est exact : rien n'est demandé, tout est jeté. C'est le mécanisme que #552 mesure pour la frappe (« le champ apparaît à +4,2 s, le vrai `Chat` arrive à +6,3 s, et tout ce qui a été tapé entre les deux disparaît »).

**Reproduction déterministe** : `GET …/ide-state` retardé de 6 s, partage sur la coquille, témoin posé sur la feuille de la coquille → témoin disparu (la bascule a eu lieu) et **1 feuille** — `tests/e2e/ide-split-sur-coquille.spec.ts`, rouge sur `bcbf0814` (« le partage survit au remontage : Received 1 »).

**Correctif** — `app/components/chat/ide-layout-handoff.ts` : la disposition (arbre, panneau actif, flottants) est tenue HORS de React le temps de la bascule — déposée au démontage en phase layout, reprise au montage dans le même commit — portée par projet + fenêtre d'édition, périmée après 30 s. Même forme que le passe-plat du composeur de #552, qui traite la frappe faite dans la même fenêtre. Les deux hypothèses écartées le 09/09 (412 et restauration) restent écartées : la garde `laDispositionPeutEtreRestauree` fait son travail, mesuré (`intacte=false` dès qu'un onglet est ouvert).

## ✅ Testé live

☐ — à constater sur `app.e-code.ai` après déploiement : ouvrir un projet sur une connexion lente (ou juste après un déploiement, cache froid), partager un panneau **pendant** que l'IDE finit de charger ; le partage doit rester. Reproduction locale déterministe verte : voir Preuve.

## Preuve

**DEUX HYPOTHÈSES ÉCARTÉES PAR LA MESURE, pas par la lecture.** (1) « Le re-merge après conflit 412 de `projectIdeMemory` renvoie l'état serveur dans CE tabulateur, et l'écouteur de BaseChat l'applique sans garde » — séduisant, et faux : la trace ne montre **aucun PUT**, donc aucun 412. (2) « La restauration d'état IDE écrase la disposition » — la garde `laDispositionPeutEtreRestauree` existe déjà pour exactement ce défaut (tracé le 02/09) et `paneTreeRef` est réassigné à chaque rendu. **PISTE RESTANTE, non vérifiée** : cette garde lit un `ref` mis à jour AU RENDU ; si la restauration se résout depuis le cache mémoire (aucun réseau — ce que montre la trace) avant que React n'ait rendu le partage, la garde compare encore la disposition PAR DÉFAUT et laisse passer l'écrasement. Cela expliquerait pourquoi le défaut n'apparaît que sous charge. **⚠️ ET J'AI FAILLI ACCUSER MON PROPRE COMMIT** : `875e63f` collait 3 collapses sur 3 pendant que `cc94547` et `6f9369f` tenaient — j'allais conclure à une régression. Relancé sur machine tranquille, `875e63f` tient **3 fois sur 3**. Les trois premières mesures avaient été prises juste après des campagnes E2E lourdes. C'est la règle 2 mot pour mot, et la règle 11 : une mesure sans son environnement consigné n'est pas une mesure.

**Preuve du correctif (16/09, build local 12:07 sur `bcbf0814` + passe-plat, pile locale API 3001 / web 5175, Chromium 1440)** : trace du même E2E — montage de la coquille à 1,4 s, seconde coquille à 1,8 s, **partage à 2,9 s sur la coquille**, bascule vers le vrai composant à 6,5 s → **2 feuilles conservées**, test vert (11,8 s). Premier essai rouge avec un dépôt au seul démontage : le vrai composant lit la disposition pendant son RENDU, qui précède le commit où la coquille est démontée — d'où le dépôt à chaque changement. `rpl-ide-live-proof.spec.ts` (light) reste vert sur le même build (15,0 s).

**Garde (règle 16)** : épinglé par `tests/e2e/ide-split-sur-coquille.spec.ts` (rouge sur `bcbf0814`, vert avec le passe-plat) + `app/components/chat/ide-layout-handoff.spec.ts` (4 verts : même portée, autre portée intouchée, fenêtres distinctes, péremption).
