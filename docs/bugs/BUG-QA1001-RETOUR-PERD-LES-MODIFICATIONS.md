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

## Cause (à confirmer par la session moteur)

À la réouverture, l'historique de l'agent est rejoué. À la fermeture de l'artefact rejoué, le magasin pousse
vers le stockage serveur, avec remplacement, des fichiers qui sont ceux de l'agent et non ceux de l'espace
modifié par l'utilisateur.

Je ne corrige pas : c'est le cœur du moteur, que vient de toucher #667, et un correctif mal placé effacerait
autre chose.

## 📤

☐ à transmettre à la session moteur / relance (auteur de #667)

## 💻

☐

## ✅

☐

## Preuve

Les trois scripts et la sortie des dix réouvertures sont dans `docs/bugs/qa-2026-10-01/`. Ils se rejouent sur
la pile décrite ci-dessus.

Le test qui épinglera le correctif doit faire **rouvrir** le projet après une modification enregistrée, puis
vérifier la copie SERVEUR, pas seulement l'écran : l'écran était juste à chaque fois.
