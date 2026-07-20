# PLAN DE PARITÉ PRODUIT REPLIT — plan canonique corrigé

> **CE FICHIER EST LE PLAN. Il n'y en a pas d'autre.** Version adoptée le
> 2026-07-20 depuis le plan corrigé de l'expert (22 sections reprises
> VERBATIM) + annexe E-Code (overlay code). Il ne reste qu'un seul plan actif
> sous ce chemin ; les anciennes versions sont historiques et ne constituent
> jamais une source d'état. Toute correction se fait **par remplacement dans
> le plan canonique** ; raisons et supersessions dans `CHANGELOG_AUDIT.md`.

---

## 0. Métadonnées et statut

```yaml
schemaVersion: 2
planVersion: 2026-07-20.3
baselineObservedThrough: "2026-07-20"
reviewGeneratedAt: "2026-07-20T07:00:08Z" # la CI écrira ensuite le commit et le blob réels dans DOCUMENT_MANIFEST.yaml
status: NOT_APPROVED
highestVerifiedLevelInThisReview: DOCUMENT_RECONCILED
repositoryStateVerifiedInThisReview: false
reason: >
  Les pièces jointes contiennent le scan et le plan, mais pas le dépôt,
  les registres compagnons, les contrats, la CI ni le paquet complet de
  captures annoncé. L’architecture et les claims publics ont été revérifiés ;
  l’état d’implémentation doit être recalculé au commit mergé.
inputDocuments:
  - path: REPLIT_LIVE_SCAN_2026-07-20.md
    sha256: 396b07e2520d1171807a7873938d8671e4776076e0902208e31eaa1e4bba1f0f
  - path: PLAN_PARITE_REPLIT_A_JOUR.md
    sha256: b264f24ed169f9077777d531ee0c292817144d0e315dc5a5c968418ea8851796
certificationBoundary: >
  Parité produit observable sur une baseline publique datée, plus les
  décisions E-Code explicitement étiquetées. L’infrastructure privée complète
  de Replit n’est pas publiquement observable et n’est jamais déclarée copiée.
```

### Manifeste de document

Le plan ne stocke pas son propre commit final. `DOCUMENT_MANIFEST.yaml`, généré après merge, porte :

```yaml
DocumentManifestEntry:
  documentPath:
  blobSha256:
  generatedFromCommit:
  mergedCommit:
  registryCommit:
  generatorCommit:
  generatedAt:
  reviewer:
  validationRunId:
```

Les champs `planCommit`, `registryCommit`, `statusCommit` et `statusGeneratorCommit` ne doivent pas être auto‑référentiels dans le document qu’ils décrivent.

---

## 1. Règles de vérité

Chaque assertion externe porte exactement l’un des statuts suivants :

| Statut | Signification |
|---|---|
| `LIVE_ANONYMOUS` | Vu dans un navigateur anonyme, avec capture, hash complet, route, heure et environnement |
| `LIVE_AUTHENTICATED` | Vu dans un vrai compte de test légitime, avec plan, rollout et artefacts |
| `DOC_CURRENT` | Présent dans la documentation officielle actuelle, archivée et hashée |
| `CHANGELOG_CURRENT` | Présent dans une publication ou release note officielle datée |
| `INFERENCE` | Déduction explicite et réfutable, jamais présentée comme un fait Replit |
| `UNKNOWN` | Non déterminé ; l’absence de trace n’est pas une preuve d’absence |
| `ECODE_DECISION` | Choix d’architecture ou de produit propre à E‑Code |
| `ECODE_LIVE_EVIDENCE` | Capacité E‑Code traversée sur le vrai parcours, avec `evidenceId` |
| `RETIRED_CONFIRMED` | Retrait établi par une preuve positive actuelle |

Règles absolues :

1. **Prouvé en réel ou NON FAIT.**
2. Un contrat n’est pas une implémentation.
3. Une preuve API n’est pas une preuve UI.
4. Une route redirigée ne prouve pas la suppression de toutes les données ou capacités historiques associées.
5. Une première observation ne devient pas une date de lancement.
6. Un prix vu dans un navigateur est une observation contextualisée, pas une constante universelle.
7. Un registre ne peut pas certifier un univers qu’il n’a pas correctement défini.
8. Une fonctionnalité publique Replit peut être plan-gated, régionale, expérimentale ou soumise à rollout.
9. Aucune phrase ne doit employer « exhaustif », « exactement Replit », « instantané » ou « illimité » sans périmètre et preuve calculables.

---

## 2. Hiérarchie documentaire et registres

### 2.1 Sources normatives

1. `docs/parity/PLAN_PARITE_REPLIT.md` — objectifs, modèle, architecture, invariants et gates.
2. Contrats de domaine (`*_CONTRACT.md`, OpenAPI/AsyncAPI, JSON Schemas).
3. Décisions propriétaire dans `DECISION_REGISTRY.yaml`.

### 2.2 Sources d’état

- `PUBLIC_BASELINE_REPLIT_2026.yaml`
- `SOURCE_REGISTRY.yaml`
- `ROUTE_OBSERVATION_REGISTRY.yaml`
- `OBSERVATION_REGISTRY.yaml`
- `SURFACE_REGISTRY.yaml`
- `CAPABILITY_REGISTRY.yaml`
- `CREATION_INTENT_REGISTRY.yaml`
- `ARTIFACT_KIND_REGISTRY.yaml`
- `GENERATED_ASSET_KIND_REGISTRY.yaml`
- `COMPONENT_KIND_REGISTRY.yaml`
- `DEPLOYMENT_TYPE_REGISTRY.yaml`
- `IMPORT_PROVIDER_REGISTRY.yaml`
- `CONNECTOR_REGISTRY.yaml`
- `OFFERING_ENTITLEMENT_REGISTRY.yaml`
- `EXTERNAL_ECOSYSTEM_REGISTRY.yaml`
- `SERVICE_REGISTRY.yaml`
- `P0_REGISTRY.yaml`
- `P1_REGISTRY.yaml`
- `UNKNOWN_REGISTRY.yaml`
- `DECISION_REGISTRY.yaml`
- `E2E_PROOFS.yaml`
- `LEGACY_FINDING_REGISTRY.yaml`
- `WORK_ITEM_REGISTRY.yaml`
- `TRACEABILITY_MATRIX.yaml`
- `DOCUMENT_MANIFEST.yaml`

### 2.3 Vues générées

- `APPROVAL_STATUS.json`
- `PARITY_STATUS.md`
- tableaux de compteurs du plan

Elles sont produites par la CI et ne sont jamais modifiées manuellement.

### 2.4 Historique

- `CHANGELOG_AUDIT.md` — append-only ; raisons, auteurs, dates et supersessions.

---

## 3. Collecte et baseline Replit

### 3.1 Sources surveillées

Le collecteur fonctionne quotidiennement et sur événements :

1. documentation : `llms.txt`, `llms-full.txt`, sitemap, changelog, help, blog ;
2. routes publiques rendues en JavaScript ;
3. pricing, légal, Trust & Safety et status ;
4. release notes des clients natifs ;
5. observations authentifiées sur comptes de test dédiés par plan et rollout ;
6. sources Google Cloud, Nix et standards utilisés par l’architecture E‑Code.

### 3.2 Schéma d’observation

```yaml
Observation:
  observationId:
  sourceType:
  routeOrUrl:
  eventDate: null
  firstObservedAt:
  observedAt:
  detectionDate:
  httpStatus:
  redirectTarget:
  authenticated:
  accountPlan:
  region:
  locale:
  viewport:
  browserVersion:
  rolloutCohort:
  contentHash:
  screenshotHash:
  archiveUri:
  triageState:
  linkedClaimIds: []
  linkedRegistryIds: []
```

`eventDate` reste `null` lorsqu’aucune date officielle de lancement n’est connue.

### 3.3 Scan du 20 juillet 2026

Le scan joint est traité comme une **collecte brute à normaliser** :

- 20 routes listées ;
- 21 tentatives HTTP, car `/signup` a été tenté deux fois ;
- 19 réponses HTTP 200 ;
- 2 blocages Cloudflare sur `/signup` ;
- 16 empreintes de capture distinctes selon le tableau ;
- aucun compte créé ; le sujet observé est un **visiteur anonyme** ;
- les captures et le manifeste doivent être présents et validés dans le dépôt avant passage à `LIVE_ANONYMOUS`.

Les quinze éléments N1–N15 restent `OBS-DELTA-20260720-*` jusqu’à leur classification. Ils ne sont pas additionnés mécaniquement aux surfaces historiques.

### 3.4 Prix et entitlements

```yaml
PriceObservation:
  planId:
  amount:
  currency:
  cadence: MONTHLY | ANNUAL_EFFECTIVE
  locale:
  countryOrGeo:
  authenticated:
  cookieCohort:
  observedAt:
  sourceUrl:
  screenshotHash:
  textHash:
```

La page officielle consultée pendant cette révision expose actuellement Core à 25 dollars mensuels / 20 dollars effectifs annuels et Pro à 100 dollars mensuels / 95 dollars effectifs annuels, tandis que le scan joint rapporte d’autres montants. Cette divergence est conservée comme observation, non résolue par supposition. `RATE_CARD.json` E‑Code reste une décision indépendante et versionnée.

---

## 4. Parcours de création Replit 2026

### 4.1 Intentions publiques observées

La page publique expose neuf intentions :

```text
WEBSITE
MOBILE
DESIGN
SLIDES
ANIMATION
DATA_VISUALIZATION
GAME_3D
DOCUMENT
SPREADSHEET
```

Une `CreationIntent` guide Agent ; elle ne détermine pas à elle seule le type de ressource stockée ou publiable.

### 4.2 Voies de création

1. Prompt → Agent.
2. Import depuis une source compatible.
3. Gallery → Use Template / Remix.
4. `Empty`, comme entrée du hub Import pour un projet sans Agent ni scaffolding.
5. Custom Templates d’organisation, conditionnés à Enterprise.

Les anciens starter templates par langage/framework sont `RETIRED_CONFIRMED`. `/templates` et `/developer-frameworks` pointent vers la Gallery.

---

## 5. Modèle produit : Project, Artifacts, assets, composants et releases

### 5.1 Entités

```text
Project
├── Artifact[*]
│   ├── ArtifactRevision[*]
│   └── Component[*]
├── GeneratedAsset[*]
├── SharedBackendBinding
├── SharedDataBinding
├── SharedStorageBinding
├── ProjectRevision[*]
└── ProjectRelease[*]
```

### 5.2 Taxonomie canonique

```text
ArtifactKind ∈ {
  WEB_APP,
  MOBILE_APP,
  DATA_VISUALIZATION,
  SLIDE_DECK,
  ANIMATION_VIDEO,
  DESIGN,
  EXPERIENCE_3D
}
```

```text
GeneratedAssetKind ∈ {
  DOCUMENT,
  SPREADSHEET,
  CSV,
  PDF,
  MARKDOWN,
  IMAGE,
  PRESENTATION_FILE,
  OTHER_FILE
}
```

```text
ComponentKind ∈ {
  WEB_FRONTEND,
  API,
  SERVICE,
  WORKER,
  JOB,
  SHARED_PACKAGE,
  STATIC_SITE_COMPONENT
}
```

```text
DeploymentType ∈ {
  AUTOSCALE,
  STATIC,
  RESERVED_VM,
  SCHEDULED
}
```

`SERVICE`, `JOB` et `STATIC_SITE_COMPONENT` ne sont pas des Artifacts Replit. `DOCUMENT` et `SPREADSHEET` sont des intentions de création et des assets générés tant qu’une publication autonome n’est pas prouvée.

### 5.3 Règles actuelles de parité

- jusqu’à 7 Artifacts par projet ;
- au plus une app mobile ;
- backend, données et services partagés ;
- chaque Artifact publiable reçoit sa propre URL ;
- publication groupée de tout le projet ;
- publication indépendante d’un Artifact non disponible actuellement.

Ces limites sont des `Entitlement` configurables, jamais des contraintes de stockage codées en dur.

### 5.4 Release groupée

```yaml
ProjectRelease:
  projectRevisionDigest:
  artifactRevisionDigests: []
  sharedBackendRevision:
  environmentLockDigest:
  databaseMigrationSetVersion:
  publicationMode: GROUPED
  deploymentRevisionIds: []
```

---

## 6. Project Editor et surfaces IDE

### 6.1 Modèle de layout confirmé

```text
Window → Pane → Tab → ToolInstance
```

- Windows répartissables sur plusieurs écrans ;
- panes horizontaux/verticaux, redimensionnables, réordonnables et flottants ;
- un tab contient un outil ;
- layout persisté par utilisateur et projet.

### 6.2 Outils actuellement documentés

Au minimum :

- File tree ;
- éditeur de fichier ;
- Tools dock et All tools ;
- Run/Stop ;
- Spotlight ;
- Options ;
- Search bar ;
- Resources ;
- Preview ;
- Preview DevTools : Console, Elements, Network, Resources, Settings ;
- responsive testing ;
- Console ;
- Shell ;
- Git ;
- File History ;
- Checkpoints ;
- Secrets ;
- Workflows ;
- ports ;
- Database ;
- App Storage ;
- Publishing ;
- Security Centers.

Le scan du 20 juillet doit reclasser Spotlight, Resources, Preview DevTools et Library de `SANS_TRACE` vers `DOC_CURRENT`.

### 6.3 Univers des surfaces

`P001–P159` reste un **inventaire historique de candidats**, pas encore un univers canonique certifié. Les deltas N1–N15 ne deviennent pas automatiquement `P160–P174`.

```yaml
SurfaceUniverseStatus:
  rawLegacyCandidateIds: P001-P159
  rawLiveDeltaObservationIds: OBS-DELTA-20260720-N01..N15
  canonicalSurfaceCount: null
  classificationComplete: false
  deduplicationComplete: false
```

`registryUniverseReady` reste rouge jusqu’à classification et déduplication.

---

## 7. Agent, tâches, Canvas et collaboration

### 7.1 Capacités confirmées

- Agent 4 ;
- prompt-first ;
- Plan Mode ;
- Lite, Economy, Power ;
- App Testing, High effort et Turbo ;
- Max mode retiré ;
- Task Board et tâches isolées ;
- plusieurs threads Agent ;
- parallel tasks selon entitlement ;
- skills ;
- `replit.md` et instructions ;
- web search ;
- génération d’images, audio, vidéo et expériences 3D ;
- Connectors ;
- MCP ;
- Canvas infini ;
- Visual Editor ;
- multiple Artifacts ;
- collaboration et live cursors.

### 7.2 Limites de formulation

- Parallel Agents est une capacité produit confirmée.
- Le runtime d’isolation exact de chaque tâche parallèle reste `UNKNOWN` ; ne pas écrire « chaque tâche = microVM » sans source dédiée.
- Aucun sélecteur de modèle n’a été observé sur les pages publiques et docs courantes consultées. L’interface authentifiée par plan reste à vérifier.
- Les mappings mode→modèle sont des détails E‑Code versionnés et invisibles à l’utilisateur.

### 7.3 Architecture E‑Code Agent

```text
Conversation
→ Plan (optionnel)
→ AgentRun
→ Tool Broker
→ Task/Fork isolé
→ Tests
→ Proposition
→ Approval selon policy
→ Apply atomique
→ Checkpoint
```

Le Tool Broker est l’unique porte de mutation. Toute action longue possède budget, idempotency key, timeout, cancel et cleanup.

---

## 8. Gallery, Community et Expert Network

### 8.1 Gallery

Surfaces canoniques candidates :

- Gallery Home ;
- recherche, catégories, filtres ;
- Listing Detail ;
- View App ;
- Use Template / Remix ;
- Submission Intake externe ;
- Report ;
- provenance et attribution.

Les nombres de résultats, vues et usages sont des valeurs d’observation, jamais des constantes normatives.

`Submit your App` pointe actuellement vers un formulaire externe Typeform. Aucun workflow de self-publish in-product n’est confirmé.

### 8.2 Remix

```text
SNAPSHOT_PINNED
→ CREDENTIALS_DETACHED
→ SOURCE_SANITIZED
→ CLONING
→ DB_POLICY_APPLIED
→ STORAGE_POLICY_APPLIED
→ SCANNING
→ INDEXING
→ READY
```

États latéraux : `CANCELLED`, `QUARANTINED`, `ROLLING_BACK`, `CLEANUP_PENDING`, `EXPIRED`.

Invariants :

- aucune valeur de secret dans fichiers, historique, logs, DB, jobs ou objets clonés ;
- provenance immuable ;
- licence et consentement versionnés ;
- PII masquées ou consentement explicite ;
- aucun partage cross-CloudTenant par défaut.

### 8.3 Community

Le Community Hub et l’entrée « Claim your Community Profile » sont confirmés. `CommunityProfile` couvre visibilité, activité, projets épinglés, stats, ranking éventuel, modération et entitlement.

Le test d’une route précise `/@mattpalmer` derrière login ne permet pas de conclure que toutes les routes `/@user` ont disparu. Ce comportement global reste à mesurer.

### 8.4 Expert Network

`/bounties` redirige actuellement vers le réseau d’experts Replit hébergé par Contra.

```yaml
ExternalEcosystemEntry:
  legacyRoute: /bounties
  currentLabel: Expert Network
  provider: Contra
  behavior: EXTERNAL_REDIRECT
  legacyDataOrBackendState: UNKNOWN
```

---

## 9. Imports

### 9.1 Registre de providers

Le hub courant documente douze entrées :

- GitHub ;
- Bitbucket ;
- Vercel ;
- Figma ;
- Claude Design ;
- Bolt ;
- Lovable ;
- Base44 ;
- ZIP ;
- Spreadsheet ;
- Previous Agent export ;
- Empty.

GitLab est une capacité Git confirmée par la documentation et le changelog, mais n’est pas une tuile de cette table courante.

```yaml
ImportProviderEntry:
  providerId:
  capabilityStatus:
  hubTileVisible:
  authenticatedEntryPoint:
  sourceType:
  authMethod:
  migrationUsesAgentCredits:
  supportedInputs: []
  excludedData: []
  lastVerifiedAt:
```

La capture d’écran est une pièce jointe au prompt/Canvas, pas un provider structurel d’import.

### 9.2 Machine à états

```text
RECEIVED
→ STAGING_ISOLATED
→ SCANNING
→ QUARANTINED
→ AWAITING_USER_ACTION
→ COMMITTING
→ COMMITTED
```

États latéraux : `ROLLING_BACK`, `EXPIRED`, `CANCELLED`, `FAILED`.

Invariants :

- staging jetable sans montage du workspace cible ;
- aucune suppression silencieuse ;
- commit atomique uniquement après consentement ;
- path traversal, symlinks, hardlinks, archive bomb et MIME réel contrôlés ;
- LFS, submodules, signatures, OAuth, révocation et rate limits traités ;
- findings exportables et procédure d’appel ;
- crédits réservés idempotemment avant migration Agent ;
- compensation sur échec.

---

## 10. Données, stockage, Auth et intégrations

### 10.1 Database

Contrat produit :

- base de développement et base de production séparées ;
- l’Agent peut modifier DEV ;
- l’Agent n’écrit jamais PROD ;
- migrations de schéma au publish ;
- remix clone ou reconstruit DEV selon policy ;
- provider de production abstrait ;
- backup et validation avant migration destructive ;
- forward-fix explicite ;
- aucune promesse de rollback de données via un simple redeploy d’image.

### 10.2 App Storage

App Storage est basé sur GCS et peut être relié à plusieurs apps du même compte selon grants.

```text
RemixStoragePolicy = DETACH | CLONE | SHARE_WITH_CONSENT
```

E‑Code v1 interdit `SHARE_WITH_CONSENT` entre CloudTenants.

### 10.3 Auth

Replit Auth et Clerk Auth sont deux produits distincts.

- la migration documentée actuelle couvre un système d’auth custom vers Clerk ;
- le chemin Replit Auth → Clerk n’est pas considéré livré sans source actuelle explicite ;
- plateformes, apps publiées et utilisateurs finaux ont des identités séparées ;
- E‑Code peut ajouter MFA/passkeys/orgs comme extensions, sans les présenter comme parité Clerk actuelle.

### 10.4 MCP et API

Le Replit MCP Server est une intégration développeur en bêta, transport Streamable HTTP, OAuth et trois outils documentés. Il ne prouve ni l’existence ni l’absence d’une API publique générale.

```yaml
PublicApiStatus: UNKNOWN
McpServerStatus: DOC_CURRENT_BETA
```

### 10.5 Connectors

Connectors, Replit AI Integrations et Warehouse Connectors vivent dans `CONNECTOR_REGISTRY`, avec provider, scope, auth, entitlement, disponibilité et preuve. Ils ne deviennent pas chacun une surface par défaut.

---

## 11. Plans, pricing et entitlements

### 11.1 Plans commerciaux courants

Les labels publics courants sont : Starter, Core, Pro et Enterprise. Le plan Teams commercial a été remplacé par Pro. Les capacités de collaboration en équipe, elles, restent actives.

### 11.2 Principes

- prix et crédits dans `RATE_CARD.json`, jamais en dur ici ;
- chaque observation porte geo, cadence, locale et cohort ;
- entitlements dans `OFFERING_ENTITLEMENT_REGISTRY` ;
- aucune UI ne devient source de vérité de billing ;
- le backend applique les limites ;
- toute modification de plan est versionnée et auditable.

### 11.3 Starter

Actuellement documenté :

- crédits Agent quotidiens ;
- crédits cloud mensuels ;
- Lite build ;
- une app publiée ;
- expiration du lien après 30 jours ;
- badge avec lien de parrainage ;
- Plan Mode, connecteurs et Artifacts supplémentaires conditionnés à Core.

La documentation et le marketing ne s’alignent pas parfaitement sur certains détails d’accès privé et de types de création. Ces entitlements sont `AUTHENTICATED_LIVE_REQUIRED` avant reproduction exacte.

### 11.4 Ledger E‑Code

- double entrée ;
- decimal exact ;
- `UsageReservation` ;
- `UsageEvent` immuable ;
- compensation plutôt que mutation ;
- `RateCardVersion` ;
- budgets, taxes, FX, proration, refunds et chargebacks ;
- rapprochement GCP + PSP + ledger ;
- hard limits aux frontières sûres.

L’ancien système de crédits E‑Code et le nouveau ledger doivent faire l’objet d’une décision de migration explicite.

---

## 12. Publishing, releases et rollback

### 12.1 Contrats visibles

- Autoscale ;
- Static ;
- Reserved VM ;
- Scheduled ;
- domaines ;
- monitoring ;
- logs ;
- analytics ;
- machine configuration ;
- access controls ;
- Security Scanner ;
- Feedback ;
- SEO ;
- historique et redeploy.

Le backend Google exact de chaque contrat produit Replit n’est pas supposé lorsque non public.

### 12.2 Pipeline E‑Code

```text
ProjectRevision + locks
→ policy/security gates
→ build hermétique isolé
→ image OCI signée ou bundle statique
→ staging Artifact Registry
→ promotion par digest + métadonnées
→ DeploymentRevision
→ health/canary
→ route atomique
→ ACTIVE ou compensation
```

Le pod de développement vivant n’est jamais la source directe de vérité.

### 12.3 ReleaseManifest

```yaml
ReleaseManifest:
  sourceRevisionDigest:
  artifactRevisionDigests: []
  runtimeImageDigest: null
  staticBundleDigest: null
  environmentLockDigest:
  runtimeConfigDigest:
  secretPolicy:
  secretVersionRefs: []
  accessPolicyVersion:
  domainRouteVersion:
  dbMigrationSetVersion:
  dbCompatibilityState:
  sbomDigest:
  provenanceDigest:
  signatures: []
  retentionRoots: []
```

### 12.4 Rollback

- fail-closed si digest ou politique de secret indisponible ;
- recréation depuis le manifeste même si la révision Cloud Run a été supprimée ;
- DB jamais supposée inversée ;
- image et métadonnées retenues ensemble ;
- GC après zéro référence et expiration ;
- legal hold et pin utilisateur ;
- preuve UI obligatoire via Publishing → History → redeploy pour la parité visible.

---

## 13. Architecture E‑Code sur Google Cloud

### 13.1 Plans d’architecture

```text
Clients Web / Desktop / Mobile
        │
Identity + API Gateway/BFF + Realtime
        │
Control Plane
├─ Project / Artifact / Release
├─ Workspace / Sandbox
├─ Agent / Tool Broker / Tasks
├─ Runtime Catalog / Nix Environment Compiler
├─ Build / Publish / Promotion
├─ CloudTenant / Project Factory
├─ Billing / Entitlements / Ledger
├─ Security / Policy / Audit
└─ Observability / Support / Incident
        │
Data planes
├─ Development: GKE + gVisor, POC GKE Agent Sandbox
├─ Build: builders isolés + Artifact Registry
├─ Production dynamic: Cloud Run adapters
├─ Static: object storage + CDN/LB
├─ Scheduled: jobs adapter
└─ Data: DB, object storage, secrets
```

### 13.2 CloudTenant

```yaml
CloudTenant:
  id:
  customerBoundaryType: PERSON | WORKSPACE | LEGAL_ENTITY | BILLING_ACCOUNT
  billingPrincipalId:
  legalEntityId:
  ownershipVersion:
  residencyPolicy:
  lifecycle:

CloudProjectBinding:
  cloudTenantId:
  gcpProjectNumber:
  role: PRIMARY | REGION_SHARD | QUOTA_SHARD | MIGRATION_TARGET
  region:
  state:
  quotas:
  billingLabels:
  reputationTier:
  reconciliationStatus:
  deletionState:
```

Invariants : aucun projet partagé entre CloudTenants ; transfert = révocation puis réattribution ; cardinalité 1→N ; sharding par policy.

Google recommande actuellement un projet par tenant pour les plateformes Cloud Run exécutant du code non fiable, un pool de projets précréés, un LB global avec Service Extensions et une séparation par réputation/billing. Ce sont des recommandations d’architecture E‑Code, pas une description complète de l’interne Replit.

### 13.3 Project Factory

```text
REQUESTED
→ ALLOCATING_PROJECT
→ BILLING_LINKED
→ APIS_ENABLING
→ SERVICE_AGENTS_READY
→ IAM_BOUND
→ SECURITY_BASELINE_APPLIED
→ EDGE_READY
→ ACTIVE
```

États latéraux : `BILLING_SUSPENDED`, `QUOTA_EXHAUSTED`, `DRIFT_DETECTED`, `DELETE_REQUESTED`, `RECOVERY_WINDOW`, `PURGING`, `PURGED`, `RESTORING`.

### 13.4 IAM

- `BuildIdentity` ;
- `PromotionIdentity` ;
- `RuntimeIdentity` par app × environnement × frontière de privilège ;
- Workload Identity Federation for GKE pour workloads GKE ;
- IAM WIF externe pour workloads hors Google Cloud ;
- service identity Cloud Run ;
- impersonation courte durée ;
- zéro clé persistante.

### 13.5 Artifact Registry

```text
PROMOTION_PREPARED
→ IMAGE_COPIED_BY_DIGEST
→ REFERRERS_DISCOVERED
→ METADATA_COPIED
→ TARGET_SIGNATURE_VERIFIED
→ TARGET_POLICY_VERIFIED
→ PROMOTION_COMMITTED
```

Les attachments restent Preview ; prévoir fallback ORAS/referrers, Container Analysis/Binary Authorization et exit strategy. Supprimer l’image cible peut supprimer les attachments : rétention couplée obligatoire.

### 13.6 Edge et multi-région

- ingress internal-and-cloud-load-balancing ;
- URL `run.app` par défaut désactivée lorsque compatible ;
- External Application Load Balancer ;
- Cloud Armor ;
- Certificate Manager ;
- Access Gateway avant cache ;
- auth fail-closed ;
- tests actifs du bypass ;
- Cloud Run service health GA depuis le 29 juin 2026 pour failover/failback ;
- stratégie applicative séparée pour données, sessions, readiness et dépendances régionales.

### 13.7 Sandboxes 2026

POC, pas décision automatique :

- gVisor actuel ;
- GKE Agent Sandbox ;
- Cloud Run sandboxes en Preview pour outils/agents ;
- option microVM si mesures de sécurité, coût, performance et opérations le justifient.

Aucun objet produit ne dépend directement d’un Pod Kubernetes concret ; il dépend d’un `SandboxRuntime` abstrait.

---

## 14. Runtime Nix multi-langage

### 14.1 Décision E‑Code

- nixpkgs 26.05 à une révision exacte ;
- version Nix pinnée ;
- store plateforme partagé à `/nix`, lecture seule ;
- aucune DB Nix ou écriture de store dans le PVC utilisateur ;
- catalogue signé ;
- compilateur d’environnement central ;
- bundles d’activation dev/build/runtime ;
- `ecode.nix` déclaratif restreint ;
- `ecode.lock.json` comme source de vérité ;
- aucun daemon Nix dans les workspaces ;
- aucun build de paquet système Nix dans les workspaces ;
- multi-zone avant activation Python par défaut ;
- rétention par références après le premier utilisateur ;
- taille et coût mesurés.

### 14.2 Promesse exacte

> Aucun téléchargement ni build de paquet système Nix dans le workspace. L’activation utilise une génération préconstruite et est soumise à un SLO mesuré.

Les dépendances uv/npm/Cargo/Go/Maven peuvent être téléchargées et compiler.

### 14.3 Preuves obligatoires

- package présent ;
- package absent, échec immédiat ;
- wrappers/env/headers/pkg-config ;
- extension native Python ;
- monorepo Python + Node ;
- publish utilisant ffmpeg/ImageMagick ;
- perte d’une zone ;
- aucun hidden store dans `$HOME` ;
- egress Nix coupé.

---

## 15. Checkpoints, stockage et cohérence

Un Pod snapshot GKE ne checkpoint pas les volumes persistants. Un checkpoint projet est coordonné :

```text
PREPARING
→ QUIESCING
→ BARRIER_ESTABLISHED
→ VOLUME_SNAPSHOTTING
→ DB_SNAPSHOTTING
→ OPTIONAL_POD_SNAPSHOTTING
→ VERIFYING
→ COMMITTED
```

Échecs : `ABORTING`, `CLEANED`, `MANUAL_INTERVENTION`.

Le manifeste déclare :

- `consistencyLevel` : crash/application/transaction ;
- `logicalBarrierId` ;
- snapshots volume/DB/pod ;
- runtime generation ;
- key versions ;
- hashes ;
- restore compatibility ;
- expiration.

Quiesce avec timeout et dégel garanti. Un Pod snapshot seul n’est jamais nommé checkpoint projet.

---

## 16. Sécurité, conformité, opérations et DR

Invariants non négociables :

1. aucune valeur de secret dans prompts, logs, traces, captures, exports ou clones ;
2. aucune permission sensible appliquée uniquement côté client ;
3. aucun tenant dans un index partagé sans filtre serveur ;
4. aucune mutation Agent sans checkpoint ou compensation prouvée ;
5. aucune migration destructive sans backup et forward-fix ;
6. aucun build/release partiel rendu actif ;
7. aucun tag mutable comme racine de release ;
8. aucun package non approuvé traversant le Package Firewall ;
9. aucune URL de preview permanente sans scope, expiration et révocation ;
10. aucun hard limit provoquant une corruption ;
11. aucun client mobile/desktop contournant les API et policies web ;
12. toute suppression possède tombstone, fenêtre de récupération, purge et preuve d’effacement.

`SECURITY_PRIVACY_COMPLIANCE.md` couvre threat model, data map, rétention, résidence, DPA, sous-traitants, legal holds, export/suppression, DMCA, licences, modération et shared responsibility.

`OPERATIONS_DR.md` couvre SLO, error budgets, alertes, on-call, RPO/RTO, backups, restore drills, chaos, perte de zone/région, capacité et coûts.

---

## 17. Preuves E2E et gates

### 17.1 Schéma de preuve

```yaml
Evidence:
  evidenceId:
  commit:
  environment:
  observedAt:
  accountId:
  accountPlan:
  browser:
  os:
  viewport:
  steps: []
  expected:
  observed:
  screenshots: []
  video: null
  logs: []
  traceId:
  buildId:
  releaseId:
  finalUrl:
  artifactHashes: []
  reproductionCommand:
  regressionTest:
```

### 17.2 Parcours vertical

Créer → modifier → exécuter → Preview → Publish → observer → rollback.

Chaque étage exige le vrai client lorsque le contrat est visuel. Une preuve API ne satisfait pas un gate UI.

### 17.3 Niveaux calculés

| Niveau | Condition |
|---|---|
| `documentReconciled` | plan unique, sans contradiction connue, taxonomie correcte |
| `sourceBaselineReady` | claims ancrés, snapshots/hash valides, sources fraîches, triage SLA |
| `registryUniverseReady` | observations classifiées, surfaces dédupliquées, registres exacts, aucune référence orpheline |
| `contractsPresent` | tous les contrats requis existent |
| `contractsValidated` | schémas, reviewers, tests négatifs et compatibilité validés |
| `implementationReady` | aucune capacité P0 ouverte/bloquée |
| `verticalBackendReady` | services réels et preuves backend reproductibles |
| `verticalUserJourneyReady` | vrai client pour l’intégralité du parcours vertical |
| `betaReady` | tenancy, IAM, Nix multi-zone, billing minimal, rollback permanent, supply chain, observabilité et restore drills |
| `publicLaunchReady` | bêta + juridique/ops/billing live + P0 clos |
| `parityBaselineReady` | univers public daté évalué et DONE/NA justifié |

### 17.4 Statut à recalculer après ce correctif

```yaml
overallStatus: NOT_APPROVED
highestPassedLevel: documentReconciled
sourceBaselineReady: false
registryUniverseReady: false
contractsPresent: NOT_VERIFIED_IN_THIS_REVIEW
contractsValidated: false
implementationReady: false
verticalBackendReady: NOT_VERIFIED_IN_THIS_REVIEW
verticalUserJourneyReady: false
betaReady: false
publicLaunchReady: false
parityBaselineReady: false
```

---

## 18. Décisions propriétaire déjà actées

| ID | Décision |
|---|---|
| D1 | Réconcilier le split-brain Git via une procédure contrôlée, sans réécriture aveugle |
| D2 | Rendre le rollback par digest permanent, fail-closed |
| D3 | GO pour Nix multi-zone, coût réel mesuré |
| D4 | Billing minimal sûr avant connecteurs payants, puis lots |
| D5 | Compte E2E dédié + Playwright, pas dépendance au Chrome personnel |
| D6 | Validation post-hoc de TPL-02 si captures conformes ; gate déplacé au merge/release/live |
| Tracking | Fichiers de suivi générés depuis les registres |

La décision Gallery Option B doit garder son contenu exact et sa citation propriétaire ; aucune case `DECIDED` si le contenu manque.

---

## 19. Corrections P0 issues du scan du 20/07

| ID | Correction | Gate |
|---|---|---|
| P0-LS-01 | Corriger « nouveau compte » en visiteur anonyme | sourceBaselineReady |
| P0-LS-02 | Corriger 21 tentatives / 20 routes / 19 HTTP 200 / 16 hashes distincts | sourceBaselineReady |
| P0-LS-03 | Joindre et valider le paquet complet d’evidence du scan | sourceBaselineReady |
| P0-LS-04 | Reclasser GitLab comme capacité supportée sans tuile courante | registryUniverseReady |
| P0-LS-05 | Corriger Artifact/Asset/Component/Deployment taxonomy | documentReconciled |
| P0-LS-06 | Classifier N1–N15 par registre spécialisé | registryUniverseReady |
| P0-LS-07 | Supprimer l’addition automatique 159+15=174 | registryUniverseReady |
| P0-LS-08 | Reclasser Spotlight, Resources, Preview DevTools, Library, Android Emulator, Grouped Publish | sourceBaselineReady |
| P0-LS-09 | Corriger MCP ≠ preuve de remplacement d’API | sourceBaselineReady |
| P0-LS-10 | Limiter l’inférence sur `/@user` | sourceBaselineReady |
| P0-LS-11 | Reclasser `/bounties` comme redirect Expert Network | sourceBaselineReady |
| P0-LS-12 | Distinguer plan Teams retiré et capacités d’équipe | sourceBaselineReady |
| P0-LS-13 | Contextualiser les prix et mesurer les divergences | sourceBaselineReady |
| P0-LS-14 | Limiter « no model selector » au corpus observé | sourceBaselineReady |
| P0-LS-15 | Retirer le lien non prouvé Parallel Agents = microVM par tâche | sourceBaselineReady |
| P0-LS-16 | Corriger generatedAt et recalculer après merge | documentReconciled |
| P0-LS-17 | Réconcilier 174/159, 16/174/0/159, 114/99, surfaces total 10 | registryUniverseReady |
| P0-LS-18 | Recalculer APPROVAL_STATUS sur le commit mergé | tous niveaux |

---

## 20. Ordre d’exécution

1. Remplacer le plan canonique par cette version corrigée.
2. Ajouter les P0-LS au registre avec owner, date et critère de clôture.
3. Importer le paquet complet du scan et valider tous les hashes.
4. Corriger les observations GitLab, Teams, Experts, `/@user`, MCP et prix.
5. Créer les registres spécialisés manquants.
6. Classifier/dédupliquer N1–N15 ; calculer seulement ensuite le nombre canonique de surfaces.
7. Refaire le scan documentaire des faux `SANS_TRACE`.
8. Exécuter un scan authentifié avec un compte de test légitime sur Starter, Core et Pro au minimum.
9. Recalculer les entitlements et prix par cohorte.
10. Ancrer les claims historiques encore non hashés.
11. Faire relire/valider les contrats par reviewers réels.
12. Fermer les gates bêta déjà connues : Git, rollback Helm, Nix multi-zone, promotion AR live, CloudTenant/IAM, billing minimal, preuves UI.
13. Régénérer `APPROVAL_STATUS.json`, `PARITY_STATUS.md` et `DOCUMENT_MANIFEST.yaml` au commit mergé.

---

## 21. Sources officielles de référence

### Replit

- https://replit.com/
- https://replit.com/pricing
- https://replit.com/gallery
- https://replit.com/community
- https://replit.com/bounties
- https://docs.replit.com/features/project-setup/developer-frameworks
- https://docs.replit.com/build/import-from-providers
- https://docs.replit.com/updates/2025/11/16/changelog
- https://docs.replit.com/features/projects-and-artifacts/projects
- https://docs.replit.com/features/projects-and-artifacts/artifacts
- https://docs.replit.com/references/projects-and-artifacts/multiple-artifacts-vs-projects
- https://docs.replit.com/features/agent/overview
- https://docs.replit.com/features/agent/agent-modes
- https://docs.replit.com/features/editor/editor-and-tools
- https://docs.replit.com/features/editor/preview
- https://docs.replit.com/features/artifact-types/building-mobile-apps
- https://docs.replit.com/platforms/mcp-server
- https://docs.replit.com/billing/plans/starter-plan
- https://docs.replit.com/billing/teams-billing/overview
- https://docs.replit.com/features/auth-and-identity/clerk-auth
- https://docs.replit.com/features/auth-and-identity/clerk-auth-migration

### Google Cloud

- https://cloud.google.com/run/docs/securing/multi-tenant
- https://cloud.google.com/run/docs/release-notes
- https://cloud.google.com/run/docs/configuring/configure-service-health
- https://cloud.google.com/run/docs/configuring/services/sandboxes
- https://cloud.google.com/artifact-registry/docs/manage-metadata-with-attachments
- https://cloud.google.com/kubernetes-engine/docs/concepts/workload-identity
- https://cloud.google.com/kubernetes-engine/docs/concepts/pod-snapshots
- https://cloud.google.com/resource-manager/docs/limits

---

## 22. Limite de certification

Ce plan constitue la version normative corrigée à transmettre à l’agent maître. Il ne certifie ni l’implémentation, ni les artefacts de preuve non joints, ni la totalité des rollouts privés Replit. La prochaine approbation ne doit pas porter sur « le plan est complet », mais sur un niveau calculé précis : baseline sourcée, registres classifiés, contrats validés, vertical UI, bêta ou lancement public.

---

# ANNEXE E-CODE — CE QUI EST DÉJÀ CONSTRUIT DANS NOTRE CODE (overlay)

Cette annexe est ajoutée par E-Code PAR-DESSUS le plan corrigé de l'expert
(sections 0–22 ci-dessus, reprises verbatim — aucun mot modifié hors bandeau
de tête, écarts consignés au `CHANGELOG_AUDIT.md`). Elle rattache l'overlay
code SANS toucher aux sections de l'expert.

## A.1 Overlay code réel + héritage bolt (exigence propriétaire)

Les 159 candidats historiques `P001–P159` (§6.3 : inventaire de candidats,
pas univers certifié) ont été croisés un par un avec le code réel
(`app/routes/*`, `app/components/*`, `services/api/src`, `E2E_PROOFS.yaml`,
`docs/deploy-evidence/`) et les 5 inventaires bolt, par 6 agents
d'exploration (2026-07-20). Résultat, entrée par entrée dans
`SURFACE_REGISTRY.yaml` (`builtState` + `codeRefs` + note) :

- **79 DÉJÀ CONSTRUIT** (route + code branché, preuve quand elle existe)
- **43 PARTIELS** (présent mais non câblé, factice ou non prouvé — règle :
  un composant bolt non branché = PARTIEL, jamais « fait »)
- **37 NON FAITS**

Compteur généré : `APPROVAL_STATUS.json → surfaceUniverse.builtStates`.
Le plan ne marque plus « à faire » ce qui est déjà construit — ni l'inverse.

## A.2 État calculé réel (recalcul du §17.4, généré — jamais saisi ici)

Le §17.4 de l'expert donne le statut ATTENDU après correctif ; le recalcul
RÉEL vit dans `APPROVAL_STATUS.json` (drift-check CI) et est résumé dans
`PARITY_STATUS.md` (vue générée). Au commit de cette adoption :
`overallStatus: NOT_APPROVED` · `highestPassedLevel: documentReconciled` ·
`registryUniverseReady: FAIL` (classification N1–N15 et déduplication de
l'univers NON terminées, exactement comme §6.3 l'exige) · paquet de preuves
du scan PRÉSENT dans le dépôt (`docs/parity/livescan-2026-07-20/`,
69 fichiers, manifest 21 entrées).

## A.3 Registres d'application

Les corrections P0-LS-01…18 du §19 sont tracées individuellement dans
`P0_REGISTRY.yaml` (owner, date, critère de clôture, statut honnête), la CI
casse si une manque. Les exigences propriétaire hors-scan restent tracées :
`P0-B-01` (overlay code, ci-dessus) et `P0-B-02` (scan authentifié des
`UNK-LS-*`, session dédiée). L'ancienne numérotation P0-LS d'E-Code
(2026-07-20 matin) est SUPERSÉDÉE par celle de l'expert — mapping au
changelog.
