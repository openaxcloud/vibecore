# LAUNCH_READINESS — audit mise en prod

Audit **en réel** sur `app.e-code.ai` (prod), compte JETABLE + projets neufs, exercé
bout en bout (pas de lecture de rendu). Chaque verdict est adossé à une preuve
reproductible (code HTTP, extrait SQL, URL live, objet Kubernetes).

États par point : 📤 Dispatché · 💻 Codé · ✅ Testé live.
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
| Étape | Preuve |
| --- | --- |
| Détection | `GET …/deployments/detect` → `{mode:"static", reason:"Static site (index.html, no server)."}` |
| Publication | `POST …/deployments` → **HTTP 202** → **READY** |
| URL live | `https://s-cmshmkrit000z0nbyv9qr7lbz.preview.e-code.ai/` → **HTTP 200**, `text/html`, 182 o, contenu servi (`QA-CLUSTER-C-STATIC-OK`) |
| Logs de build | 19 lignes réelles : sandbox isolée `.vibecore-deploy-<id>`, `npm install`, `npm run build`, artefact, snapshot |
| Rollback v2 → v1 | **HTTP 201**, `rolledBackFromId` renseigné, l'URL sert de nouveau `QA-CLUSTER-C-STATIC-OK` |

#### Server (autoscale) — ⚠️
| Étape | Preuve |
| --- | --- |
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
| --- | --- | --- |
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
| --- | --- | --- |
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
