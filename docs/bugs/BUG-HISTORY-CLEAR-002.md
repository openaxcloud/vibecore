---
id: BUG-HISTORY-CLEAR-002
---

## Bug

**P1 — « Effacer l'historique » : le fil REVIENT quand une lecture de transcription atterrit après l'effacement, et les anciens messages sont poussés dans la conversation NEUVE** — la suite de BUG-HISTORY-CLEAR-001, dont le correctif du 06/09 ne couvrait que la transcription adoptée AVANT l'effacement. Trouvé par la CI : run E2E 1969 sur `main` (`57221ee4`, #536 = un spec vitest, aucun code), `ide-mobile-chrome.spec.ts:2531` rouge **3 fois sur 3** « 0 attendu, 2 reçus », vert sur `7d00dc71` et `0877b6d6` ; même test avait refusé un commit documentaire le 08/09. Runner chargé (30,9 min contre ~21). **MESURÉ en local** (build de production, Postgres + Redis + API, sonde `probe-clear-lent.mjs` avec retard réseau injecté) : au montage, DEUX lecteurs demandent `/messages` — le hook d'hydratation (`useProjectAiTranscriptHydration`, dès que l'ide-state donne l'identifiant) et le repli serveur (`completerFilSiVide`, une requête `?limit=1` plus tard) ; quand la réponse du second atterrit après l'effacement, relevé toutes les 100 ms : `000000000000000000000000000004` — fil vide 2,9 s, puis 4 lignes. Ensuite, dans le trace : la conversation courante REPASSE à l'ancienne (`adopter(ancienne)`), les 4 messages sont persistés (`persistance.tour` rang 3, 4 messages) et **`PUT /transcript` dans la conversation NEUVE** ; avec 2,5 s de retard sur tout, DEUX `POST /ai/conversations` (deux conversations neuves, l'une orpheline). Un défaut de DONNÉES, pas seulement d'affichage. **Quatre trous, un mécanisme** (règle 7) : (1) `applyTranscript` du hook d'hydratation ne connaissait pas la génération du fil ; (2) l'effet d'adoption ne refusait que par identité (`dejaAdoptee`), et une transcription arrivée après l'effacement porte une identité neuve ; (3) `completerFilSiVide` posait et adoptait sans relire l'identité de conversation à l'arrivée ; (4) `ensureProjectAiConversation` lançait un `POST` par appelant concurrent, et `syncProjectAiTranscript` en demandait un pour une génération déjà passée. **CORRIGÉ** : `generationDuFil` lu au départ et relu à l'arrivée dans le hook ; `filVideParLUtilisateur` dans la règle d'adoption ; `lireIdentite` dans `completerFilSiVide` (identité changée pendant la lecture → ni pose ni adoption) ; `partagerLaCreation` (un seul `POST` à la fois) et garde de génération AVANT `ensureProjectAiConversation` dans la synchronisation.

## 📤 Dispatché

☑ 14/09

## 💻 Codé

☑ 14/09

## ✅ Testé live

☐

## Preuve

**Épinglé par** `app/components/chat/useProjectAiTranscriptHydration.spec.ts` (transcription jetée si la génération a bougé + contre-épreuve), `app/components/chat/late-stored-transcript.spec.ts` (`filVideParLUtilisateur` + les trois branchements lus dans `Chat.client.tsx`), `app/lib/persistence/serveur-fil-projet.spec.ts` (identité changée → rien ; inchangée → posé et adopté ; sans lecteur → intact), `app/lib/persistence/useChatHistory.fil-serveur.spec.tsx` (le lecteur d'identité est branché sur le store), `app/components/chat/creation-partagee.spec.ts`, et `tests/e2e/ide-mobile-chrome.spec.ts:2531` rendu DÉTERMINISTE (le second `/messages` retardé de 4 s, fenêtre d'observation 6 s). **Contre-épreuve mesurée** : trois formes de retard ne reproduisaient PAS (`/messages` en bloc ; `?limit=1` seul — le serveur répond après la création de la neuve et le repli lit la neuve, vide ; second `/messages` à 5 s avec fenêtre 3 s — le test regardait avant l'arrivée) ; la quatrième (second `/messages` à 4 s, fenêtre 6 s) rend le test **rouge sur le build défectueux** avec le message exact de la CI, puis **vert avec le correctif** (17,0 s). Sondes sur le build corrigé (14/09 23:16 UTC, tête `c16bc1da` + correctif) : tout-retardé 2,5 s sans amorçage → `000000000000000000000000000000`, 0 ligne à 8 s, UN seul `POST /ai/conversations`, aucun `PUT /transcript` ; second `/messages` à 5 s avec amorçage → idem, conversation courante = la neuve. Portes : eslint 0, `tsc` 0, vitest `app/components/chat` + `app/lib/persistence` 124 fichiers / 984 tests verts, gardes E2E 10 verts. **15/09 00:46 UTC — #539 DÉPLOYÉ** : run 1611 de `deploy-main.yml` (SHA `3abe638b`), porte de release franchie à 00:28 sur le run E2E 1975 de `main`, « Helm upgrade » 00:42→00:46, « Verify rollout » et « Verify running imageIDs match the release manifest » verts (💻). Run E2E 1975 (`3abe638b`, runner sain, 19,6 min) : « Effacer l'historique » ✓ au premier essai avec le traînard forcé, 333 verts, 0 rouge. Run E2E 1971 (`c16bc1da`, SANS le correctif, runner sain, 24,6 min) : le même test ✓ — la course ne se joue que sous charge, ce qui est exactement ce que le retard injecté rend déterministe. ⚠️ ☐ Testé live : la preuve iPhone reste à prendre sur `app.e-code.ai` (réseau mobile réel = le cas lent).

