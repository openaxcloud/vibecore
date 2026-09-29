---
id: BUG-QA0929-REOUVERTURE-REJOUE
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**BLOQUANT — la première ouverture d'un projet sur un appareil rejoue les écritures historiques de l'agent et écrase en silence le travail de l'utilisateur, avec « applied successfully » à l'écran.**

Un utilisateur fait écrire `src/Contact.tsx` par l'agent, puis modifie ce fichier. Il ouvre ensuite
le projet sur un autre appareil (ou après avoir vidé son cache) : l'IDE relit le fil depuis le
serveur, traite l'ancienne `<boltAction type="file">` comme neuve, et réécrit le fichier avec la
version de l'agent. Le stockage du projet est réécrit. Un toast annonce « 1 file applied — The agent
patches were applied successfully ».

C'est aussi la cause de l'instabilité de `tests/e2e/ide-mobile-chrome.spec.ts` « menu contextuel sur
le dernier message » : à 390 px, ce toast recouvre le haut du fil, et sur un runner lent le second
appui long tombe sur lui au lieu du message (3 réussites sur 14 tentatives en CI le 2026-09-29,
toutes branches confondues, `main` compris). Ce n'est PAS un saut de défilement : mesuré, aucune
ligne démontée ni aucun défilement pendant l'appui qui échoue.

## Cause

`app/components/chat/Chat.client.tsx` — `processSampledMessages` appelle, avant CHAQUE passe du
parseur, `workbenchStore.setReloadedMessages(initialMessages…)`, qui REMPLACE l'ensemble des messages
rechargés. `initialMessages` vient du cache local : vide sur un appareil neuf. Le fil relu depuis le
serveur (`applyTranscript`) était marqué, puis aussitôt démarqué par cette passe ; ses actions
passaient donc le garde de `_runAction` et s'exécutaient.

## Repro

```sh
# Sonde (LOCAL, build de prod WebContainer, API 127.0.0.1:3011)
node docs/bugs/qa-2026-09-28/sonde-reouverture-rejoue.mjs
# AVANT toute ouverture, stockage = // VERSION-UTILISATEUR-RECENTE
# {"ouverture":1,"ecrituresDePropositions":3,"toasts":["1 file applied …"],"stockageDuProjet":"// VERSION-AGENT-ANCIENNE"}
# {"ouverture":2,"ecrituresDePropositions":0,"toasts":[],"stockageDuProjet":"// VERSION-AGENT-ANCIENNE"}
```

Test E2E : `tests/e2e/reouverture-ne-rejoue-pas.spec.ts` — rouge 3/3 sur le build sans correctif
(toast vu ; stockage `// VERSION-AGENT-ANCIENNE` au lieu de `// VERSION-UTILISATEUR-RECENTE`).

Non reproduit en production (demande un compte) ; le chemin de code est commun aux deux modes
runtime.

## Second chemin (serveur) — fiche distincte

Une fois ce chemin client fermé, le stockage est ENCORE réécrit à la première ouverture, sans
proposition ni toast : par le serveur, à chaque `PUT /ide-state` portant le fil. Voir
BUG-QA0929-IDE-STATE-HISTORIQUE-ECRASE (décision requise).

## Correctif (chemin client)

`app/lib/stores/messages-recharges.ts` : deux ensembles — les messages du cache local (remplacés à
chaque passe, contrat inchangé) et le fil relu depuis le serveur (`markHydratedMessages`, jamais
effacé par ce remplacement, oublié au changement de projet). Marquage fait AVANT `setMessages`.

## 📤

☐

## 💻

☐ branche `fix/ecritures-refusees-workspace`

## ✅

☐

## Preuve

Chemin client : `tests/e2e/reouverture-ne-rejoue-pas.spec.ts` rouge 3/3 sans le correctif (actions
historiques rejouées : écritures de propositions émises), vert 3/3 avec (build de prod local,
2026-09-29). En CI (run 36597446117), le test instable « menu contextuel sur le dernier message » est
passé du premier coup. Épinglé par `app/lib/stores/messages-recharges.spec.ts` (mécanisme) et
`tests/e2e/reouverture-ne-rejoue-pas.spec.ts` (comportement). Le point reste OUVERT tant que le
second chemin (serveur) n'est pas tranché.
