---
id: BUG-WEBKIT-SCROLL-FIL-001
---

## Bug

(mise à jour 14/09 soir — **#534 est DÉPLOYÉ** : run 1607 de `deploy-main.yml`, SHA `4fd22595`, « Verify rollout » et « Verify running imageIDs match the release manifest » verts à 20:20 UTC ; déployer n'est pas vérifier, ☐ Testé live inchangé)  — **le correctif `initial='instant'` ne suffisait PAS, et le canari l'a dit**) Run `Production E2E` 1945 sur `main` à `4fd22595` (donc AVEC `initial='instant'`), job « Playwright local stack », lu dans le journal (jamais le `conclusion` de l'API) : `webkit-iphone exit: 1`, canari 16,3 min (chargé ; 4 min sain). Mobile 390 : essai 1 = arrivée du contenu (l. 272) ; **retry #1 ET retry #2 = `dejaEnHaut` : scrollTop=0 scrollHeight=2563 clientHeight=599, `1 défilant(s) : div.w-full.h-auto`, et AUCUNE pilule** — le hook se croit en bas, le DOM est en haut. Sur le run de la PR #535 (même code de fil), mobile 390 a PASSÉ la sonde au premier essai (47 s) : un succès pour deux `dejaEnHaut`, c'est le profil d'une COURSE (règle 17), pas d'un déterminisme. **Hypothèse « mauvais élément » définitivement réfutée** : `div.w-full.h-auto` est le `scrollRef` du composant `StickToBottom` lui-même (`app/lib/hooks/StickToBottom.tsx` l. 132). **Mécanisme, lu dans `useStickToBottom.tsx`** : seul le CONTENU est observé par `ResizeObserver` (l. 559), jamais le conteneur. Si le premier redimensionnement du contenu arrive alors que le conteneur n'est pas encore contraint en hauteur (clientHeight = scrollHeight → cible = 0), la boucle « instantané » (`scrollTop < cible` faux) se termine aussitôt, `isAtBottom` reste vrai ; quand la mise en page contraint ensuite le conteneur à 599 px, le contenu ne change pas : rien ne rejoue le collage. Chromium contraint le conteneur avant le premier calcul, WebKit pas toujours — un vert Chromium qui ne prouvait rien pour iOS, à la lettre. **CORRIGÉ** : le hook observe aussi le conteneur (`state.observateurDuConteneur`) et recolle en bas à chaque changement de hauteur visible, seulement si l'on est censé y être (`isAtBottom` sans échappement) et pas déjà en bas — un utilisateur qui a remonté le fil n'est jamais ramené de force.

## 📤 Dispatché

☑ 14/09

## 💻 Codé

☑ 14/09

## ✅ Testé live

☐

## Preuve

épinglé par `app/lib/hooks/useStickToBottom.conteneur.spec.tsx` (jsdom rejoue EXACTEMENT la séquence WebKit : contenu 2 563 px observé pendant que le conteneur fait 2 563 px → scrollTop 0 ; conteneur contraint à 599 → scrollTop ≥ 1 963 ; et le cas « utilisateur remonté » qui ne doit pas bouger). Contre-épreuve : observation du conteneur retirée → 2 rouges ; restaurée → 2 verts. `agent-scroll-stability.spec.ts` toujours vert (10 tests). **14/09 21:13 — LE CANARI DE LA PR #537 RÉFUTE LA SUFFISANCE DE CE CORRECTIF** (run 34893067202, `webkit-iphone exit: 1`, canari 9,3 min) : mobile 390 essai 1 et retry #2 → `dejaEnHaut` scrollTop=0 scrollHeight=2563 clientHeight=599 (même détail qu'avant), retry #1 → ✓ en 49 s ; tablette 768 → arrivée du contenu (l. 272). Un succès pour deux échecs identiques, AVEC l'observation du conteneur : le mécanisme « conteneur contraint après le premier calcul » n'est pas (ou pas seul) la cause. Le correctif reste juste (garde verte, contre-épreuve) mais n'est pas la solution ; la PR est renommée pour le dire. Ce que la sonde ne mesure pas encore : le CHRONO — elle vérifie « en bas » à l'instant où le contenu apparaît, sans distinguer « arrive 500 ms plus tard » de « n'arrive jamais » ; c'est la mesure suivante. **14/09 21:51 — RELEVÉ DU CHRONO, canari de la tête `a76637d9` (run 34898142208, machine saine : canari 6,4 min, `webkit-iphone exit: 0`, 10 passed)** : `[fil] mobile 390 — arrivée en bas après 0 ms — t=0ms top=1963 h=2563 vue=599 pilule=0` (premier essai, sans retry) ; `[fil] tablette 768 — arrivée en bas après 100 ms — t=0ms top=0 h=1729 vue=779

