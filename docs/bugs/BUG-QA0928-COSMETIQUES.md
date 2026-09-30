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

☐

## 💻

☐

## ✅

☐

## Preuve

Voir chaque point. Aucun test — point OUVERT.
