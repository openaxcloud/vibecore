# Architecture réelle des chemins de sauvegarde et de persistance

**Mesuré sur la production le 2026-08-31**, requête par requête, avec relecture
serveur à chaque étape. C'est le domaine où nous nous sommes le plus trompés :
deux correctifs ont été branchés au mauvais endroit faute de cette carte.

> Ne rien ajouter ici qui n'ait été mesuré. Chaque affirmation porte sa preuve.

---

## Les trois lieux où vivent les fichiers

| Lieu | Qui l'écrit | Qui le lit | Durée de vie |
|---|---|---|---|
| **Tampon de l'éditeur** (Monaco) | la frappe | l'affichage | l'onglet |
| **Runtime** (le pod de l'espace de travail) | `PUT /api/runtime/workspaces/<ws>/files/write` | l'aperçu, le terminal, le build | la vie du pod |
| **Archive du projet** (`files.entries` de l'état IDE, en base) | voir plus bas | la **réouverture** | permanente |

**C'est l'archive qui décide de ce qui survit à une réouverture.** Le runtime est
volatil : au rechargement, `planReseedDeletions`
(`app/lib/runtime/workspace-reseed.ts:150`) fait converger le pod **vers
l'archive** — « fichier du pod absent de l'archive → supprimé ».

---

## Ce que fait un `Ctrl+S`, mesuré

Trace complète, corps entiers, sur un projet neuf :

```
PUT /api/runtime/workspaces/<ws>/files/write     204   ← le contenu part
PUT /api/projects/<id>/ide-state                 200   ← files.entries = photo de l'OUVERTURE
PUT /api/projects/<id>/ide-state                 412   ← conflit de version, retenté
PUT /api/projects/<id>/ide-state                 200
```

**Vérifié côté serveur juste après :**

| | contenu |
|---|---|
| runtime | `# QA runtime sync\nSYNC-MARQUEUR` ✅ |
| archive | `# QA runtime sync` ❌ |

Le nombre de requêtes **varie selon l'état de l'espace de travail** — c'est ce qui
m'a donné deux mesures contradictoires, toutes deux exactes :

| Situation | Requêtes |
|---|---|
| première sauvegarde après provisionnement | **9**, dont `files/write` **et** un `POST /import` |
| sauvegardes suivantes | **3**, uniquement `ide-state` |

**Conséquence méthodologique** : une seule observation ne décrit pas ce chemin.
Mesurer dans les deux situations.

---

## Qui écrit dans l'archive

`persistProjectFileManifest` (`services/api/src/app.ts`) — **11 appels**, tous
sur des chemins **en masse** :

* création de projet : vide, depuis un modèle, depuis l'IA ;
* imports : validation, GitHub (×2), zip ;
* `POST /projects/:id/files/import/zip` — **déclenché à la fermeture d'un
  artefact de l'agent** ;
* restauration de point de sauvegarde, duplication, restauration d'instantané.

Et **une** écriture unitaire, ajoutée le 31/08 : `persistProjectFileEntry`,
appelée par `PUT /files/write` hors flux de génération.

> Le compte de 11 a d'abord été lu à **5** sur un `head -6` tronqué, ce qui m'a
> fait écrire que l'archive était « figée à la création, pour toujours ». Elle ne
> l'est pas. Le test `project-manifest-durability.spec.ts` épingle le 11 pour que
> la prochaine lecture soit exacte.

---

## Le piège central : le client renvoie ce qu'il n'a pas produit

Le client fait `{ ...existing }` sur l'état que le **serveur** lui a rendu, puis
renvoie le tout. Il retransmet donc des clés que **son propre type ne déclare pas** :

| | clés |
|---|---|
| type client `ProjectIdeMemory` | `chat`, `ui`, `updatedAt` |
| charge réellement envoyée | `chat`, `ui`, **`files`**, `updatedAt` |

Le `files` renvoyé est **la photo prise à l'ouverture**. Avant le 31/08, la fusion
serveur faisait `{ ...existing, ...incoming }` : la photo remplaçait la version
fraîche. `chat`, `ui` et `collaboration` étaient protégés d'un écrasement ;
`files` ne l'était pas — et c'est le seul qui décide de la survie du travail.

---

## Le correctif, en deux moitiés indissociables

1. **`PUT /files/write` persiste le manifeste** — sans cela, rien n'écrit jamais
   le contenu édité dans l'archive.
2. **La fusion refuse un manifeste plus ancien** — sans cela, le `PUT ide-state`
   émis juste après écrase ce que la première vient d'écrire.

**Aucune des deux ne suffit seule.** Avec la première seule en production,
l'archive restait inchangée, et j'en ai conclu à tort qu'elle était inerte.
`ide-state-files-guard.spec.ts` échoue si l'une **ou** l'autre disparaît.

---

## Deux approches écartées, avec leur mesure

| Approche | Pourquoi non |
|---|---|
| **Liste blanche** — refuser `files` en provenance du client | **3 tests d'API tombent** : des chemins légitimes posent `files` par cette route (récupération d'échafaudage depuis le stockage persisté, indexation des manifestes de paquets). La règle doit être **temporelle**, pas structurelle. |
| **« Le serveur relit le pod »** à la réception de l'état IDE | Le client sauvegarde avec un **debounce de 1 500 ms** (`DEFAULT_SAVE_DEBOUNCE_MS`). Relire l'arbre du pod à chaque `PUT ide-state` ferait **~5 appels d'agent par seconde et par utilisateur actif**. Trop cher sur le trajet chaud pour un problème que la garde règle à coût nul. |

---

## L'amplification des écritures pendant une génération

`ActionRunner.runAction(data, isStreaming)` (`app/lib/runtime/action-runner.ts`)
est appelé **à chaque fragment du flux** pour une action de type `file`, et écrit
le contenu **partiel** courant. Les deux mémos anti-doublon
(`#lastWrittenContent`, `#lastWrittenFingerprint`) comparent le **contenu**, qui
change à chaque fragment : ils ne mordent pas.

⚠️ Le chiffre de **750 `PUT` pour 20 fichiers** date du **2026-08-15** et n'a
**pas** pu être remesuré le 31/08 — deux tentatives interrompues par un
« Service unavailable » avant la moindre écriture (`BUG-AGENT-008`). **Ne pas
dimensionner une décision dessus sans une remesure aboutie.**

C'est pourquoi la persistance du manifeste est branchée **hors flux seulement** :
le client marque ses écritures de flux (`x-vc-write-origin: stream`), et l'agent
rafraîchit l'archive en une fois à la fermeture de l'artefact.
