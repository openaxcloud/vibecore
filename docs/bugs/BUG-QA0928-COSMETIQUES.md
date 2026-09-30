---
id: BUG-QA0928-COSMETIQUES
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**COSMÉTIQUE — trois libellés ou placements trompeurs relevés pendant le balayage du 28/09.**

1. **« Republish your app » sur un projet jamais publié.** Le panneau Déploiements titre
   « Republish your app » / « Republier votre application » au-dessus de « Not published — Nothing
   published yet ». Titre posé sans condition : `app/components/deploy/PublicationReplit.tsx:194`
   (`publication.title`). Repro locale : `sweep-panneaux-ide.mjs`, artefact
   `artefacts/panneau-1440-Deployments.png`.
2. **Accueil à 390 px : le champ « Décrivez votre idée » est sous le premier écran.** WebKit
   iPhone 13, français : haut du champ à 689 px pour 664 px de hauteur utile — le titre prend six
   lignes. L'appel à l'action principal n'est pas visible sans défiler. Mesuré en production
   (`repro-anon-handoff.mjs`, artefact `artefacts/handoff-webkit-390-1-typed.png`).
3. **Barre d'état contradictoire quand le workspace a échoué** : « Connected » en vert à côté de
   « Workspace Err… » tronqué, seul signe de l'échec. Observé en local, runtime absent
   (`artefacts/quota-storm-chromium.png`) — **à confirmer** en production.

## 📤

☑ 30/09 #617, #619, #621

## 💻

☑ 30/09 point 1 `575646363`, point 2 `58cad9150` ; ☐ point 3 (#621 ouverte)

## ✅

☐ pas encore servi en prod au 30/09 13:45

## Preuve

Voir chaque point. Aucun test — point OUVERT.

**30/09 — état par point.**
1. « Republier » sur un projet jamais publié — **PROUVÉ** (#617) : rouge 3/5 avant, 5/5 après, exécuté en CI (`✓ app/components/deploy/titre-publication.spec.tsx (5 tests)`). Épinglé par `app/components/deploy/titre-publication.spec.tsx`.
2. Champ d'idée sous le premier écran sur iPhone — **PROUVÉ** (#619) : bas du champ 737 → 637 px pour 659 utiles (FR, iPhone 15 Pro) ; vert en CI sur `webkit-iphone` FR et EN ; contre-épreuve rouge. Épinglé par `tests/e2e/accueil-champ-au-premier-ecran.spec.ts`. **Constat voisin, NON TRAITÉ (arbitrage)** : sur bureau 1280×720 le champ déborde aussi (866 px FR / 770 EN pour 720) ; y remédier touche l'échelle du titre bureau.
3. « Connected » à côté de « Workspace Error » — **REPRODUIT en local** (pile locale réelle, `remote-kubernetes`, quota plein), **pas confirmé en production** (il faudrait un compte au quota plein). **CORRIGÉ**, PR #621 : verdict CI attendu. Repro `docs/bugs/qa-2026-09-28/repro-barre-etat-connexion.mjs`, captures avant/après dans `artefacts/`. Épinglé par `app/components/chat/connexion-barre-etat.spec.ts` et `app/components/chat/BaseChat.ts-nocheck-debt.spec.ts`.
