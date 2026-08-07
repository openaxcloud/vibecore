# LAUNCH_READINESS — audit mise en prod

Verdicts de mise en production, panneau par panneau, établis **en réel sur `app.e-code.ai`**
(compte jetable + projet neuf, supprimés après). Un panneau ne passe ✅ que si la fonction a
été **exercée** et le résultat **observé**, pas seulement affiché.

Légende : ✅ marche en réel · ⚠️ marche partiellement / à décider · ❌ cassé.

---

## CLUSTER D — Problems, Debugger, History/Snapshots, Skills, Workflows, Agent Studio, Paramètres projet

**Date** : 2026-08-06 · **Environnement** : `app.e-code.ai` (prod) · **Compte** : jetable
`qa-clusterd-****@qa.e-code.ai`, org + projet « QA Cluster D » créés puis supprimés ·
**Runtime** : `remote-kubernetes`, workspace `ws-9ea846f331d5b334` · **Formats** : web 1280 /
tablette 768 / mobile 390, clair + sombre.

### Matrice

| Panneau | Verdict | Ce qui a été exercé | Preuve |
|---|---|---|---|
| **Problems** | ⚠️ | Erreur réelle introduite puis corrigée | L'erreur **apparaît** (8 s) ; elle **ne disparaît jamais** après correction → BUG-IDE-003 ; pas de lien vers la source → BUG-IDE-004 ; **aucune erreur TS/lint** n'y arrive → GAP-IDE-A |
| **Debugger** | ⚠️ | Config de lancement, breakpoint conditionnel, watch, démarrage de session | Config/breakpoint/watch **persistent** ; le lancement **s'exécute vraiment** dans le runtime ; **impossible de s'arrêter sur un breakpoint ou d'inspecter** → GAP-IDE-B ; statut de session figé → BUG-IDE-005 |
| **History / Snapshots** | ✅ | Checkpoint → modification → restauration | Contenu de `src/App.tsx` **revenu**, `src/main.tsx` **supprimé puis restauré**, fichier parasite **retiré** ; checkpoint de sécurité auto « Before restore of … » |
| **History / Activity** | ❌ → corrigé | Ouverture du panneau | **Crash à chaque ouverture, en prod, depuis le 2026-07-05** → BUG-IDE-001 (P0) |
| **Skills** | ✅ | Activation d'une skill puis exécution agent | Le toggle **persiste** (API) **et atteint l'agent** : interrogé, l'agent a listé exactement les 5 skills activées, dont celle qu'on venait d'activer |
| **Agent Studio** | ⚠️ | Ouverture après activité agent réelle (édition de fichier appliquée) | Superviseur **lecture seule** ; ses 3 sources restent vides même après une édition agent réussie → GAP-IDE-C ; titre/état vide mal libellés → BUG-IDE-002 |
| **Workflows** | ✅ | Création d'un workflow puis exécution | `SUCCEEDED`, `exit 0`, 727 ms, **sortie réelle capturée** (`WORKFLOW_RAN_OK`, `sum 4`) ; le workflow intégré remonte aussi un vrai `failed` avec la stderr Vite |
| **Paramètres projet** (7 onglets) | ✅ | Project · Security · AI · Usage · Account · Memory · Preferences | Les 7 affichent des données réelles ; écriture **persistée** (description → API → survit au rechargement) |

### Responsive & thème — 60 mesures

| Série | Combinaisons | Débordement horizontal | Crash |
| Sombre (défaut) | 7 panneaux × web/tablette/mobile = 42 | **0 partout** | `Activity` sur les 6 formats |
| Clair (Preferences → Theme → Light) | 6 panneaux × web/tablette/mobile = 18 | **0 partout** | aucun |

`document.scrollWidth === clientWidth` sur les 60 mesures : la page ne scrolle **jamais**
horizontalement. Les éléments larges (barre d'onglets, en-tête sticky) scrollent dans leur
propre conteneur, ce qui est le comportement voulu. En clair : `data-theme="light"`,
`bg rgb(246, 248, 251)`, contraste et contrôles corrects sur les 3 formats.

`Activity` a crashé sur **les 6** combinaisons sombres — le crash est universel, pas un cas de
bord. BUG-IDE-002 (titre en minuscules) est également visible dans les deux thèmes.

Note thème : l'IDE **ignore `prefers-color-scheme`** ; le thème est une préférence **par projet**
(Paramètres → Preferences → Theme), par défaut sombre, et elle fonctionne. Choix produit, pas
un bug — mais un visiteur en thème clair système garde une IDE sombre jusqu'à ce qu'il trouve
le réglage.
Verdicts **réels** par panneau, établis en exerçant chaque panneau sur la prod
(`app.e-code.ai` / `api.e-code.ai`), pas en lisant le rendu.

**États** (règle projet) : 📤 Dispatché · 💻 Codé · ✅ Testé live.
Un point n'est « fait » QUE quand ✅ Testé live est coché.

---

## Cluster C — Database · Déploiements · Logs · Monitoring

**Date** : 2026-08-06 · **Compte QA** : `qa-clusterc-1786026525@e-code-qa.test` (supprimé en fin d'audit)
**Projets QA** : `cmshm3gni00400nai23ilaq9f` (static) · `cmshmmfum00d00nbvcbxcbbqu` (server) — supprimés en fin d'audit

### Matrice de verdicts

| Panneau | Verdict | Ce qui marche en réel | Ce qui bloque |
| --- | --- | --- | --- |
| **Database** | ⚠️ | Provisioning, DDL, CRUD, schéma, secret injecté — tout prouvé | La base est **injoignable depuis le runtime de l'app** (BUG-IDE-001, P0) |
| **Déploiements** | ⚠️ | Static + Server publiés, URL live, logs de build, rollback, scale-to-zero | App en erreur → **504 nginx brut** (BUG-DEPLOY-003, P0) ; statut menteur (BUG-DEPLOY-004) |
| **Logs** | ⚠️ | Logs de **build** réels et complets | Logs **runtime** toujours vides (BUG-IDE-002, P1) |
| **Monitoring** | ⚠️ | Événements projet réels (9 événements horodatés), fichiers suivis | Compteur déploiements toujours à 0 (BUG-IDE-004, P1) ; aucune métrique app (CPU/RAM/req) |

Responsive : **18/18 combinaisons propres** (Database · Logs · Déploiements × web 1440 / tablette 768 / mobile 390 × clair + sombre) — zéro débordement horizontal (`scrollWidth == innerWidth`), zéro bandeau d'erreur, sous-nav Deploy (Overview · Logs · Domains · Manage) présente aux 3 formats.

---

### Panneau Database — ⚠️

**Exercé** : provisioning, `CREATE TABLE`, `INSERT`, `SELECT`, `DELETE`, inspection de schéma, usage depuis le runtime.

| Étape | Preuve |
| --- | --- |
| Provisioning | `POST /projects/…/database/provision` → **HTTP 202**, cluster CNPG `shared-pg-0`, base `proj_cmshm3gni00400nai23ilaq9f` |
| Secret injecté | `GET /projects/…/secrets` → `DATABASE_URL` créé automatiquement (`shared-pg-0-pooler.project-databases.svc:5432`) |
| `CREATE TABLE` | **HTTP 200** — `qa_items (id serial pk, label text not null, created_at timestamptz)` |
| `INSERT` ×3 | **HTTP 200**, `rowCount: 3` |
| `SELECT` | **HTTP 200** — `[{id:1,label:"alpha"},{id:2,label:"beta"},{id:3,label:"gamma"}]` |
| `DELETE` | **HTTP 200**, `rowCount: 1` → relecture `[{id:1,"alpha"},{id:3,"gamma"}]` |
| Schéma | **HTTP 200** — 1 table, 3 colonnes typées (`integer` / `text` / `timestamp with time zone`) |
| Runtime → DB | ❌ `DATABASE_URL` présent dans le pod, DNS résolu (`10.30.6.28`), **TCP `TIMEOUT`** |

> **BUG-IDE-001 — P0 — la base intégrée est injoignable depuis le runtime de l'app.**
> 📤 · 💻 · ⬜ *(correctif codé, non déployé)*
> La NetworkPolicy `workspace-controlled-egress` (ns `workspaces`) n'autorise en sortie que
> le DNS (53) et le TCP 443 vers Internet, avec `10.0.0.0/8` **explicitement exclu**. Le pooler
> Postgres est en `10.30.6.28:5432` → le connect part dans le vide. Asymétrie prouvée : la
> policy `server-deploy-egress`, elle, autorise bien `5432 → project-databases`.
> **Conséquence utilisateur** : le panneau Database fonctionne (il interroge Postgres depuis le
> pod API), mais le code de l'utilisateur **ne peut pas ouvrir de socket** vers sa propre base
> pendant le développement — alors que le même code marchera une fois déployé.
> Preuve : `HOST=shared-pg-0-pooler.project-databases.svc PORT=5432 / DNS=10.30.6.28 / TCP=TIMEOUT`.
> **Correctif** : règle d'egress `5432 → project-databases` ajoutée à `workspace-controlled-egress`
> (`infra/helm/workspaces-runtime/templates/networkpolicy.yaml` + manifeste brut équivalent).

> **BUG-IDE-003 — P2 — la page « Database » de la console n'est pas de la gestion de base.**
> 📤 · ⬜ · ⬜
> `/projects/:id/database` n'expose que le *Point-in-time restore*, et affiche pour un plan
> gratuit « Point-in-time restore is not available — Upgrade ». Aucun accès schéma / requête /
> table depuis la console : ces capacités n'existent que dans le volet Database de l'IDE.
> Un utilisateur qui cherche « ma base » depuis la console tombe sur un paywall.

---

### Panneau Déploiements — ⚠️

#### Statique — ✅
| Détection | `GET …/deployments/detect` → `{mode:"static", reason:"Static site (index.html, no server)."}` |
| Publication | `POST …/deployments` → **HTTP 202** → **READY** |
| URL live | `https://s-cmshmkrit000z0nbyv9qr7lbz.preview.e-code.ai/` → **HTTP 200**, `text/html`, 182 o, contenu servi (`QA-CLUSTER-C-STATIC-OK`) |
| Logs de build | 19 lignes réelles : sandbox isolée `.vibecore-deploy-<id>`, `npm install`, `npm run build`, artefact, snapshot |
| Rollback v2 → v1 | **HTTP 201**, `rolledBackFromId` renseigné, l'URL sert de nouveau `QA-CLUSTER-C-STATIC-OK` |

#### Server (autoscale) — ⚠️
| Détection | `{mode:"server", framework:"node", reason:"Generic Node app (start script / entry file)."}` |
| Build image | Cloud Build `168fdabf-…` **SUCCESS** en 26,6 s → image 163 Mo, digest `sha256:661a97db…` |
| URL live | `https://d-cmshmnauu000e0naryj4v46d6.preview.e-code.ai/` → **HTTP 200** + `/healthz` **200** |
| Objets k8s | `deployment.apps/app-cmshmnauu…` **1/1**, `service/app-cmshmnauu…` ClusterIP |
| Scale-to-zero | replicas → 0, puis 1ʳᵉ requête → **HTTP 200 en 17,6 s** (réveil réel, aucune erreur) |
| Rollback par digest | **HTTP 201** → l'URL sert de nouveau `QA-CLUSTER-C-SERVER-V1` (redéploiement par digest, pas une copie d'URL) |
| Déploiement cassé | ✅ zéro-downtime : l'ancien ReplicaSet continue de servir (200) tant que le nouveau n'est pas prêt |
| **App en erreur** | ❌ **`504 Gateway Time-out` nginx brut après 180 s** |

> **BUG-DEPLOY-003 — P0 — une app serveur qui ne démarre pas rend un 504 nginx brut.**
> 📤 · 💻 · ⬜ *(correctif codé + testé unitairement, non déployé)*
> Suite directe de BUG-DEPLOY-002 (clos le 15/07) : la page propre existe bien, mais elle
> **n'atteint jamais le navigateur**. Le proxy attendait le réveil jusqu'à 90 s (`AbortSignal.timeout(90_000)`)
> plus 30 s de fetch amont, alors que l'ingress `*.preview.e-code.ai` n'avait **aucune**
> annotation `proxy-read-timeout` (défaut nginx). nginx coupe et sert son propre 504 ; les
> logs du proxy montrent des requêtes entrantes espacées de 60 s sur des pods différents
> (retry `proxy_next_upstream`) et **aucune** requête terminée.
> Preuve : pod en `CrashLoopBackOff` → `curl` = `HTTP 504 time=180,34 s`, corps = `<h1>504 Gateway Time-out</h1> nginx`.
> **Correctif** : budget d'attente borné (`SERVER_DEPLOY_WAKE_WAIT_MS`, défaut 12 s) partagé
> avec le retry post-réveil via une échéance absolue ; un `AbortError` ne court-circuite plus
> vers un 504 JSON mais emprunte le même chemin « page d'attente » ; `proxy-read-timeout: 75`
> posé explicitement sur l'ingress preview pour que nginx survive toujours au proxy.
> Le réveil n'est pas perdu : le manager scale à 1 **avant** de sonder la readiness, donc le
> boot continue pendant que la page (auto-refresh 2 s) rattrape l'app.
> 2 tests de non-régression ajoutés (`services/preview-proxy/src/app.spec.ts`) — **54/54 verts**.

> **BUG-DEPLOY-004 — P1 — le statut reste READY alors que l'app est morte.**
> 📤 · ⬜ · ⬜ *(non corrigé — voir ci-dessous)*
> Avec le pod en `CrashLoopBackOff` et l'URL injoignable, l'API répond encore
> `status: "READY"`, `serverDeploy.ready: true`, `readyReplicas: 1`. Le panneau annonce donc
> une app en ligne qui ne répond pas.
> **Non corrigé volontairement** : distinguer « endormie » (0 réplique, sain) de « plantée »
> (0 réplique, crash loop) demande d'exposer l'état des pods côté manager. Corriger à la
> serpe ferait passer en FAILED toute app en scale-to-zero — régression pire que le bug.
> À traiter comme un lot dédié.

> **BUG-DEPLOY-005 — P2 — les logs de déploiement ne sont pas dans l'ordre chronologique.**
> 📤 · 💻 · ⬜
> Le bloc de synthèse (« Queued… / Framework detected… / Deployment ready: … ») est horodaté
> au moment de la **persistance**, en fin de pipeline, alors qu'il décrit la mise en file.
> Résultat live : `Deployment ready:` à 14:42:44 listé **au-dessus** de `[install] up to date`
> à 14:42:43 — le panneau Logs s'ouvre sur le résultat et enterre le build en dessous.
> **Correctif** : bloc horodaté au `startedAt` du déploiement. Test ajouté (`deployments.spec.ts`).

> **BUG-DEPLOY-006 — P2 — framework et commande de build inventés pour un déploiement server.**
> 📤 · 💻 (partiel) · ⬜
> La ligne est créée avec les valeurs par défaut du chemin statique (`buildCommand: npm run build`,
> `outputDirectory: dist`) → l'heuristique `dist → vite` étiquette « vite » une app Node nue.
> Live : le panneau affichait `Framework detected: vite` pendant que le pipeline loggait, deux
> lignes plus bas, `detected node — build "(none)", start "node server.js"`.
> **Correctif** : le framework réellement détecté est persisté sur la ligne et utilisé dans les
> logs. `buildCommand` / `outputDirectory` restent affichés pour un server deploy alors qu'ils
> n'ont pas de sens — reste à traiter (cosmétique).

**Observation (pas un bug)** : chaque déploiement statique a une URL immuable `s-<id>` ; il
n'existe pas d'alias de production stable qui suivrait le dernier déploiement. Un rollback
change donc la ligne active, mais une URL v2 déjà partagée continue de servir v2. Conforme à
un modèle d'artefacts immuables, à confirmer comme choix produit.

---

### Panneau Logs — ⚠️

| Flux | Verdict | Preuve |
| --- | --- | --- |
| Build / déploiement | ✅ | 19 lignes réelles (statique), 16 (server) : install, build, image, apply, readiness |
| Runtime de l'app | ❌ | `GET …/logs/snapshot` → `{"logs":[]}` ; page `/projects/:id/logs` → « No runtime output captured yet. » alors que le workspace est **Running** avec un serveur en écoute |

> **BUG-IDE-002 — P1 — le flux de logs runtime est structurellement vide.**
> 📤 · ⬜ · ⬜ *(non corrigé — voir ci-dessous)*
> Le snapshot et le WebSocket lisent tous deux `manager /workspaces/:id/logs`, c'est-à-dire les
> logs du **conteneur** `workspace-agent`. Or l'agent bufferise la sortie des processus qu'il
> lance pour la streamer au client (terminal / commandes) et ne la réémet jamais sur sa propre
> sortie standard. `kubectl logs` sur le pod du workspace confirme : **vide**.
> Conséquence : le panneau titré « Live output from your running project » ne montre jamais la
> sortie de l'app. Aucune surface n'expose non plus les logs runtime d'un déploiement server
> (pas d'endpoint pod-logs côté manager).
> **Non corrigé volontairement** : le correctif propre est un tee de la sortie des processus
> managés vers un buffer exposé par l'agent (ou des pod-logs pour les déploiements) — un lot
> à part entière, pas une retouche.

---

### Panneau Monitoring — ⚠️

| Élément | Verdict | Preuve |
| Événements projet | ✅ | 9 événements réels horodatés (`deployment.create` ×2, `database.schema.inspect`, `database.query.readonly` ×5…) |
| Fichiers suivis | ✅ | 7 fichiers |
| Fenêtres 15 m / 1 h / 24 h + sparkline | ✅ | Rendus, filtrage des événements de routine actif |
| Compteur + frise des déploiements | ❌ | Toujours 0 / « No deployment recorded » |
| Métriques applicatives (CPU, RAM, requêtes, latence) | ❌ | Aucune |

> **BUG-IDE-004 — P1 — le Monitoring affiche 0 déploiement en permanence.**
> 📤 · 💻 · ⬜
> `ProjectMonitoringPanel` lit `data.deployments`, mais sa source (`GET /projects/:id/dashboard`)
> ne renvoie pas cette clé (`['project','workspace','files','git','recentActivity']`). Le
> composant retombe donc sur `[]` : métrique « Deployments » à 0 et frise vide, sur un projet
> qui avait **3 déploiements READY**.
> **Correctif** : `deployments` ajouté au payload dashboard (lecture seule, sans réconcile).

> **Écart de promesse (P2)** : l'entrée de panneau est libellée « App metrics » et décrite
> « Inspect runtime health, activity and metrics », alors que le panneau ne montre que de
> l'activité projet — aucune métrique applicative. Soit renommer, soit brancher de vraies
> métriques.

---

### Correctifs livrés (branche `fix/cluster-c-launch-readiness`, PR — **non mergée, non déployée**)

| Bug | Fichier | Test |
| BUG-IDE-001 | `infra/helm/workspaces-runtime/templates/networkpolicy.yaml`, `infra/kubernetes/workspaces-runtime/networkpolicies.yaml` | vérif live après déploiement (TCP 5432 depuis le pod workspace) |
| BUG-DEPLOY-003 | `services/preview-proxy/src/app.ts`, `infra/helm/platform/templates/ingress.yaml` | `app.spec.ts` — 2 tests ajoutés, 54/54 verts |
| BUG-DEPLOY-005 | `services/api/src/deployments.ts` | `deployments.spec.ts` — 1 test ajouté, 3/3 verts |
| BUG-DEPLOY-006 | `services/api/src/app.ts` | couvert par le typecheck + `api.spec.ts` 123/123 |
| BUG-IDE-004 | `services/api/src/app.ts` | `api.spec.ts` 123/123 verts |

Restent ouverts, volontairement non corrigés ici (lots dédiés) : **BUG-DEPLOY-004** (statut
menteur), **BUG-IDE-002** (logs runtime), **BUG-IDE-003** (page Database de la console).

### Hygiène

Compte QA, organisation, projets, base intégrée, workspaces et déploiements de test supprimés
en fin d'audit. Aucune donnée réelle touchée.

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

### BUG-IDE-001 — P0 — le panneau Activity crashe à chaque ouverture · **corrigé** (PR #120)
`ReferenceError: FilterChip is not defined`, rattrapé par la panel boundary → « The Activity
panel crashed ». En prod, pour tout le monde, depuis `dfeedd8b` (2026-07-05) : ce commit a
ajouté la rangée de chips de filtre sans ajouter l'import.

**Pourquoi la CI ne l'a pas vu** : `app/components/chat/BaseChat.tsx` porte `// @ts-nocheck`.
Ni `tsc` ni la CI ne peuvent voir un identifiant non défini dans ce fichier — qui contient
pourtant **la totalité des panneaux de l'IDE**. Retirer ce `@ts-nocheck` est hors périmètre de
cet audit mais reste le vrai correctif de fond.

### BUG-IDE-002 — P2 — des panneaux affichent leur identifiant brut · **corrigé** (PR #120)
`panelTitle()` n'avait pas d'entrée pour `skills`, `studio` ni `ports`, donc le repli `?? panel`
laissait fuiter l'id dans l'onglet, le titre et l'état vide : littéralement « studio » et
« No studio yet ». Visible sur desktop uniquement — le mobile lit déjà `ECODE_MOBILE_TAB_META`,
qui nomme correctement chaque panneau. Le correctif fait pointer `panelTitle()` sur cette même
table plutôt que d'entretenir une seconde liste qui redivergera.

### BUG-IDE-003 — P1 — Problems ne se vide jamais après correction · **corrigé** (PR #120)
`workspaceLogs` est un tampon circulaire en append-only et rien ne retirait une erreur de
transformation Vite **résolue**. Un fichier réparé conservait donc un compteur d'erreurs rouge
pour le reste de la session.

Preuve : `src/App.tsx` cassé depuis le shell du workspace → l'erreur apparaît en 8 s ; fichier
réparé → **la même erreur, au même horodatage (3:08:59 PM), toujours affichée 100 s plus tard**.
Seul un rechargement de page la fait partir.

Correctif : `buildRuntimeDiagnostics` retire les erreurs de build d'un module dès qu'un
`hmr update` / `page reload` ultérieur de ce module prouve qu'il se transforme à nouveau.
Balayage ordonné → recasser le fichier le re-signale ; une exception runtime n'est jamais
retirée (seules les erreurs de build nomment un module qui *peut* guérir).

### BUG-IDE-004 — P2 — pas de lien « aller à la ligne » sur les erreurs Vite · **corrigé** (PR #120)
Le motif de localisation ne reconnaissait que `fichier:ligne`, alors que Vite/babel écrivent
`fichier: <raison> (ligne:colonne)` — la classe d'erreur la plus fréquente ici. Chaque ligne
Problems concernée s'affichait sans lien alors que le message donnait fichier **et** position.

### BUG-IDE-005 — P2 — les sessions de debug restent « running » indéfiniment · **corrigé** (PR #120)
`start-session` écrit le statut une fois ; seul un arrêt explicite le réécrivait. Un lancement
qui se termine une seconde plus tard (normal pour un script, habituel pour un plantage)
continuait d'afficher « running » avec un bouton Stop actif. Le loader du Debugger récupère
déjà la liste des processus vivants du workspace : on réconcilie contre elle **en lecture**.
Sûr par défaut : une liste de processus illisible ne déclasse rien.

---

## Décisions à prendre (non corrigé — choix produit)

### GAP-IDE-A — Problems n'a **aucune** source TypeScript ni lint
Seules les lignes de log runtime/build sont remontées. Une vraie erreur de types
(`const broken: number = "definitely not a number"`, syntaxe valide) donne **0 problème** :
esbuild efface les types sans les vérifier et aucun `tsc`/ESLint ne tourne côté workspace.

Un utilisateur qui lit « Problems : 0 » sur du code qui ne compile pas est mal informé.
**À arbitrer** : brancher un `tsc --watch` / ESLint dans le workspace, ou renommer le panneau
pour ce qu'il fait réellement (diagnostics d'exécution).

### GAP-IDE-B — le Debugger ne peut pas s'arrêter sur un breakpoint
Ce qui marche vraiment : configurations de lancement, breakpoints (avec condition, hit count,
logpoint), expressions de watch — tout persiste — et « Start debugging » **exécute réellement**
la commande dans le workspace.

Ce qui ne peut pas marcher : aucun adaptateur DAP n'est branché. `callStack` et `variables` ne
sont assignés qu'à `[]` dans tout le code, et rien ne met jamais une session à `paused` ; les
boutons `continue / step over / step into / step out` sont donc **définitivement désactivés**,
et les expressions de watch ne sont jamais évaluées. L'UI est honnête sur la condition
(« Stepping is enabled when a debug adapter reports a paused frame ») mais cette condition est
inatteignable.

**À arbitrer** : brancher un adaptateur (node inspector / debugpy), ou retirer les affordances
de stepping et assumer « lanceur de processus + carnet de breakpoints ».

### GAP-IDE-C — Agent Studio est vide sur un projet sain
Le panneau agrège 3 flux : propositions de patch, événements d'auto-réparation, votes de
consensus. Après une édition agent **réussie et appliquée**, les trois restent vides — ils ne
se remplissent que sur les chemins d'échec / de revue. Un utilisateur normal ne verra donc que
l'état vide. Le panneau ne permet pas non plus de **créer** un agent : c'est un superviseur en
lecture seule (le comportement agent se règle dans Paramètres → AI et dans le composeur).

**À arbitrer** : soit alimenter le panneau avec l'activité agent nominale (runs, patchs
appliqués, branches de conversation), soit le renommer / le fusionner.

---

## Observations non bloquantes

- **Restauration de snapshot sans confirmation** : « Restore » s'exécute immédiatement, sans
  dialogue, alors que l'action réécrit tout l'arbre du workspace. Atténué par le checkpoint de
  sécurité « Before restore of … » créé automatiquement — donc récupérable. P3.
- **Workflow « Run development server » en échec** quand le serveur tourne déjà : `Port 5173 is
  already in use`. Comportement correct du workflow (il remonte la vraie stderr), mais le
  bouton Run principal échoue systématiquement sur un projet dont la preview est déjà démarrée.
  Déjà connu côté runtime.
- **`GET /api/projects/:id/thumbnail` en 404** dans la console de l'IDE — déjà consigné
  (BUG-USR-002).

---

## Annexe — traces d'exercice (cluster D)

**Problems**
```
# 1. code valide
Open Problems. 0 errors, 4 warnings.

# 2. erreur de TYPES seule (syntaxe valide) — printf > src/App.tsx depuis le shell
const broken: number = "definitely not a number";
Open Problems. 0 errors, 4 warnings.      <-- GAP-IDE-A : jamais remontée

# 3. erreur de syntaxe
Open Problems. 1 errors and 4 warnings.
Error runtime
3:08:59 PM [vite] Pre-transform error: /workspace/src/App.tsx: Unterminated JSX contents. (1:60)
jump links: []                            <-- BUG-IDE-004 : aucun lien

# 4. fichier réparé, même session (pas de rechargement)
fixed t=10s .. t=100s -> Open Problems. 1 errors and 4 warnings.
Error runtime
3:08:59 PM [vite] Pre-transform error: ... (1:60)   <-- BUG-IDE-003 : identique, même horodatage
```

**Snapshots**
```
$ printf 'MUTATED_AGAIN\n' > src/App.tsx; rm -f src/main.tsx; ls src
App.tsx  App.tsx.bak  styles.css
MUTATED_AGAIN

# clic Restore sur le checkpoint
$ ls src; head -3 src/App.tsx; test -f src/main.tsx && echo MAIN_RESTORED
App.tsx  App.tsx.bak  main.tsx  styles.css
export default function App() {
  return (
    <main className="app-shell">
MAIN_RESTORED
```

**Skills** — agent interrogé après activation de « Documentation » :
```
Code Review (quality), Test Generation (quality), Debugger (quality),
Refactor (productivity), Documentation (productivity)
```
soit exactement les 5 skills que l'API renvoie `enabled: true`, dans le même ordre.

**Workflows** — workflow créé puis lancé depuis le panneau :
```
SUCCEEDED   echo WORKFLOW_RAN_OK; node -e "console.log('sum', 2+2)"   exit 0   727ms
WORKFLOW_RAN_OK
sum 4
```

**Debugger** — après « Start debugging » :
```
QA node inspector
node --inspect-brk=0.0.0.0:9229 -e "..."
running
[{t:'continue',   disabled:true, title:'Stepping is enabled when a debug adapter reports a paused frame.'},
 {t:'step over',  disabled:true, ...}, ...]
Call stack and variables: No paused frame.
```
Le processus lancé se termine en quelques millisecondes ; le statut restait `running`
(BUG-IDE-005). Aucun code du dépôt n'assigne jamais `callStack` / `variables` autrement que
`[]`, ni ne met un statut à `paused` (GAP-IDE-B).

**Agent Studio** — après une édition agent réussie et appliquée (`Edit src/App.tsx (targeted
patch) Done 2.5s`) :
```
GET /projects/:id/agent-patch-proposals   200 {"proposals":[]}
GET /projects/:id/agent-repair-events     200 {"events":[]}
GET /projects/:id/agent-consensus         200 {"records":[]}
Panneau : « No studio yet »
```

**Paramètres** — persistance vérifiée de bout en bout :
```
description écrite dans l'UI : qa-cluster-d-1786031744145
GET /projects/:id  ->          qa-cluster-d-1786031744145
après rechargement, champ =    qa-cluster-d-1786031744145
```
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
**État** : ⛔ **NON corrigé** (nécessite une vraie affordance UI de conflit)

Quand le fichier a changé côté serveur depuis son ouverture, la sauvegarde est
refusée — protection légitime — **mais l'échec ne sort que dans la console**.
L'onglet reste marqué sale (`●`) sans message, sans bandeau, sans proposition de
recharger/écraser/fusionner. L'édition n'est persistée **nulle part** (ni
project storage, ni ide-state, ni runtime) et se perd à la fermeture.

**Preuve** :
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

**Recommandation** : bandeau de conflit non silencieux (Recharger / Écraser /
Voir le diff) + conserver le buffer local tant que le conflit n'est pas résolu.

### BUG-IDE-005 — P3 — Packages : l'action renvoie `{ok:true}` même quand le run échoue
**État** : ⛔ **NON corrigé** (masquage ; atténué par BUG-IDE-001)

Le bloc `packages` de l'action retombe sur le `return json({ ok: true })`
commun quel que soit `run.exitCode`. L'échec n'est visible que dans la liste
« Install & runtime checks » de la sidebar du panneau (rendue `failed · exit 1`
avec la sortie), c'est-à-dire **sous la ligne de flottaison** — d'où
l'impression de succès observée en B2. Le correctif BUG-IDE-001 supprime la
cause d'échec, mais le masquage subsiste pour toute autre défaillance d'install.

**Recommandation** : propager le statut du run dans la réponse de l'action et
afficher une erreur inline sous le bouton « Install package ».

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
- **Frontière runtime ↔ project storage** : l'arbre de fichiers et git montrent
  le project storage ; ce qui est créé dans le pod par le terminal/npm n'y
  apparaît pas systématiquement. Écart de parité Replit à trancher produit.

---

## Suivi

| Bug | P | 📤 Dispatché | 💻 Codé | ✅ Testé live |
|-----|---|--------------|---------|---------------|
| BUG-IDE-001 Packages mauvais workspace | P1 | ✅ | ✅ (PR, non mergée) | ✅ reproduit + tests verts |
| BUG-IDE-003 Ports jamais listés | P1 | ✅ | ✅ (PR, non mergée) | ✅ reproduit + tests verts |
| BUG-IDE-002 EEXIST → 409 | P2 | ✅ | ✅ (PR, non mergée) | ✅ reproduit + tests verts |
| BUG-IDE-004 Conflit de save avalé | P1 | ✅ | ⛔ | ✅ reproduit |
| BUG-IDE-005 `ok:true` sur run échoué | P3 | ✅ | ⛔ | ✅ reproduit |

⚠️ **Aucun déploiement prod effectué.** Les correctifs touchent `services/api` et
`services/workspace-agent` (tiers runtime) : la mise en prod doit être validée
explicitement avant `deploy-main.yml`.
