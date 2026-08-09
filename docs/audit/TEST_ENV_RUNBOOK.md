# Environnement de test dédié à l'audit — runbook

Environnement **éphémère, jetable et isolé de la production**, monté pour
débloquer les preuves que l'audit expert classe aujourd'hui `BLOCKED` faute de
ressources réelles : Kubernetes, GCS, rollback, restauration, isolation
inter-tenant, concurrence.

> **Garde-fou n°1.** La production — projet `vibecore-495216`, clusters
> `vibecore-prod-app` / `vibecore-prod-workspaces`, release Helm `vibecore` dans
> le namespace `vibecore` — n'est **jamais** touchée par ce runbook. Toutes les
> commandes ci-dessous ciblent explicitement le projet de test. Les scripts
> `scripts/audit-env/*.sh` refusent de s'exécuter tant qu'ils n'ont pas **prouvé**
> qu'ils visent l'environnement d'audit : endpoint du cluster obtenu via l'API GKE
> pour le projet/zone/nom EXACTS, `providerID` des nœuds vivants, et labels
> `env=audit-test` + `ephemeral=true` lus côté serveur. Un nom de contexte n'est
> jamais pris au mot — c'est un alias local, et un `kubectl config rename-context`
> suffisait à contourner l'ancienne garde.

---

## 1. Coordonnées de l'environnement

| Élément | Valeur |
|---|---|
| Projet GCP | `vibecore-audit-test-20260807` (n° `264831078104`) |
| Organisation | `groupequaliwatt-org` (`974552983243`) |
| Région / zone | `europe-west9` / `europe-west9-a` |
| Labels | `env=audit-test`, `ephemeral=true`, `owner=platform-audit`, `ttl-days=7` |
| Cluster GKE | `vibecore-audit-cluster` (zonal, NetworkPolicy Calico, Workload Identity) |
| Pools | `app` (2× `e2-standard-4`), `sandbox-gvisor` (1× `e2-standard-4`, **gVisor**) |
| Cloud SQL | `vibecore-audit-postgres` — POSTGRES_16, `db-g1-small`, IP privée, **PITR activé** |
| Buckets GCS | `vibecore-audit-test-20260807-{snapshots,exports,deployments,backups,logs}` (versioning activé) |
| Artifact Registry | `europe-west9-docker.pkg.dev/vibecore-audit-test-20260807/vibecore-audit-containers` |
| Reverse proxy | ingress-nginx (vrai), TLS Let's Encrypt HTTP-01 |
| DNS public | `sslip.io` — `<n'importe quoi>.<IP-LB>.sslip.io` résout vers l'IP du LB |
| Budget | 200 EUR, alertes 50 / 90 / 100 %, filtré sur ce seul projet |
| TTL | **7 jours** — teardown prévu, voir §6 |

Valeurs effectives du provisionnement du 2026-08-07 :

| Élément | Valeur |
|---|---|
| IP du load balancer | `34.163.208.161` |
| Application | `https://app.34.163.208.161.sslip.io` |
| Marketing | `https://www.34.163.208.161.sslip.io` |
| API | `https://api.34.163.208.161.sslip.io` |
| Workspace manager | `https://wsm.34.163.208.161.sslip.io` |
| Preview (gabarit) | `https://{workspaceId}-{port}.preview.34.163.208.161.sslip.io/` |
| Postgres (IP privée) | `10.78.0.3:5432`, base `vibecore`, **`sslmode=require` obligatoire** |
| Teardown automatique | Cloud Scheduler `audit-env-teardown`, **2026-08-14 03:00 UTC** |

Preuves relevées en réel au montage : gVisor actif sur le pool sandbox
(`dmesg` → `Starting gVisor...`), PostgreSQL 16.14 joignable depuis le cluster
en IP privée, certificat **Let's Encrypt publiquement de confiance** émis en 26 s
via HTTP-01 sur un hôte `sslip.io`.

---

## 2. Écarts assumés vs production

Reproduire la prod à l'identique coûterait ~2 000 $/mois (le module Terraform
racine `infra/terraform` est câblé en dur pour la prod). Chaque écart ci-dessous
est un choix de coût, avec ce qu'il prouve et ce qu'il **cesse** de prouver.

| Prod | Env de test | Reste prouvé | N'est **plus** prouvé |
|---|---|---|---|
| 2 clusters régionaux | 1 cluster **zonal**, 2 pools | API k8s, NetworkPolicy, PVC, gVisor, cycle de vie | tolérance de panne multi-zone |
| Cloud SQL `db-custom-2-8192` REGIONAL 100 Go | `db-g1-small` ZONAL 10 Go, **PITR activé** | vrai Postgres managé, sauvegardes, PITR, restauration | bascule HA, comportement sous charge réelle |
| Memorystore Redis `STANDARD_HA` 5 Go | Redis **in-cluster** (1 pod) | sémantique Redis, files BullMQ ; **injection de panne plus facile** (kill du pod) | HA Memorystore, persistance managée |
| Filestore 1 To RWX | provisioner **NFS in-cluster** sur PD 50 Go | RWX réel, multi-réplicas API sur volume partagé | performances Filestore, tier BASIC |
| `e-code.ai` + Let's Encrypt DNS-01 | `<IP>.sslip.io` + Let's Encrypt **HTTP-01** | vrai DNS public, vrai TLS de confiance sur les domaines principaux | wildcard `*.preview` (voir ci-dessous) |
| Wildcard preview TLS (DNS-01) | ClusterIssuer **auto-signé** | comportement du preview-proxy (routage, fail-closed, multi-ports) | chaîne TLS publiquement de confiance sur les hôtes preview → Playwright doit utiliser `ignoreHTTPSErrors` |
| Nœuds privés + Cloud NAT | nœuds à IP publique | égress réel | posture réseau « nœuds privés » |
| Store Nix partagé (PVC 12 Go) | absent (`nixStorePvc: ''`) | chemin snapshot Phase-A | pipeline reproductible Nix |
| Secrets prod (Secret Manager) | secrets **générés**, tiers absents | authentification, chiffrement, signature, jetons internes | voir §5 « Scénarios encore bloqués » |

---

## 3. Créer l'environnement

Pré-requis : `gcloud`, `kubectl`, `helm`, `terraform` ; compte disposant de
`resourcemanager.projectCreator` et `billing.admin` sur l'organisation.

```bash
# 0. Ne jamais laisser gcloud pointer sur la prod par défaut.
gcloud config set project vibecore-audit-test-20260807

# 1. Projet, facturation, API, budget  (une seule fois — déjà fait pour cet env)
gcloud projects create vibecore-audit-test-20260807 \
  --name="Vibecore Audit Test" --organization=974552983243 \
  --labels=env=audit-test,ephemeral=true,owner=platform-audit,ttl-days=7
gcloud billing projects link vibecore-audit-test-20260807 \
  --billing-account=019D6D-45FBC1-89F220
gcloud services enable compute.googleapis.com container.googleapis.com \
  sqladmin.googleapis.com storage.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com servicenetworking.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com logging.googleapis.com \
  monitoring.googleapis.com --project=vibecore-audit-test-20260807
gcloud billing budgets create --billing-account=019D6D-45FBC1-89F220 \
  --display-name="vibecore-audit-test TTL7 cap" --budget-amount=200EUR \
  --filter-projects="projects/vibecore-audit-test-20260807" \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0 \
  --billing-project=vibecore-audit-test-20260807

# 2. Infrastructure (VPC, GKE + pool gVisor, Cloud SQL, buckets, registry)
terraform -chdir=infra/terraform/envs/audit-test init
terraform -chdir=infra/terraform/envs/audit-test apply

# 3. kubeconfig du cluster de test
gcloud container clusters get-credentials vibecore-audit-cluster \
  --zone europe-west9-a --project vibecore-audit-test-20260807

# 4. Add-ons : ingress-nginx, cert-manager, NFS (RWX), Redis
./scripts/audit-env/addons.sh

# 5. Secrets de test générés (aucun secret de prod)
./scripts/audit-env/mint-secrets.sh

# 6. Rendu des valeurs Helm (IP du LB + CIDR Cloud SQL)
./scripts/audit-env/render-values.sh

# 7. Droits Cloud Build dans un projet neuf (sinon 403 dès l'upload — §7.1)
PN=$(gcloud projects describe vibecore-audit-test-20260807 --format='value(projectNumber)')
for r in roles/storage.admin roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding vibecore-audit-test-20260807 \
    --member="serviceAccount:$PN-compute@developer.gserviceaccount.com" \
    --role="$r" --condition=None >/dev/null
done
```

> **Workload Identity / GCS.** `terraform apply` crée le compte de service GCP,
> lui donne `objectAdmin` sur les buckets **et** le lie aux ServiceAccounts
> Kubernetes `…-api` / `…-worker` (`roles/iam.workloadIdentityUser`). La moitié
> symétrique est l'annotation `iam.gke.io/gcp-service-account`, portée par
> `global.workloadIdentity` dans `values-audit-test.yaml`. **Les deux sont
> nécessaires** : un pod s'authentifie comme son ServiceAccount *Kubernetes*, donc
> sans le lien il retombe sur le compte de service des nœuds — aux scopes
> volontairement minimaux — et chaque écriture GCS (object storage, snapshots,
> sauvegardes de base) échoue en 403 qui ressemble à un problème de droits sur le
> bucket alors que l'IAM du bucket est correct.
>
> Contrôle :
> ```bash
> gcloud iam service-accounts get-iam-policy \
>   vibecore-audit-app@vibecore-audit-test-20260807.iam.gserviceaccount.com \
>   --project vibecore-audit-test-20260807 \
>   --format='value(bindings.members)' | tr ';' '\n' | grep svc.id.goog
> ```

> **Note budget.** Un budget GCP **alerte**, il ne coupe pas la facturation. Le
> vrai garde-fou de coût est le TTL du §4.c et le teardown du §6.

---

## 4. Charger un build du repo sur l'environnement

Les images sont construites **dans le projet de test** et poussées dans son
propre Artifact Registry. Aucune image de prod n'est réutilisée, et aucune image
de test ne peut atterrir dans le registry de prod.

Construire depuis un **export propre du commit** (et non depuis l'arbre de
travail) : c'est ce qui garantit qu'une image correspond exactement à un SHA,
condition d'une preuve d'audit recevable.

> ⚠️ **Ne pas utiliser `cloudbuild.yaml` (le monolithe) sur un registry vide.**
> Il meurt en `INTERNAL_ERROR` après ~57 min, de façon reproductible et
> **indépendamment du timeout** — détails et fausses pistes écartées au §7.5. La
> séquence ci-dessous est celle qui marche, et elle construit les 9 images en
> quelques minutes.

```bash
P=vibecore-audit-test-20260807
R=vibecore-audit-containers
SHA=$(git rev-parse --short=10 HEAD)
SRC=$(mktemp -d)
git archive HEAD | tar -x -C "$SRC"
cd "$SRC"

sub() { echo "_PROJECT=$P,_REPO=$R,_SHORT_SHA=$SHA,_DEPS_TAG=$SHA"; }

# 1. deps d'abord : toutes les autres images en héritent (~4 min).
gcloud builds submit --project=$P --region=europe-west9 \
  --config=infra/cloudbuild/deps-only.yaml \
  --substitutions=_PROJECT=$P,_REPO=$R,_SHORT_SHA=$SHA --timeout=3600s .

# 2. les 6 services backend, un build par service (parallélisables : lancer
#    chaque ligne en tâche de fond puis `wait`).
# PKG/CMD doivent rester identiques a cloudbuild.yaml (le monolithe) : `tsx`
# et non `node`, et admin sert des fichiers statiques via serve.mjs.
for s in api worker admin ai-gateway workspace-manager preview-proxy; do
  case "$s" in
    api)               PKG=@vibecore/api;               CMD="tsx dist/server.js" ;;
    worker)            PKG=@vibecore/worker;            CMD="tsx dist/index.js" ;;
    admin)             PKG=@vibecore/admin;             CMD="node serve.mjs" ;;
    ai-gateway)        PKG=@vibecore/ai-gateway;        CMD="tsx dist/server.js" ;;
    workspace-manager) PKG=@vibecore/workspace-manager; CMD="tsx dist/server.js" ;;
    preview-proxy)     PKG=@vibecore/preview-proxy;     CMD="tsx dist/server.js" ;;
  esac
  gcloud builds submit --project=$P --region=europe-west9 \
    --config=infra/cloudbuild/single-service.yaml \
    --substitutions="$(sub),_SERVICE=$s,_PACKAGE_FILTER=$PKG,_START_CMD=$CMD" \
    --timeout=3600s . &
done
wait

# 3. le web. Les 3 valeurs Vite sont figées DANS l'image au build et leurs
#    valeurs par défaut visent la PRODUCTION : sans ces surcharges, l'app de
#    test appelle l'API de prod (le navigateur de l'auditeur tape api.e-code.ai
#    depuis une page servie par l'env de test — et personne ne le voit tant
#    qu'on ne regarde pas l'onglet réseau).
LB_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
gcloud builds submit --project=$P --region=europe-west9 \
  --config=infra/cloudbuild/single-web.yaml \
  --substitutions="$(sub),_VITE_RUNTIME_MODE=remote-kubernetes,_VITE_RUNTIME_API_BASE_URL=https://api.$LB_IP.sslip.io/api/runtime,_VITE_BYOK_DISABLED=true,_SIGN_IMAGES=0" \
  --timeout=3600s .

# NOTE `_SIGN_IMAGES=0` : single-web.yaml et workspace-agent.yaml signent
#      l'image (cosign) — single-service.yaml non — et visent la cle KMS de CE projet — or seul le
#      projet de prod possede le keyring `ecode-supply-chain`. Sans cette
#      surcharge, l'etape echoue en `SERVICE_DISABLED` APRES avoir pousse
#      l'image : build rouge, artefact pourtant publie et bon. A ne JAMAIS
#      mettre a 0 pour la prod, ou Kyverno refuse une image non signee.

# 4. l'agent runtime des workspaces (tag `sha-<SHA>`, pas `<SHA>`).
gcloud builds submit --project=$P --region=europe-west9 \
  --config=infra/cloudbuild/workspace-agent.yaml \
  --substitutions=_PROJECT=$P,_REPO=$R,_SHORT_SHA=$SHA,_SIGN_IMAGES=0 --timeout=3600s .

# Déploiement Helm.
# Release `vibecore` / namespace `vibecore` — MÊMES NOMS que la prod, à dessein :
# les URL in-cluster de values-audit-test.yaml (`vibecore-vibecore-platform-api`
# …) dérivent du nom de release, donc le renommer casserait le câblage interne.
# Le garde-fou n'est pas le nom de la release, c'est l'IDENTITE PROUVEE du
# cluster : les scripts vérifient endpoint GKE + providerID des noeuds + labels
# (cf. scripts/audit-env/lib.sh), jamais le nom du contexte.
#
# PAS de `--create-namespace` : le namespace a déjà été créé, avec les marqueurs
# d'adoption Helm, par addons.sh / mint-secrets.sh (étapes 4 et 5). Le chart le
# template lui aussi, et `--create-namespace` en produirait une version que Helm
# refuse ensuite d'adopter (§7, blocage n°2).
helm upgrade --install vibecore infra/helm/platform \
  --namespace vibecore \
  -f infra/helm/platform/values.yaml \
  -f infra/terraform/envs/audit-test/credentials/values-audit-test.rendered.yaml \
  --set global.imageTag="$SHA" \
  --set platformEnv.runtime.workspaceAgentImage="europe-west9-docker.pkg.dev/vibecore-audit-test-20260807/vibecore-audit-containers/workspace-agent:sha-$SHA" \
  --atomic --timeout 15m
```

> **Pourquoi `--install` et pas `--reuse-values`.** En prod, `--reuse-values`
> fige `values-prod.yaml` et impose de re-`--set` les clés. Ici on passe le
> fichier de valeurs complet à chaque fois : l'environnement est jetable, on
> veut un déploiement déterministe et reproductible depuis le repo.

### 4.b Runtime des workspaces — sans quoi aucun workspace ne démarre

Le chart `platform` ne crée **pas** le namespace `workspaces` ni ce qui le rend
utilisable (RuntimeClass gVisor, NetworkPolicies d'isolation, quota, LimitRange).
Sans cette étape, provisionner un workspace échoue et l'aperçu n'a rien à servir
— c'est un second chart, à installer explicitement :

```bash
helm upgrade --install vibecore-workspaces infra/helm/workspaces-runtime \
  --namespace workspaces --create-namespace \
  --set namespace=workspaces --set platformNamespace=vibecore \
  --wait --timeout 5m

# Contrôles : la RuntimeClass gVisor existe, et le default-deny est en place.
kubectl get runtimeclass gvisor
kubectl -n workspaces get networkpolicy
```

### 4.c Armer le TTL — le vrai garde-fou de coût

Un budget GCP **alerte**, il ne coupe rien (§3). Le seul mécanisme qui borne
réellement la dépense est le teardown programmé, et il doit être armé
explicitement — l'oublier laisse tourner un cluster + un Cloud SQL
indéfiniment :

```bash
./scripts/audit-env/schedule-teardown.sh

# Contrôle : le job existe et sa prochaine exécution est bien à J+7.
gcloud scheduler jobs describe audit-env-teardown \
  --location=europe-west9 --project=vibecore-audit-test-20260807 \
  --format='value(name,schedule,scheduleTime,state)'
```

---

## 5. Ce que l'environnement débloque — et ce qui reste bloqué

**Débloqué** (ressources réelles disponibles) :

- cycle de vie des workspaces Kubernetes, inspection des ressources, **preuve de disparition après suppression** ;
- isolation inter-tenant réelle : NetworkPolicy **appliquée** (Calico) + sandbox **gVisor** ;
- vrai bucket GCS : inventaire, générations, versioning, vérification de disparition ;
- rollback et restauration : Cloud SQL **PITR** + sauvegardes, rollback Helm, rollback par digest ;
- reverse proxy réel : ingress-nginx, multi-ports, fail-closed, deux tenants ;
- concurrence : API multi-réplicas sur volume **RWX** partagé ;
- navigateur réel : Playwright sur web / tablette / mobile contre une URL publique en TLS.

**Encore bloqué** — choix assumé « secrets internes uniquement » (§2). Ces
scénarios nécessitent qu'Avi fournisse des identifiants de test dédiés :

| Scénario | Manque |
|---|---|
| Facturation, crédits, webhooks Stripe | clé Stripe **mode test** + secret de webhook |
| Connexion OAuth Google / GitHub, connecteurs Git | applications OAuth **de test** dédiées |
| Agent IA : mode Ask non mutant, self-repair, conflits multi-agents | clé LLM plafonnée (Anthropic/OpenAI) |
| Envoi d'e-mails / webhooks Resend | jeton Resend de test |

Tant que ces clés ne sont pas fournies, ces points restent `BLOCKED` et doivent
être déclarés comme tels — l'environnement ne les rend pas prouvables par magie.

---

## 6. Détruire l'environnement (et le vérifier)

```bash
./scripts/audit-env/down.sh
```

Le script procède en deux couches, puis **vérifie** au lieu de faire confiance
aux codes de retour :

1. `terraform destroy` — retire proprement ce que Terraform a créé ;
2. `gcloud projects delete` — filet de sécurité : tout ce qui aurait été créé à
   la main (kubectl, helm, Cloud Build) vit dans ce projet et disparaît avec lui ;
3. **vérification de disparition** : état du projet (`DELETE_REQUESTED`),
   puis comptage à zéro des clusters GKE, instances Cloud SQL, VM Compute et
   buckets ; enfin relecture de la release Helm `vibecore` de **prod** pour
   confirmer qu'elle est intacte.

Le script refuse de s'exécuter si `AUDIT_PROJECT_ID` vaut le projet de prod.
`SKIP_PROJECT_DELETE=1` permet un `terraform destroy` seul (pour reconstruire
sans recréer le projet).

> La suppression d'un projet GCP est **réversible pendant ~30 jours**
> (`gcloud projects undelete`). Passé ce délai elle est définitive.

---

## 7. Pièges rencontrés au provisionnement réel

Ces quatre points ont réellement fait échouer une étape lors du premier montage.
Ils sont corrigés dans le code du repo ; ils sont consignés ici parce qu'ils se
reproduiront sur tout nouveau projet GCP.

1. **Cloud Build n'a aucun droit dans un projet neuf.** Depuis que GCP applique
   `automaticIamGrantsForDefaultServiceAccounts`, le SA Compute par défaut ne
   reçoit plus de rôle. Sans les trois liaisons ci-dessous, `gcloud builds
   submit` échoue en 403 dès l'upload de la source :
   ```bash
   SA=<PROJECT_NUMBER>-compute@developer.gserviceaccount.com
   for r in roles/storage.admin roles/artifactregistry.writer roles/logging.logWriter; do
     gcloud projects add-iam-policy-binding <PROJECT_ID> \
       --member="serviceAccount:$SA" --role="$r" --condition=None
   done
   ```

2. **`sandbox.gke.io/runtime` est un label géré par GKE.** Le déclarer
   manuellement dans `node_config.labels` fait échouer la création du pool :
   `Error 400: Node labels with key "sandbox.gke.io/runtime" are managed by GKE
   and must not be manually specified.` Il faut uniquement déclarer
   `sandbox_config { sandbox_type = "gvisor" }` et laisser GKE poser le label —
   vérifié en réel : un pool créé avec `sandbox_config` seul porte bien le label
   `sandbox.gke.io/runtime=gvisor` **et** le taint `NoSchedule` correspondant,
   donc le contrat de scheduling est inchangé. Le module de production
   `infra/terraform/modules/gke-workspaces/main.tf` le déclarait encore (une
   reconstruction à neuf du cluster workspaces aurait échoué de la même
   manière) — **corrigé**.

3. **Cloud SQL crée désormais en édition `ENTERPRISE_PLUS` par défaut**, qui
   refuse les tiers partagés (`db-g1-small`) et impose une machine
   `db-perf-optimized-*` bien plus chère. Il faut poser `edition = "ENTERPRISE"`
   explicitement.

4. **Let's Encrypt refuse un contact en `.invalid`** (« Domain name does not end
   with a valid public suffix »). Le champ contact étant facultatif, il est omis
   plutôt que d'y placer une adresse de production ou une adresse personnelle.

5. **`cloudbuild.yaml` complet échoue sur un registry vide — augmenter le timeout
   ne sert à rien.** Le build meurt en `INTERNAL_ERROR` après **~57 minutes**,
   de façon reproductible et **indépendamment du timeout configuré** (essayé à
   3600 s et 7200 s : échecs à 57 min 21 s et 57 min 36 s). Aucun log, aucune
   image, toutes les étapes marquées `INTERNAL_ERROR` sans timing — ce qui donne
   l'impression trompeuse que le build n'a jamais démarré.

   Fausses pistes écartées par des tests décisifs : un build minimal en
   europe-west9 passe en 7 s (région et IAM hors de cause) ; un build minimal
   portant **exactement** les mêmes options (`E2_HIGHCPU_8`, `diskSizeGb: 200`)
   passe en 4 s (machine et disque hors de cause) ; quotas `E2_CPUS` 0/72 et
   `CPUS` 12/100 (pas une limite).

   **Contournement qui marche** — décomposer le monolithe, ce qui construit les
   9 images en quelques minutes au lieu d'échouer en une heure :
   ```bash
   # 1. deps seul (3 min 49 s mesurées)
   gcloud builds submit --config=infra/cloudbuild/deps-only.yaml \
     --substitutions=_PROJECT=$P,_REPO=$R,_SHORT_SHA=$SHA --timeout=3600s .
   # 2. les 7 services, en builds SEPARES (parallelisables)
   #    api / worker / admin / ai-gateway / workspace-manager / preview-proxy
   #    via infra/cloudbuild/single-service.yaml, et web via single-web.yaml
   # 3. workspace-agent (1 min 21 s mesurees)
   gcloud builds submit --config=infra/cloudbuild/workspace-agent.yaml ...
   ```
   ⚠️ Pour `single-web.yaml`, **surcharger `_VITE_RUNTIME_API_BASE_URL`** : sa
   valeur par défaut est l'API de **production** et elle est figée dans l'image
   au build. Sans override, l'app de test appelle la prod.

### Installation à neuf : sept blocages, tous invisibles en production

Ces points ne se voient jamais sur la prod (état déjà convergé, ressources
préexistantes) mais bloquent **toute installation depuis zéro** — donc aussi une
reprise après sinistre. Chacun a été constaté en réel ici.

Le premier montage les a contournés **à la main** (kubectl, annotations,
NetworkPolicies hors Helm), ce qui ne répare que ce cluster-ci. Ils sont
désormais corrigés **dans le code du repo**, et la colonne « Correctif » dit où :

| # | Symptôme | Cause | Correctif (dans le repo) |
|---|---|---|---|
| 1 | Job de migration `FailedCreate` (`error looking up service account …-api: not found`), puis rollback `--atomic` : rien n'est installé | Le job Prisma est un hook **pre-install** qui référence le ServiceAccount de l'api, rendu plus tard comme ressource **normale** (les hooks passent avant). `automountServiceAccountToken: false` n'y change rien : l'admission vérifie l'existence du SA avant de décider du jeton | `templates/migrations-job.yaml` : le job porte son **propre** ServiceAccount, rendu en hook `pre-install` au poids **-20** (le job est à -10) |
| 2 | Helm refuse : `invalid ownership metadata; label validation error: missing key "app.kubernetes.io/managed-by"` | Le namespace doit exister avant `helm` (secret de release + hooks), mais le chart le template aussi — un `kubectl apply` nu, comme `--create-namespace`, crée un objet que Helm n'a pas le droit d'adopter | `scripts/audit-env/lib.sh` : `audit_env_ensure_namespace` crée le namespace **avec** les 3 marqueurs d'adoption Helm (`managed-by` + `meta.helm.sh/release-{name,namespace}`) |
| 3 | API en CrashLoop : `EMAIL_HTTP_ENDPOINT is required in production` | Garde fail-closed | `scripts/audit-env/addons.sh` : puits e-mail in-cluster (200 + journalisation intégrale) plutôt qu'une vraie clé Resend. Il était créé à la main, il est maintenant dans le script |
| 4 | API en CrashLoop : `API_CORS_ORIGINS must list explicit HTTPS origins` | **La clé n'existait nulle part dans le chart** ; en prod elle est posée hors-bande dans le secret | `templates/configmap.yaml` : `API_CORS_ORIGINS` **dérivé** de `global.appDomain` + `global.marketingDomain` (+ sa forme `www.` si apex). Dérivé et non une clé de values parce que le CD déploie en `--reuse-values`, qui **perd** toute clé nouvelle. Sur `values-prod.yaml` le rendu est *byte-identique* à ce que la prod sert aujourd'hui |
| 5 | Prisma : `TlsConnectionError: unable to verify the first certificate` | Cloud SQL présente un certificat signé par une CA propre à l'instance. `sslaccept=accept_invalid_certs` est un paramètre du moteur Prisma, et Prisma 7 passe par l'adaptateur `pg`, qui l'ignore | `infra/terraform/envs/audit-test/outputs.tf` : `?sslmode=no-verify` (mode `pg`/libpq : on chiffre, on ne vérifie pas la chaîne) |
| 6 | API `/ready` 503, Redis `ETIMEDOUT`, puis **tout DNS en `EAI_AGAIN`** | La policy egress est évaluée **avant** la traduction d'adresse : la destination réelle est la **ClusterIP** (Redis `10.30.15.96`, kube-dns `10.30.0.10`), qu'aucune règle n'autorise — les règles par `podSelector`/`namespaceSelector` ne matchent donc jamais | `redisCidr` = CIDR des **services** (déjà dans `values-audit-test.yaml`) **+** `templates/networkpolicy.yaml` : `allow-dns-clusterip`, restreint à la **ClusterIP de kube-dns en /32** (`networkPolicy.dnsServiceIp`, vide par défaut). Épinglé aussi dans `values-prod.yaml` (inerte sur la prod actuelle, en Dataplane V2) |
| 7 | Toutes les URL publiques en **504**, et aucun certificat émis | `allow-ingress-controller` exige **deux** labels sur le namespace `ingress-nginx`, dont un que le chart ingress-nginx ne pose pas ; et les pods solveurs ACME, créés dans `vibecore`, ne portent aucun label plateforme donc le `deny-all` les rend injoignables | Label posé par `addons.sh` (+ avertissement dans `values.yaml`) **et** `templates/networkpolicy.yaml` : `allow-acme-solver-ingress`, activé par défaut (inerte là où HTTP-01 n'est pas utilisé, la prod étant en DNS-01) |

Les points 6 et 7 méritent une remarque : ils dépendent du datapath. Ce cluster
utilise Calico en datapath classique ; la prod tourne en `ADVANCED_DATAPATH`
(Dataplane V2) et n'en a pas besoin aujourd'hui. Mais sur ce datapath, **la
plateforme ne démarre pas** avec les seules règles du chart — et une reprise
après sinistre n'a aucune garantie d'atterrir sur le même datapath. Les deux
règles ne font qu'**ajouter** une autorisation (les NetworkPolicies sont une
union), donc les épingler ne peut rien casser.

**Un huitième point, trouvé en rejouant l'installation à neuf.** Le §2 annonce
un ClusterIssuer auto-signé pour le wildcard preview, mais le chart n'avait
qu'une seule clé d'issuer pour ses deux Ingress : le certificat
`*.preview.<ip>.sslip.io` visait donc l'issuer HTTP-01, alors qu'ACME n'émet un
wildcard qu'en DNS-01. Résultat : `READY=False` définitif et cert-manager qui
rejoue indéfiniment une commande impossible, pendant toute la vie du cluster.
Corrigé par `ingress.previewIssuerName` (vide = l'issuer principal, donc la prod
en DNS-01 est inchangée ; `selfsigned-preview` dans `values-audit-test.yaml`).

### Contre-audit : ce que le premier passage laissait passer

Le contre-audit de la PR #125 a relevé, en plus, quatre défauts qui n'étaient pas
des blocages d'installation mais des **faiblesses réelles**, corrigés ici :

| Défaut | Ce qu'il permettait | Correctif |
|---|---|---|
| Les garde-fous des scripts ne testaient qu'une **sous-chaîne du NOM** du contexte kubectl (`*vibecore-prod*`) | Un `kubectl config rename-context` suffisait : `mint-secrets.sh` écrasait alors le Secret de **production** avec des valeurs de test (JWT, cookies, clés de chiffrement rotés). Le motif ne matche même pas l'ID du projet de prod, `vibecore-495216` | `lib.sh` : trois preuves d'identité obligatoires — endpoint du cluster obtenu de l'API GKE pour projet/zone/nom **exacts**, `providerID` des nœuds vivants, labels `env=audit-test`+`ephemeral=true` lus côté serveur |
| `down.sh` acceptait **tout** `AUDIT_PROJECT_ID` sauf un unique ID de prod codé en dur | Un projet de staging, un projet client ou un futur projet de prod se faisait supprimer | Liste d'autorisation d'**un** élément au lieu de l'exclusion d'un élément, + liaison projet ↔ état Terraform ↔ cluster vérifiée par ID exact avant tout `destroy` |
| `down.sh` concluait « prod intacte » en lisant le contexte **courant** | Pendant un teardown d'audit, il lisait le cluster d'**audit** : un teardown ayant détruit la prod se serait quand même conclu par « prod intacte » | `--kube-context` explicite ; l'absence de ce contexte est un **échec**, pas un succès silencieux |
| La porte private-port du preview-proxy répondait « public » sur **tous** ses chemins d'échec | N'importe quel incident (api injoignable, 5xx, corps malformé) **publiait** chaque port privé. C'est ainsi que le doublon `API_BASE_URL` (:80 au lieu de 3001) est passé inaperçu des semaines | Fail-closed : seul un `private: false` explicite prouve qu'un port est public, chaque refus est journalisé. `platformEnv.preview.*` active l'enforcement (activé ici, **pas** en prod — voir `templates/configmap.yaml`) |

Deux points hors sécurité relevés au même moment : l'autorisation DNS couvrait
toute la plage des Services sur `:53` (restreinte à la ClusterIP de kube-dns en
`/32`), et le second label du namespace `ingress-nginx` n'était posé que par ce
script d'audit — il est désormais un manifeste versionné appliqué aussi par
`deploy-main.yml`, donc une reconstruction est 100 % IaC.

Par ailleurs, `google_service_networking_connection` a échoué une première fois
en `UNAUTHENTICATED` (agent de service pas encore prêt juste après l'activation
de l'API) et a réussi au ré-`apply` suivant, sans modification : **re-lancer
`terraform apply` avant de conclure à un vrai défaut**.

## 8. Fiche de coordonnées

Voir le fichier généré `infra/terraform/envs/audit-test/credentials/` :

- `audit-test.env` — secrets de test en clair (chmod 600, gitignoré) ;
- `values-audit-test.rendered.yaml` — valeurs Helm rendues.

Les identifiants d'accès à transmettre à l'expert sont récapitulés dans
`docs/audit/TEST_ENV_ACCESS.md` (généré au provisionnement, **non commité**).
