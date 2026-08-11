# BUG-RUNTIME-DIVERGENCE — diagnostic approfondi, correctif proposé, plan de preuve

**Statut : CONCEPTION. Aucun code de correctif dans ce commit.** Lot sensible :
le signal décrit ici décide d'un `wipe + reseed` du pod de l'utilisateur, donc
d'une **perte possible d'éditions runtime**. Il ne doit pas être livré sans
repro live et validation expert.

---

## 1. Symptôme

Le contenu servi par le runtime diverge du contenu persisté (`src/main.tsx`,
`src/styles.css` historiquement) : l'IDE rouvre un projet et montre un arbre
périmé, ou au contraire un reseed écrase une édition runtime valide.

## 2. Ce qui est DÉJÀ corrigé sur `main` (le suivi disait le contraire)

La fiche annonçait la cause (a) comme non codée — « le warm reattach laisse
`storageNewerThanSeed=undefined` → traité *pas plus récent* ». C'est faux
aujourd'hui. `app/lib/runtime/ProjectWorkspaceProvider.tsx` câble le signal :

```ts
const currentRevision = await fetchPersistedProjectRevision(projectId);
// …
storageNewerThanSeed:
  seededRevision !== undefined && currentRevision !== undefined
    ? currentRevision !== seededRevision
    : undefined,
```

et `shouldReattachWarmWorkspace` reseed dès que le signal vaut `true`.
La mécanique de fraîcheur existe donc, et elle est correcte.

## 3. Le défaut réel : le signal observe la MAUVAISE ressource

`fetchPersistedProjectRevision()` lit l'ETag (ou `ideState.version`) de
**`GET /api/projects/:id/ide-state`**.

Or `ideState.version` n'est incrémentée que par `upsertProjectIdeState`, appelée
uniquement par la route **PUT `/projects/:id/ide-state`**
(`services/api/src/app.ts:20802`). **Aucune écriture de FICHIER ne la touche.**

Conséquence, chemin complet du bug :

1. L'utilisateur édite des fichiers depuis un autre appareil / onglet, ou
   l'Agent persiste des fichiers, via
   `POST /projects/:id/files/import/zip` (le back-sync
   `#persistRuntimeFilesToProjectStorage`, `app/lib/stores/workbench.ts:3437`).
2. Le **storage** change. `ideState.version` ne bouge pas.
3. Au reopen, `currentRevision === seededRevision` → `storageNewerThanSeed =
   false` → **reattach chaud** sur le pod tiède.
4. Le pod sert son ancien arbre. **C'est le symptôme d'origine.**

Le signal actuel n'attrape donc que le cas « une autre session a écrit de
l'ide-state » — un proxy accidentel, vrai seulement quand l'écriture de fichiers
se trouve accompagnée d'une écriture d'ide-state.

Vérifié : aucun `filesRevision` / `filesUpdatedAt` n'existe dans le dépôt.

## 4. Causes (b) et (c) — inchangées, toujours ouvertes

- **(b)** les écritures de manifest-repair / doctor vont dans le pod mais ne
  sont pas re-persistées dans le storage au même instant → le storage est en
  retard sur le runtime.
- **(c)** le back-sync runtime→storage court sur un autre trigger et peut
  retarder → un cold reseed ultérieur, **autoritaire depuis un storage périmé**,
  écrase le bon contenu runtime.

(b) et (c) sont des problèmes de **convergence**, pas de détection : même avec
un signal parfait, un reseed aveugle depuis un storage en retard détruit des
éditions. D'où l'étape 3 du correctif ci-dessous.

---

## 5. Correctif proposé

### 5.1 Un vrai signal de fraîcheur des FICHIERS

Dériver une révision des **métadonnées de fichiers déjà disponibles** — pas de
migration de schéma :

```
filesRevision = sha256( join("\n", sorted( `${path}:${updatedAt}:${sizeBytes}` )) )
```

`publicFiles()` (`services/api/src/app.ts:6449`) expose déjà exactement
`{ path, updatedAt, sizeBytes }`, et `listProjectFilesIncludingIdeState()`
fournit la liste. La révision change **si et seulement si** l'ensemble des
fichiers change.

Exposition : `GET /projects/:projectId/files/revision` → `{ revision }`, avec
`ETag`. Route dédiée et bon marché, pour ne pas rapatrier tout le contenu au
seul reopen.

Pourquoi pas les alternatives :

- **`Project.updatedAt`** — bouge pour des raisons sans rapport (rename,
  settings) → faux positifs, donc des wipes inutiles ; et rien ne garantit
  qu'il bouge sur une écriture de storage.
- **Colonne `filesRevision` + migration** — plus rapide à lire, mais introduit
  un état à maintenir cohérent sur CHAQUE chemin d'écriture (import zip, remix,
  seed de template, purge…). Un chemin oublié = un faux « pas plus récent »,
  c'est-à-dire exactement le bug d'aujourd'hui. La dérivation est sans état et
  ne peut pas se désynchroniser.
- **Hash du CONTENU** — le plus juste, mais lit tous les octets à chaque
  reopen ; `updatedAt`+`sizeBytes` suffit à détecter toute écriture réelle.

### 5.2 Câblage client

Dans `ProjectWorkspaceProvider.tsx`, remplacer `fetchPersistedProjectRevision`
par `fetchPersistedFilesRevision`, et mémoriser la révision **au moment du
seed** (`seededWorkspaceSessions`), afin que la comparaison porte sur la même
grandeur des deux côtés.

Conserver le comportement `undefined` → `undefined` (et non `false`) : signal
inconnu = on ne prétend rien, le marqueur de session couvre déjà le remount.

### 5.3 Réconciliation par content-compare (couvre (b) et (c))

Sur divergence détectée, **ne pas** faire un wipe+reseed aveugle. Comparer et
n'écrire que les fichiers réellement différents, en refusant d'écraser une
édition runtime par un storage plus ancien (comparer les `updatedAt` des deux
côtés, fichier par fichier). `reseedWorkspacePreservingOnFailure()` fournit déjà
la garantie « ne jamais laisser le pod vidé-mais-non-reseedé » ; il manque la
garantie « ne jamais écraser plus récent par plus ancien ».

---

## 6. Plan de preuve

### 6.1 Unitaire (sans compte, faisable immédiatement)

1. `filesRevision` : même liste → même révision ; un `updatedAt` qui change, ou
   un `sizeBytes`, ou un fichier ajouté/retiré → révision différente. Ordre
   d'entrée indifférent (tri).
2. **Rouge/vert de régression** : un test qui simule « écriture de fichiers
   SANS écriture d'ide-state » et affirme `storageNewerThanSeed === true`.
   Avec le signal actuel (ide-state) il doit **échouer** ; avec le signal
   fichiers il doit passer. C'est ce test qui prouve le bug, pas seulement le
   correctif.
3. Content-compare : storage plus ANCIEN que le runtime → aucun écrasement.

### 6.2 Live (nécessite une session ; script fourni, NON exécuté)

`scripts/audit-env/repro-runtime-divergence.mjs` — voir en-tête du script pour
le mode d'emploi. Séquence :

1. Ouvrir le projet dans l'IDE (pod chaud, port vivant, seed effectué).
2. Écrire un fichier **hors bande** via l'API (`files/import/zip`), sans jamais
   toucher `/ide-state` — c'est le cœur de la repro.
3. Relire `GET /ide-state` : l'ETag est **inchangé** (preuve directe du défaut).
4. Rouvrir l'IDE → **AVANT** correctif : reattach chaud, l'ancien contenu est
   servi. **APRÈS** : divergence détectée, réconciliation, contenu à jour.
5. Symétrie anti-destruction : éditer dans le runtime, laisser le storage en
   retard, rouvrir → l'édition runtime **survit**.

À rejouer sur le **cluster de test audit**, pas en production : la repro écrit
des fichiers et provoque des reseeds.

---

## 7. Risques

- Un faux **positif** (révision qui bouge sans raison) coûte un reseed inutile :
  lent, mais non destructeur grâce à `reseedWorkspacePreservingOnFailure`.
- Un faux **négatif** est le bug actuel : contenu périmé servi silencieusement.
- Le content-compare est la seule partie qui touche à la **destruction de
  données** ; c'est là que la revue expert doit porter en priorité.
