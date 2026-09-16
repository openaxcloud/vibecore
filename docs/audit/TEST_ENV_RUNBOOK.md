# Environnement de test dédié à l'audit — runbook

Environnement **éphémère, jetable et isolé de la production**, monté pour
débloquer les preuves que l'audit expert classe aujourd'hui `BLOCKED` faute de
ressources réelles : Kubernetes, GCS, rollback, restauration, isolation
inter-tenant, concurrence.

> **Garde-fou n°1.** La production — projet `vibecore-495216`, clusters
> `vibecore-prod-app` / `vibecore-prod-workspaces`, release Helm `vibecore` dans
> le namespace `vibecore` — n'est **jamais** touchée par ce runbook. Toutes les
> commandes ci-dessous ciblent explicitement le projet de test. Les scripts
> `scripts/audit-env/*.sh` refusent de s'exécuter si le contexte `kubectl`
> courant contient `vibecore-prod`.

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
```

> **Note budget.** Un budget GCP **alerte**, il ne coupe pas la facturation. Le
> vrai garde-fou de coût est le TTL et le teardown du §6.

---

## 4. Charger un build du repo sur l'environnement

Les images sont construites **dans le projet de test** et poussées dans son
propre Artifact Registry. Aucune image de prod n'est réutilisée, et aucune image
de test ne peut atterrir dans le registry de prod.

Construire depuis un **export propre du commit** (et non depuis l'arbre de
travail) : c'est ce qui garantit qu'une image correspond exactement à un SHA,
condition d'une preuve d'audit recevable.

```bash
SHA=$(git rev-parse --short=10 HEAD)
SRC=$(mktemp -d)
git archive HEAD | tar -x -C "$SRC"

# 7 images plateforme (~10-15 min, étapes en parallèle)
(cd "$SRC" && gcloud builds submit \
  --project=vibecore-audit-test-20260807 --region=europe-west9 \
  --config=cloudbuild.yaml \
  --substitutions=_PROJECT=vibecore-audit-test-20260807,_REPO=vibecore-audit-containers,_SHORT_SHA=$SHA \
  --timeout=7200s .)  # 7200s au PREMIER build (registry vide, cache froid)

# image runtime workspace-agent (config séparée, tag sha-<SHA>)
(cd "$SRC" && gcloud builds submit \
  --project=vibecore-audit-test-20260807 --region=europe-west9 \
  --config=infra/cloudbuild/workspace-agent.yaml \
  --substitutions=_PROJECT=vibecore-audit-test-20260807,_REPO=vibecore-audit-containers,_SHORT_SHA=$SHA \
  --timeout=7200s .)  # 7200s au PREMIER build (registry vide, cache froid)

# Déploiement Helm — release `vibecore-audit`, JAMAIS `vibecore`
helm upgrade --install vibecore-audit infra/helm/platform \
  --namespace vibecore --create-namespace \
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
| Mémoire de l'agent (`/agent-memory/*`) | `OPENAI_API_KEY` pour les embeddings — sans elle la route rend **503** `AGENT_MEMORY_UNCONFIGURED` |
| Envoi d'e-mails / webhooks Resend | jeton Resend de test |

> **Mise à jour 2026-08-15 — l'agent IA n'est plus bloqué.** Le secret
> `vibecore-platform-secrets` du cluster d'audit porte désormais `ANTHROPIC_API_KEY`, et une
> génération complète a réellement tourné sur cet environnement. Les scénarios agent (mode Ask,
> self-repair, multi-agents) sont donc **exerçables**. Seule la *mémoire* de l'agent reste
> bloquée, faute d'`OPENAI_API_KEY` (voir la ligne ci-dessus).

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
   manuellement dans `node_config.labels` fait échouer la création du pool en
   `400`. Il faut uniquement déclarer `sandbox_config { sandbox_type = "gvisor" }`
   et laisser GKE poser le label. ⚠️ **Le module de production
   `infra/terraform/modules/gke-workspaces/main.tf:78` le déclare encore** — une
   reconstruction du cluster workspaces à neuf échouerait de la même manière.

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

| # | Symptôme | Cause | Correctif appliqué |
|---|---|---|---|
| 1 | Job de migration `FailedCreate`, install bloquée | Le job Prisma est un hook **pre-install** qui référence un ServiceAccount rendu plus tard comme ressource normale | Créer les 7 ServiceAccounts avant le `helm install` (et les annoter pour Helm) |
| 2 | Helm refuse : `invalid ownership metadata` | Namespace/SA créés hors Helm | `app.kubernetes.io/managed-by=Helm` + annotations `meta.helm.sh/release-*` |
| 3 | API en CrashLoop : `EMAIL_HTTP_ENDPOINT is required in production` | Garde fail-closed | Puits e-mail in-cluster (200 + journalisation) plutôt qu'une vraie clé Resend |
| 4 | API en CrashLoop : `API_CORS_ORIGINS must list explicit HTTPS origins` | **La clé n'existe nulle part dans le chart** ; en prod elle est posée hors-bande | Générée dans le secret par `mint-secrets.sh` à partir de l'IP du LB |
| 5 | Prisma : `TlsConnectionError: unable to verify the first certificate` | Cloud SQL présente un certificat signé par une CA propre à l'instance ; Prisma 7 passe par l'adaptateur `pg` (`sslaccept=accept_invalid_certs` sans effet) | `?sslmode=no-verify` dans `DATABASE_URL` |
| 6 | API `/ready` 503, Redis `ETIMEDOUT`, puis **tout DNS en `EAI_AGAIN`** | La policy egress est évaluée **avant** la traduction d'adresse : la destination réelle est la **ClusterIP** (Redis `10.30.15.96`, kube-dns `10.30.0.10`), qu'aucune règle n'autorise — les règles par `podSelector`/`namespaceSelector` ne matchent donc jamais | `redisCidr` = CIDR des **services** (`10.30.0.0/20`) + NetworkPolicy `allow-dns-clusterip` |
| 7 | Toutes les URL publiques en **504**, et aucun certificat émis | `allow-ingress-controller` exige **deux** labels sur le namespace `ingress-nginx`, dont un que le chart ingress-nginx ne pose pas ; et les pods solveurs ACME, créés dans `vibecore`, ne portent aucun label plateforme donc le `deny-all` les rend injoignables | Label `app.kubernetes.io/name=ingress-nginx` sur le namespace + NetworkPolicy `allow-acme-solver-ingress` |

Les points 6 et 7 méritent une remarque : ils dépendent du datapath. Ce cluster
utilise Calico en datapath classique ; la prod peut se comporter autrement. Mais
sur ce datapath, **la plateforme ne démarre pas** avec les seules règles du chart.

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
