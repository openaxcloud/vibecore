---
id: BUG-QA0929-IDE-STATE-HISTORIQUE-ECRASE
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**BLOQUANT — DÉCISION REQUISE — chaque `PUT /ide-state` portant le fil réécrit, côté serveur, les fichiers du projet avec la dernière version que l'agent leur a donnée dans l'historique, par-dessus toute modification ultérieure.**

Second chemin de BUG-QA0929-REOUVERTURE-REJOUE, trouvé par son test E2E une fois le chemin client
fermé. Aucune proposition ni aucun toast : le client envoie simplement l'état de l'IDE avec le fil
(`{ ui, chat: { messages }, updatedAt }`, sans fichiers), comme il le fait pour mettre le fil en
cache à la première ouverture.

Mécanisme (`services/api/src/app.ts`) :
- `PUT /projects/:projectId/ide-state` : `projectFilesFromIdeStateRoot` extrait le contenu de TOUTES
  les `<boltAction type="file">` du fil et l'écrit dans le manifeste de fichiers de l'état —
  `mergedFiles.set(file.path, file)` sans condition, donc l'historique écrase le manifeste ;
- `ensureProjectStorageFromIdeState` (export, archive de réensemencement…) synchronise ensuite le
  STOCKAGE sur ce manifeste.

## Repro (LOCAL, build de prod WebContainer, avec le correctif client de #600)

```
AVANT toute ouverture, stockage = // VERSION-UTILISATEUR-RECENTE
  PUT ide-state 6.5s {"cles":["ui","chat","updatedAt"],"messages":2,"fichiers":null}
    → stockage après ce PUT : // VERSION-AGENT-ANCIENNE
```

(sonde `docs/bugs/qa-2026-09-28/sonde-reouverture-rejoue.mjs`, avec journal des `PUT /ide-state`)
En CI, run 36597446117 : `Expected "// VERSION-UTILISATEUR-RECENTE"`, `Received "// VERSION-AGENT-ANCIENNE"`,
3/3.

## Pourquoi ce n'est pas corrigé dans #600

Ce mécanisme est volontaire à l'origine (`af63dbfd4`, 26/05, « Persist project files across API
replicas ») : en mode WebContainer, l'historique du fil est la seule voie par laquelle les écritures
de l'agent atteignent le stockage. Le borner (« l'historique ne complète que les chemins absents »)
pourrait empêcher une mise à jour légitime de l'agent d'être persistée. Il faut décider quelle est
la source de vérité des fichiers — stockage/pod, ou historique du fil — et, en mode distant
(production), mesurer avec un compte si les modifications de l'utilisateur sont déjà reverties au
réensemencement.

Piste : ne matérialiser un message qu'UNE fois (mémoriser dans l'état les messages déjà
matérialisés) — un message relu sur un autre appareil ne réécrit alors plus rien.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Repro locale + CI ci-dessus. Aucun test — point OUVERT, décision requise.
