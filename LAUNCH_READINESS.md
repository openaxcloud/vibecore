# LAUNCH_READINESS — audit mise en prod

Verdicts **réels** par panneau, établis en exerçant chaque panneau sur la prod
(`app.e-code.ai` / `api.e-code.ai`), pas en lisant le rendu.

**États** (règle projet) : 📤 Dispatché · 💻 Codé · ✅ Testé live.
Un point n'est « fait » QUE quand ✅ Testé live est coché.

---

## CLUSTER B — Terminal, Packages, Git, Secrets, Object Storage, Ports

**Date** : 2026-08-06
**Méthode** : compte JETABLE + projet neuf créés sur la prod, puis exercice réel
de chaque panneau (commandes shell réelles, install npm réel, objets GCS réels,
secrets réels, port réel), à l'écran ET par appels HTTP.

**Environnement de test**
- Compte jetable : `qa-clusterb-1786026498@example.com` (supprimé en fin d'audit)
- Org : `cmshm2atq001q0n95ek2msaw3` · Projet : `cmshm2ued00c70nbvuhkipvpt`
- Workspace : `cmshm3a5d00d40n8r43jj8caw` → pod `workspace-cmshm3a5d00d40n8r43jj8caw` (ns `workspaces`, RUNNING)
- Runtime : Node **v24.19.0**, npm **11.17.0**, `pwd=/workspace`, `whoami=node`

### Matrice cluster B

| # | Panneau | Verdict | Preuve réelle |
|---|---------|---------|---------------|
| B1 | **Terminal** | ✅ | `ls -la /workspace`, `npm -v`→`11.17.0`, `node -v`→`v24.19.0`, `echo`, script multi-étapes (`for` + `pwd` + `whoami` + `exit 3`) → **exitCode 3 propagé**. Liste process réelle (`npm run dev … --port 5173`, pid 55). Kill process → **HTTP 204**, liste vide ensuite. |
| B2 | **Packages** | ❌ → 💻 corrigé | Install `lodash` depuis l'UI réelle : POST → **HTTP 200**, mais **rien installé** (`package.json` inchangé, `node_modules/lodash` absent). Run enregistré : `exitCode 1, status failed, "Runtime request failed"`. Appel direct API → **502 `WORKSPACE_AGENT_REQUEST_FAILED`**. → **BUG-IDE-001** |
| B3 | **Git** | ⚠️ | Dépôt réel : branche `main`, commit `7871bd7 chore: initial scaffold`, `branches:["main"]`, `ahead/behind 0`. MAIS git lit le **project storage**, pas le FS du pod : fichiers créés dans le runtime (terminal/npm, ex. `package-lock.json`, `audit-new.txt`) n'apparaissent jamais dans `git status`. Sauvegarde éditeur en conflit → perdue silencieusement. → **BUG-IDE-004** |
| B4 | **Secrets** | ✅ | Create → `{ok:true}` 200 ; list → clé visible ; reveal (avec `&confirm=1`, garde volontaire) → valeur **exacte** `s3cr3t-value-42` ; lecture **depuis le runtime** après restart → `SECRET=[s3cr3t-value-42]` ; delete → 200, liste vide. |
| B5 | **Object Storage** | ✅ | Bucket créé `vc-cmshm2ued00c70nbvuhkipvpt` (EU) ; upload via URL signée GCS → **200** ; list → `{key:"audit/clusterb.txt", size:33, etag:"COCvhZ6kjJYDEAE="}` ; download → contenu **identique** ; delete → `{deleted:true,count:1}`, liste vide. |
| B6 | **Ports** | ❌ → 💻 corrigé | Runtime expose bien `:5173` avec URL, et l'URL **sert la vraie app** (`<title>qa-clusterb</title>`, `id="root"`, `main.tsx`, HTTP 200 en public ET via proxy authentifié). Mais le **panneau Ports affiche « No ports detected yet »** — web, tablette et mobile. La barre de statut, elle, affiche `5173`. → **BUG-IDE-003** |

**Score cluster B : 3 ✅ · 1 ⚠️ · 2 ❌** (les 2 ❌ et 1 sous-bug corrigés, PR ouverte, non mergée).

### Responsive / thème

| Format | Overflow horizontal | Rendu |
|--------|--------------------|-------|
| Web 1280×900 | aucun | 3 colonnes complètes, tous panneaux lisibles |
| Tablette 768×1024 | aucun (`scrollWidth=768`) | garde la mise en page 3 colonnes ; colonnes très étroites, titres tronqués (`p…`, `Update…`) — lisible mais serré |
| Mobile 375×812 | aucun (`scrollWidth=375`) | panneau unique plein écran + barre mobile gelée (IMG_9149) — propre |

**Thème** : le sombre rend correctement partout. Le **clair s'applique au dashboard / user area** mais **pas au workbench IDE**, qui reste sombre (les 6 panneaux du cluster B vivent dans le workbench). Conforme à l'héritage dark-only de l'IDE — noté comme observation, pas comme bug.

---

## Bugs

### BUG-IDE-001 — P1 — Packages : l'install vise le mauvais workspace → 502 silencieux
**État** : 💻 Codé (PR, non mergée) · ✅ reproduit live

`POST /projects/:projectId/packages/install` appelait
`authorizeRuntimeWorkspace(request, projectId, …)`. Passé un **projectId**, ce
résolveur retombe sur l'id déterministe par utilisateur
`ws-<sha256(projectId:userId)[:16]>` — un pod qui n'existe pas dès que le
workspace actif du projet est un autre enregistrement (workspace créé
explicitement via l'API publique `POST /projects/:id/workspaces`, ou sélectionné
dans le sélecteur de workspace du panneau). L'agent est alors injoignable → 502.

Incohérence interne qui confirme le défaut : dans le même bloc d'action, *audit*
et *outdated* passent bien par `runTerminalCommand(request, workspaceId, …)`
avec le workspace résolu ; seul *install* omettait le workspace.

**Preuve** — panneau résolu sur `cmshm3a5d…` (`primaryWorkspaceId` =
`activeWorkspaceId` = ce même id, un seul workspace en base, pod RUNNING), mais
l'install ciblait `ws-dcc7ee0014fa4679` :
```
UI → POST /api/projects/…/ide-panel/packages   → HTTP 200 {"ok":true}
API → POST /projects/…/packages/install        → HTTP 502 WORKSPACE_AGENT_REQUEST_FAILED
runtime → grep -c lodash package.json          → 0
runtime → ls node_modules/lodash               → No such file or directory
run enregistré → exitCode 1 / failed / "Runtime request failed"
```

**Correctif** — `workspaceId` optionnel dans `packagesInstallSchema` ; la route
résout `body.workspaceId ?? projectId` **et** rejette (403
`WORKSPACE_PROJECT_MISMATCH`) un workspace qui n'appartient pas au projet du
chemin ; le BFF transmet le workspace déjà résolu par le panneau.
Tests : install ciblant un workspace nommé + rejet cross-projet.

### BUG-IDE-003 — P1 — Ports : le panneau ne liste jamais aucun port
**État** : 💻 Codé (PR, non mergée) · ✅ reproduit live

`GET /api/runtime/workspaces/:id/ports` répond un **tableau nu**. Le loader du
panneau faisait `{...(runtimePorts as any)}`, transformant `[{port:5173,…}]` en
`{0:{port:5173,…}}`. Côté UI, `runtimePortsFromPayload` accepte un tableau ou
`.ports` — aucun des deux → toujours `[]`. Le fallback d'erreur du loader
(`{ports: []}`) montre que la forme attendue était bien `{ports: […]}`.

**Preuve** — port réellement ouvert au moment de la capture :
```
runtime  → [{"port":5173,"ready":true,"url":"https://…-5173.preview.e-code.ai/"}]
URL      → HTTP 200, <title>qa-clusterb</title>, id="root", main.tsx
panneau  → data keys = ['0','portsState','workspaces','selectedWorkspaceId','workspaceId']
UI       → « No ports detected yet. Start your app (it must listen on a port) and refresh. »
```
Le panneau **Terminal** reçoit `runtimePorts` correctement (tableau) — le défaut
est isolé au loader Ports.

**Correctif** — helper exporté `normalizeRuntimePorts()` qui aplatit les deux
formes sur la clé `ports`. 4 tests dont un qui verrouille explicitement la
non-régression de l'objet `{0: …}`.

### BUG-IDE-002 — P2 — Agent : `EEXIST` remonte en 500/502 opaque au lieu de 409
**État** : 💻 Codé (PR, non mergée) · ✅ reproduit live

`/files/create` écrit avec `flag: 'wx'`. `rethrowFsError` mappe `ENOENT`,
`EISDIR`, `ENOTDIR`, `ENOSPC`/`EDQUOT` — **mais pas `EEXIST`**. Créer un fichier
dont le nom existe déjà sortait donc en 500 non codé, que l'API réétiquette en
502 `WORKSPACE_AGENT_REQUEST_FAILED`, c'est-à-dire **le signal « pod mort »** :
« New file » sur un nom existant affiche « Internal server error », et le 502
déclenche à tort le fallback local-runtime en dev (le commentaire au-dessus du
mapping `ENOSPC` documente exactement ce piège).

**Preuve** :
```
POST /files (create) « audit-new.txt » 1ère fois → 204
POST /files (create) « audit-new.txt » 2e fois   → 502 WORKSPACE_AGENT_REQUEST_FAILED
logs API : "Workspace agent request failed: 500"
agent joint en direct dans le pod avec un token valide → /files/write 200 (agent sain)
```

**Correctif** — `EEXIST` → **409 `File already exists`**. Test : 2e create → 409
+ le contenu d'origine survit au create rejeté.

### BUG-IDE-004 — P1 — Éditeur : conflit de sauvegarde avalé silencieusement
**État** : 💻 Codé (PR, non mergée) · ✅ **prouvé live sur pod prod réel**

Quand le fichier a changé côté serveur depuis son ouverture, la sauvegarde est
refusée — protection légitime — **mais l'échec ne sortait que dans la console**.
L'onglet restait marqué sale (`●`) sans message, sans bandeau, sans proposition
de recharger/écraser/fusionner. L'édition n'était persistée **nulle part** (ni
project storage, ni ide-state, ni runtime) et se perdait à la fermeture.

**Preuve du défaut (constat initial)** :
```
console : Autosave failed for /home/project/README.md
          Error: Remote file changed since it was loaded: /home/project/README.md
onglet  : « README.md● » (sale) après Save bouton, Ctrl+S et Cmd+S
export project storage → README.md == '# qa-clusterb\n'  (édition absente)
GET /api/projects/…/ide-state → ne contient pas l'édition
runtime  → README.md == '# qa-clusterb\n'                (édition absente)
```
Déclencheur réaliste : le reseed/reconcile qui réaligne le runtime sur le
project storage réécrit des fichiers que l'utilisateur peut avoir ouverts.

**Correctif** — trois couches :

1. **Erreur typée** `RemoteFileConflictError` portant `remoteContent`,
   `localContent` et `baselineContent`. Le message reste byte-identique (des
   appelants et specs le matchent), mais l'UI dispose enfin des trois versions.
   Le throw se produit **avant** `writeFile` : le tampon n'est jamais touché.
2. **Store de conflit** + `saveFileWithConflictPrompt()` qui renvoie
   `'saved' | 'conflict'` au lieu de rejeter, et deux résolutions :
   `resolveFileConflictWithLocal` (écrase) / `resolveFileConflictWithRemote`
   (adopte le disque sans réécrire). Un conflit dont les deux versions sont
   byte-identiques est résolu **sans** ouvrir de dialogue (diff vide inutile).
3. **Dialogue** non fermable au backdrop, avec **View diff · Reload from disk ·
   Keep my version · Keep editing** — « Keep editing » sort explicitement en
   laissant le fichier sale et l'édition en mémoire.

Tous les points de sauvegarde y passent : éditeur projet, onglet sale,
**autosave**, Workbench et le revert du DiffView.

**Preuve du correctif — LIVE contre un vrai pod prod** (`ws-2e1436ecf1bd10b8`,
`api.e-code.ai`, aucun mock sous le store) :
```
✓ raises a typed conflict carrying every version, and writes nothing   1471ms
✓ "Keep my version" writes the unsaved buffer to the real pod          1996ms
✓ "Reload from disk" adopts the pod version without writing back        816ms
→ RemoteFileConflictError { remoteContent:'the version on disk\n',
                            localContent:'discarded edit\n',
                            baselineContent:'baseline line\n' }
→ après conflit, le pod contient toujours 'written by the agent\n' (rien écrasé)
→ « Keep my version » → le pod contient 'my precious edit\n' (édition retrouvée)
```
Plus 7 tests sur le **vrai composant** (rendu + clics réels) : les 3 issues sont
présentes, le diff affiche les deux versions, chaque bouton pilote la bonne
action, et « Keep editing » ne déclenche **aucune** résolution.

⚠️ La preuve navigateur bout-en-bout n'a pas pu être faite : la machine était
au-dessus de `kern.maxfiles` (38 221 / 30 720 fd ouverts) à cause d'un serveur
de dev d'une autre session, et un second Vite refusait de démarrer (`ENFILE`).
La preuve ci-dessus attaque donc le vrai backend prod via le store réel, et le
dialogue réel est testé au niveau composant.

### BUG-IDE-005 — P3 — Packages : l'action renvoie `{ok:true}` même quand le run échoue
**État** : 💻 Codé (PR, non mergée) · ✅ défaut reproduit live sur prod

Le bloc `packages` de l'action retombait sur le `return json({ ok: true })`
commun quel que soit `run.exitCode`. L'échec n'était visible que dans la liste
« Install & runtime checks » de la sidebar, c'est-à-dire **sous la ligne de
flottaison** — d'où l'impression de succès observée en B2.

**Preuve du défaut (prod, code actuel)** — install d'un paquet inexistant :
```
POST /api/projects/…/ide-panel/packages → HTTP 200 {"ok":true}
run enregistré → script  : npm install @vibecore/definitely-not-a-real-package-9f3a
                 exitCode: 1
                 status  : failed
                 output  : npm error 404 … tarball, folder, http url, or git url.
```

**Correctif** — helper exporté `describePackagesRunOutcome()` : succès → 200 ;
échec → **422** (requête valide, commande exécutée, commande échouée) avec un
`error` porteur du script, du code de sortie et de la fin de la sortie npm — que
le submit générique du panneau affiche déjà **inline**. 5 tests, dont un ancré
sur la sortie npm **réellement capturée en prod** ci-dessus.

### Observations (pas des bugs)

- **Quota workspaces** : le plan gratuit autorise **1 workspace actif** ; un 2ᵉ
  projet répond `429 QUOTA_EXCEEDED`. Comportement voulu, mais l'IDE l'affiche
  seulement comme « Restart workspace » + `Problems 1`, sans dire que la cause
  est le quota ni qu'il faut arrêter l'autre workspace.
- **Secrets & redémarrage** : un secret créé n'est injecté dans le pod qu'après
  redémarrage du workspace (env figé dans le spec du pod). Vérifié : avant
  restart `QA_CLUSTERB_SECRET=[]`, après restart `[s3cr3t-value-42]`. Le
  panneau Secrets ne le signale pas (le panneau SSH, lui, le documente).
- **Reveal d'un secret** exige `&confirm=1` — garde volontaire, pas un défaut.
- **Frontière runtime ↔ project storage** : voir l'analyse dédiée ci-dessous.

---

## Écart Git ↔ FS du pod — analyse et recommandation

**Question posée** : corrigeable proprement, ou décision produit ?
**Réponse : décision produit.** Ce n'est pas un bug local, c'est une
architecture à deux dépôts qu'aucun correctif ponctuel ne réconcilie.

### Ce qui existe réellement aujourd'hui — deux dépôts disjoints

| | Dépôt A — panneau Git | Dépôt B — push/pull SSH |
|---|---|---|
| Emplacement | `storageRoot()/<projectId>/.git` (pod **API**, partage Filestore/NFS) | `/workspace/.git` (**PVC du pod** workspace) |
| Créé par | `GitCliProvider.ensureRepository` (`services/api/src/project-storage.ts`) | `git init -q` dans `GIT_SSH_PRELUDE` (`…ide-panel.$panel.ts`) |
| Alimente | status, commits, branches, diff, stashes, graph, cherry-pick, conflits | `fetch` / `push` / `pull` vers GitHub & co. |
| Contenu commité | `listProjectFilesIncludingIdeState(...)` = project storage | l'arbre réel du pod (`git add -A`) |

Les deux ne partagent **aucune** histoire, aucun objet, aucun index.

**Preuve live** (projet QA `cmshp9sy400uh0n8r9xxfru8s`, même instant) :
```
pod /workspace : NO_GIT
                 fatal: not a git repository …
                 fichiers réels : conflict.txt, package.json
panneau Git    : branch main · commits ['chore: initial scaffold'] · changedFiles []
```
Le panneau affiche donc une branche et un commit d'un dépôt **que le pod ne
possède même pas**, pendant que les fichiers réellement présents dans le pod
n'apparaissent nulle part dans `git status`.

Conséquences concrètes : ce que produit le terminal ou `npm` (lockfiles, fichiers
générés, sortie de build) n'entre jamais dans l'historique du panneau ; et le
dépôt que l'on **pousse** n'est pas celui dont on lit l'historique.

### Options

| | Approche | Coût | Risque |
|---|---|---|---|
| **A** | Synchroniser pod → project storage avant chaque opération git | lecture d'arbre + contenus à chaque `status` (exclusions `node_modules`, `.vite`, `dist` obligatoires) ; latence de plusieurs secondes sur une opération aujourd'hui instantanée | course pod↔storage pendant un run d'agent ; `status` devient coûteux alors qu'il est poll |
| **B** | Déplacer git **dans le pod** (le dépôt de vérité = le PVC) | réécriture de tout `GitCliProvider` en commandes agent ; l'historique migre sur le PVC ; déploiements/exports/snapshots lisent encore le project storage et devraient suivre | migration de données (historiques existants), git indisponible pod éteint, PVC à sauvegarder |
| **C** | Assumer la frontière et la rendre explicite dans l'UI | faible | ne referme pas l'écart de parité Replit |

### Recommandation

**B est la bonne cible** — c'est le modèle Replit, et c'est la seule option qui
supprime la classe de bugs au lieu de la déplacer : un seul dépôt, sur le
système de fichiers que l'utilisateur voit, celui-là même qu'on pousse.
Le chemin SSH prouve déjà que git tourne correctement dans le pod.

Mais c'est un **chantier**, pas un correctif : ~15 routes git, la migration des
historiques existants, et l'alignement de Publish / export / snapshots qui lisent
encore le project storage. À planifier comme un lot dédié, avec une décision
explicite sur le dépôt de vérité.

**En attendant, faire C** (petit, honnête, immédiat) : nommer le périmètre dans
le panneau Git (« fichiers du projet », pas « espace de travail »), et signaler
que ce qui est créé dans le terminal n'y figure pas tant qu'il n'est pas
synchronisé. **Ne pas faire A** : cela paie le coût d'une synchronisation à
chaque `status` tout en laissant deux dépôts en vie.

---

## Suivi

| Bug | P | 📤 Dispatché | 💻 Codé | ✅ Testé live |
|-----|---|--------------|---------|---------------|
| BUG-IDE-001 Packages mauvais workspace | P1 | ✅ | ✅ (PR #119, non mergée) | ✅ reproduit + tests verts |
| BUG-IDE-003 Ports jamais listés | P1 | ✅ | ✅ (PR #119, non mergée) | ✅ reproduit + tests verts |
| BUG-IDE-002 EEXIST → 409 | P2 | ✅ | ✅ (PR #119, non mergée) | ✅ reproduit + tests verts |
| BUG-IDE-004 Conflit de save avalé | P1 | ✅ | ✅ (PR, non mergée) | ✅ **prouvé live sur pod prod** (3/3) + 7 tests composant |
| BUG-IDE-005 `ok:true` sur run échoué | P3 | ✅ | ✅ (PR, non mergée) | ✅ défaut reproduit live prod + 5 tests |
| Écart Git ↔ FS du pod | — | ✅ | — | ✅ deux dépôts disjoints prouvés live → **décision produit** |

⚠️ **Aucun déploiement prod effectué.** Les correctifs touchent `services/api` et
`services/workspace-agent` (tiers runtime) : la mise en prod doit être validée
explicitement avant `deploy-main.yml`.
