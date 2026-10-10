---
id: BUG-QA1001-RETOUR-PERD-LES-MODIFICATIONS
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**P0 — Retour sur un projet existant : chaque réouverture remplace la copie SERVEUR du projet par la version
écrite par l'agent. Les modifications de l'utilisateur ne survivent que tant que le volume de son espace de
travail existe. Quand l'espace est recréé, elles sont PERDUES.**

### Banc

Mesuré le 2026-10-01 entre 19:20 et 19:40 (heure locale), sur le CHEMIN D'ÉCRITURE DE LA PRODUCTION reconstitué
en local :
- vrai workspace-manager et vrai Kubernetes (OrbStack, `KUBECONFIG` isolé, jamais la prod) ;
- vraie image de l'agent construite depuis le dépôt ;
- API en mode `remote-kubernetes`, `WORKSPACE_LOCAL_RUNTIME_FALLBACK=false` ;
- site en `VITE_RUNTIME_MODE=remote-kubernetes` ;
- `main` = **81a4e8c5d**, arbre propre, qui contient #667 (« ce que l'utilisateur enregistre n'est plus écrasé par
  l'agent »).

Ce n'est PAS la production : c'est son chemin de code. La mesure en production attend un compte connecté.

### Scénario

Projet créé par l'agent : « une page unique avec un compteur et deux boutons plus et moins », 8 fichiers, pod
d'espace `Running`. Puis dix fois :
1. modifier `src/App.tsx` dans l'éditeur (une marque datée en première ligne) ;
2. « Enregistrer » ;
3. fermer le navigateur ;
4. rouvrir dans un navigateur NEUF.

### Ce qui est mesuré

1. **10 réouvertures sur 10** (`qa-2026-10-01/retour-dix-fois.txt`) :
   - juste après l'enregistrement, la copie serveur contient la marque ;
   - à la réouverture suivante, elle ne la contient plus. L'écran, lui, la montre : l'espace de travail l'a
     gardée.
   - À la fin : copie serveur = **1 235 caractères, la version d'origine de l'agent**, aucune des 12
     modifications.
2. **Quand ça arrive** (`retour-quand-la-copie-serveur-recule.mjs`) :
   - ni pendant les 24 s où l'onglet reste ouvert, ni après sa fermeture : la copie serveur garde la marque ;
   - c'est **à la réouverture**, dans les 5 s : le navigateur envoie
     `POST /api/projects/:id/files/import/zip` avec `replaceExisting: true`, et la copie serveur repasse à
     1 235 caractères.
   - Émetteur : `WorkbenchStore.#persistRuntimeFilesToProjectStorage`, appelé par
     `#refreshPreviewAfterArtifactClose` à la fermeture d'un artefact, y compris quand l'historique de l'agent
     est REJOUÉ à la réouverture.
3. **Conséquence visible** (`retour-apres-recyclage-de-l-espace.mjs`) :
   - l'espace est supprimé comme le fait le ramassage (volume détruit), puis le projet est rouvert ;
   - l'espace recréé est réensemencé depuis la copie serveur : `src/App.tsx` = 1 235 caractères, version de
     l'agent ;
   - **le travail de l'utilisateur est perdu**. Lu directement dans l'espace (`files/read` de l'agent), pas à
     l'écran.

### Ce qui est DÉDUIT, pas observé

En production, `WORKSPACE_IDLE_STOP_MINUTES` et `WORKSPACE_DELETE_STOPPED_HOURS` ne sont pas posés (lu dans les
configmaps, lecture seule). Les défauts du code s'appliquent donc : arrêt après **30 min** d'inactivité,
suppression du volume **24 h** plus tard.

Un client qui modifie son projet puis revient le lendemain retrouverait donc la version de l'agent.

D'autres usages de la copie serveur portent aussi l'ancienne version, à vérifier un par un : l'export zip
(vérifié : version de l'agent), et probablement Git (exécuté côté API) et la publication de repli.

## Cause

`WorkbenchStore.updateArtifact` déclenche, à la fermeture de CHAQUE artefact, `#refreshPreviewAfterArtifactClose`,
qui enregistre les fichiers du runtime vers la copie serveur avec `replaceExisting: true`. À la réouverture, les
artefacts de l'historique sont rejoués : leurs actions sont sautées (`MessagesRecharges`, #600, #633), mais leur
FERMETURE ne l'était pas. L'enregistrement partait donc dans les 5 s qui suivent l'ouverture, avant que le
runtime reflète l'espace modifié par l'utilisateur.

Vérifié le 2026-10-06 : `workbench.ts` n'a pas changé entre la mesure (81a4e8c5d) et `main` (682dfb6e8), et #633
ne touche que l'identification des sous-agents. Le chemin mesuré était donc toujours ouvert.

## Correctif (2026-10-06, branche `fix/retour-ne-recule-plus`)

Un artefact dont le message est rechargé n'est plus enregistré à sa fermeture : il n'a rien écrit, il n'a rien
de neuf à enregistrer. Exception gardée : un message RATTRAPÉ après une coupure (`autoriserLaReprise`), dont les
fichiers interrompus viennent d'être écrits. Un artefact neuf est toujours enregistré.

Épinglé par `app/lib/stores/workbench.retour-ne-recule-pas.spec.ts` (4 cas). Contre-épreuves :
- correctif retiré : les 2 cas de réouverture rougissent (1 import destructif par artefact rejoué) ;
- garde trop large (ne jamais enregistrer) : les 2 cas « artefact neuf » et « message rattrapé » rougissent ;
- exception « rattrapé » retirée : son cas rougit.

Non-régression : `app/lib/stores`, `app/lib/runtime`, `app/components/workbench` = 143 fichiers sur 143.

**Second chemin, même perte, corrigé dans la même branche** : BUG-QA0929-IDE-STATE-HISTORIQUE-ECRASE — le
serveur rematérialisait tout le fil à chaque `PUT /ide-state`, même un `PUT` d'interface seule, dans le manifeste
que lisent l'export, git, la publication et le réensemencement. Fermer le seul chemin navigateur aurait laissé la
perte se produire au réensemencement.

De bout en bout : `tests/e2e/retour-ne-recule-pas.spec.ts` (navigateur neuf, copie SERVEUR relue après 20 s).

## 📤

☑ pris par la session balayage le 2026-10-06 (personne ne le portait ; #600 traite le rejeu des ACTIONS, pas la
fermeture)

## 💻

☑ codé, en cours de preuve — branche `fix/retour-ne-recule-plus`, non fusionnée

## ✅

☐ preuve sur le chemin de la production (même banc que la mesure : dix réouvertures, copie SERVEUR lue) à
refaire avec le correctif

### Seconde mesure, indépendante (2026-10-06, CI, navigateur réel)

`tests/e2e/retour-ne-recule-pas.spec.ts` lancé seul (`workflow_dispatch`, entrée `spec`). En mode spec seul,
chaque tranche joue tout le spec : quatre exécuteurs indépendants par passage.
- **SANS correctif** (branche jetable `qa/retour-contre-epreuve` = `main` 682dfb6e8 + le test seul,
  run 37437263249) : **4 exécuteurs sur 4 en échec, aux 3 tentatives chacun (12/12)**. Un import
  `replaceExisting` de la copie serveur part à la réouverture ; quand il aboutit, la copie serveur relue
  vaut `// VERSION-AGENT` au lieu de `// VERSION-UTILISATEUR-ENREGISTREE`.
- **AVEC correctif** (`e46de90c4e`, run 37437259815) : **4 sur 4 réussis**, au premier essai.

### Re-mesure sur `main` du 2026-10-08 (`305d6fe61`, 16 commits de plus)

Même instrument, branches remises à jour : contre-épreuve `qa/retour-contre-epreuve-1008` = `main` + le test seul
(run 37826663043) ; correctif fusionné avec `main` (`238ea4660a`, run 37826658589).
- **SANS correctif : 12/12 échecs** (4 exécuteurs × 3 tentatives), un remplacement destructif de la copie serveur
  part à chaque réouverture.
- **AVEC correctif : 4/4 réussis, au premier essai.**

Le défaut est toujours présent sur le code du jour, et le correctif le ferme toujours.

La porte de ces deux passages est rouge pour une autre raison, sans rapport avec le test : en mode spec seul,
elle juge « vide » une tranche qui n'apporte aucun test NOUVEAU (voir BUG-QA1006-PORTE-E2E-SPEC-SEUL).
Les verdicts ci-dessus sont lus dans les rapports Playwright des tranches.

## Preuve

Mesure d'origine : les trois scripts et la sortie des dix réouvertures dans `docs/bugs/qa-2026-10-01/`.
Gardes : épinglé par `app/lib/stores/workbench.retour-ne-recule-pas.spec.ts`,
`services/api/src/tests/ide-state-materialise-une-fois.spec.ts` et `tests/e2e/retour-ne-recule-pas.spec.ts`.
Preuve live : à venir.
