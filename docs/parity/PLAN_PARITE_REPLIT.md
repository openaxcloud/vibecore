# PLAN DE PARITÉ PRODUIT REPLIT — plan canonique exécutable

> **DESTINATION UNIQUE : `docs/parity/PLAN_PARITE_REPLIT.md`.**
> Ce fichier devient le plan canonique uniquement après copie atomique vers ce
> chemin, merge sur la branche principale, génération du manifeste documentaire
> et succès des contrôles CI. Il ne doit exister aucun plan actif concurrent
> (`_v6`, `_FINAL`, copie racine ou annexe parallèle). Toute correction se fait
> **par remplacement dans ce fichier** ; les raisons et supersessions vont dans
> `CHANGELOG_AUDIT.md`.

---

## 0. Métadonnées, activation et frontière de certification

```yaml
schemaVersion: 3
planVersion: 2026-07-20.4
canonicalPath: docs/parity/PLAN_PARITE_REPLIT.md
baselineObservedThrough: "2026-07-20"
statusSource: docs/parity/APPROVAL_STATUS.json
manifestSource: docs/parity/DOCUMENT_MANIFEST.yaml
implementationStateSource: docs/parity/IMPLEMENTATION_STATUS.yaml
stateEmbeddedInPlan: false
repositoryStateEmbeddedInPlan: false
activationRule: >
  Le document est canonique seulement après merge sur main, génération du
  DOCUMENT_MANIFEST au commit mergé, validation des registres et succès CI.
certificationBoundary: >
  Parité produit observable sur une baseline publique datée, plus les décisions
  E-Code explicitement étiquetées. L'infrastructure privée complète de Replit
  n'est pas publiquement observable et n'est jamais déclarée copiée.
```

Le plan est **normatif**. Il ne contient ni statut d'implémentation saisi à la
main, ni compteur de preuves, ni conclusion d'audit temporaire. Les états
courants sont générés depuis les registres et le commit réellement mergé.

### 0.1 Manifeste documentaire

`DOCUMENT_MANIFEST.yaml`, généré après merge, contient au minimum :

```yaml
DocumentManifestEntry:
  documentPath:
  blobSha256:
  generatedFromCommit:
  mergedCommit:
  registryCommit:
  generatorCommit:
  sourceSnapshotHashes: []
  generatedAt:
  reviewer:
  validationRunId:
```

Les champs de commit ne sont jamais auto-référentiels dans le Markdown. Un
fichier non présent au commit indiqué, un hash non reproductible ou une vue
générée modifiée manuellement fait échouer la validation.

### 0.2 Règle d'exécution

L'agent maître ne doit pas « compléter une annexe » dans ce plan. Il doit :

1. maintenir ce document comme contrat normatif unique ;
2. écrire l'état réel dans `IMPLEMENTATION_STATUS.yaml` ;
3. relier chaque état à un commit, un work item et, pour `PROVEN`, une preuve ;
4. régénérer les vues humaines depuis les registres ;
5. ne jamais convertir l'existence d'un contrat en capacité implémentée.

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
10. Une assertion externe non ancrée dans `PUBLIC_BASELINE_REPLIT_2026.yaml` et `SOURCE_REGISTRY.yaml` est `UNKNOWN`, même si son URL apparaît dans une liste de sources.
11. Un état d'implémentation écrit dans le Markdown n'a aucune autorité ; seul l'état généré au commit mergé fait foi.
12. Un nombre de surfaces, services, claims ou work items n'est publiable qu'après classification, déduplication et validation de l'ensemble exact des IDs.

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
- `LEGACY_SOURCE_COVERAGE.yaml`
- `IMPLEMENTATION_STATUS.yaml`
- `DOCUMENT_MANIFEST.yaml`

### 2.3 Contrats structurants obligatoires

Au minimum :

- `DOMAIN_MODEL.md` et schémas JSON versionnés ;
- `IDENTITY_COLLABORATION_CONTRACT.md` ;
- `PROJECT_MANIFEST_SCHEMA.json` ;
- `DEPLOYMENT_TYPES_CONTRACT.md` ;
- `RELEASE_PUBLISH_CONTRACT.md` ;
- `IMPORT_REMIX_CONTRACT.md` ;
- `GALLERY_COMMUNITY_CONTRACT.md` ;
- `RUNTIME_NIX_CONTRACT.md` ;
- `PROJECT_FACTORY_CONTRACT.md` ;
- `IAM_POLICY_BASELINE.md` ;
- `CHECKPOINT_CONTRACT.md` ;
- `BILLING_LEDGER_CONTRACT.md` ;
- `SECURITY_PRIVACY_COMPLIANCE.md` ;
- `OPERATIONS_DR.md`.

La présence du fichier ne suffit pas : schéma, sections requises, reviewer,
références croisées, tests négatifs et compatibilité doivent être validés.

### 2.4 Vues générées

- `APPROVAL_STATUS.json` ;
- `PARITY_STATUS.md` ;
- tableaux de compteurs ;
- résumé de l'overlay E-Code.

Elles sont produites par la CI et ne sont jamais modifiées manuellement.

### 2.5 Historique

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

#### 3.2.1 Contrat d’échec et archive authentifiable

Chaque source capturée avec le statut `OK` produit, en plus de l’artefact lisible,
un enregistrement de réponse `WARC/1.1`. Le WARC lie l’URL finale, le statut HTTP,
la date de capture, la longueur exacte et les empreintes SHA-256 du bloc HTTP et du
payload. Le manifeste lie à son tour le fichier WARC par son nom et son SHA-256.
Le gate quotidien relit les octets du payload et refuse toute longueur, cible,
empreinte ou donnée terminale incohérente.

Une navigation Playwright n’est jamais considérée comme réussie au seul motif
qu’elle a retourné du HTML. Le collecteur distingue explicitement `BLOCKED`,
`AUTH_REQUIRED`, `ROUTE_REMOVED`, `INCOMPLETE_RENDER` et `FAILED`. Pour les trois
routes produit obligatoires, le job exige également un texte rendu substantiel
et hashé. Un de ces états empêche le commit du snapshot, tandis que le manifeste,
les logs et le dossier de capture complet restent téléversés avec `if: always()`
pour le diagnostic.

Le contrat est verrouillé hors réseau par
`node --test scripts/parity/collector-ci.node-test.mjs`, avec mutations dédiées
aux cinq pannes P1-A2-13 : blocage bot, hydratation JavaScript incomplète,
apparition d’une authentification, suppression de route et WARC corrompu.

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

Aucun montant n'est conservé dans le plan canonique. Toute valeur observée vit dans `PRICE_OBSERVATION_REGISTRY.yaml` avec contexte complet (date, devise, pays, locale, cadence, cookies, authentification, cohorte et hashes). Une divergence entre deux observations reste ouverte jusqu'à reproduction dans un contexte comparable. `RATE_CARD.json` E‑Code est indépendant de la tarification Replit et versionné.

### 3.5 Gel de baseline par release — anti-boucle d'audit

Chaque release E-Code cible une baseline Replit immuable :

```yaml
BaselineRelease:
  baselineId:
  frozenAt:
  targetEcodeRelease:
  sourceSnapshotIds: []
  claimIds: []
  surfaceUniverseVersion:
  criticalDeltaPolicy:
```

Règles :

- une fois gelée, la baseline d'une release n'est pas réécrite par une nouveauté Replit ordinaire ;
- les nouveaux deltas vont dans la baseline suivante avec work item et triage ;
- seuls un retrait cassant, une vulnérabilité critique, une obligation légale ou une erreur factuelle P0 peuvent rouvrir la baseline courante ;
- le collecteur quotidien continue, mais ne déclenche jamais une réécriture complète du plan ;
- l'approbation `parityBaselineReady` porte toujours un `baselineId` précis.

Cette règle permet d'avancer : le produit poursuit un objectif versionné au lieu de courir indéfiniment derrière une cible mouvante.

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

Le modèle Replit publiquement confirmé porte la relation Project → Artifacts,
le partage backend/données et la publication groupée. E-Code ajoute dès le
premier schéma les frontières d'identité et d'organisation nécessaires à la
collaboration et à l'Enterprise.

```text
User
└── Workspace[*]
    ├── Membership[*]
    ├── Group[*]
    ├── GuestGrant[*]
    └── Project[*]
        ├── ProjectAccessGrant[*]
        ├── ProjectManifest
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

`ProjectManifest` est la source versionnée des relations produit ; la position
accidentelle des fichiers ne fait pas foi.

```yaml
ProjectManifest:
  schemaVersion:
  artifacts: []
  components: []
  workflows: []
  ports: []
  runtimeModules: []
  dataBindings: []
  storageBindings: []
  deploymentScopes: []
  migrations: []
```

Toute migration de manifeste est idempotente, testée en aller/retour lorsque
possible et conserve la compatibilité avec les projets déjà créés.

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

`SERVICE`, `JOB` et `STATIC_SITE_COMPONENT` ne sont pas des Artifacts Replit. `DOCUMENT` et `SPREADSHEET` sont d'abord des intentions de création. Leur sortie est classée selon ce qui est réellement produit : `GeneratedAsset` pour un fichier, ou `Artifact` seulement si la publication autonome de ce type est prouvée. La baseline publique actuelle ne suffit pas à les ajouter à `ArtifactKind`.

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
  projectManifestDigest:
  artifactRevisionDigests: []
  sharedBackendRevision:
  environmentLockDigest:
  accessPolicyVersion:
  databaseMigrationSetVersion:
  publicationMode: GROUPED
  deploymentRevisionIds: []
```

---

## 6. Project Editor et surfaces IDE

### 6.1 Modèle de layout

`DOC_CURRENT` confirme le modèle fonctionnel et ses opérations :

```text
Window → Pane → Tab → ToolInstance
```

- ouverture du Project Editor dans une nouvelle fenêtre ;
- panes ajoutables, déplaçables, maximisables, flottants ou fixes ;
- tabs ouvrables, déplaçables entre panes et fermables ;
- un tab contient un outil.

La documentation publique consultée ne précise pas la portée exacte de
persistance du layout. Ce point reste `UNKNOWN_AUTHENTICATED_LIVE` côté Replit.
`ECODE_DECISION` : E-Code persiste le layout par utilisateur et par projet,
avec migration de schéma, restauration et reset explicite.

### 6.2 Outils actuellement documentés

Au minimum :

- Library sidebar ;
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
   ├─ clean ───────────────→ READY_TO_COMMIT
   └─ blocking findings ──→ QUARANTINED
                              → AWAITING_USER_ACTION
                              → RESCANNING
                              → READY_TO_COMMIT
READY_TO_COMMIT
→ COMMITTING
→ COMMITTED
```

États latéraux : `ROLLING_BACK`, `CLEANUP_PENDING`, `EXPIRED`, `CANCELLED`, `FAILED`.

Invariants :

- staging jetable sans montage du workspace cible ;
- aucune suppression silencieuse ;
- un import propre ne passe pas artificiellement par la quarantaine ;
- le consentement explicite est requis pour toute transformation, exception ou acceptation de finding, pas pour un payload propre ;
- commit atomique uniquement depuis `READY_TO_COMMIT` ;
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
- chaque observation porte geo, cadence, locale et cohorte ;
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
- apps publiées supplémentaires, Full Build, Plan Mode, connecteurs tiers et AI Integrations conditionnés à Core ;
- types d'Artifact autres que web et mobile conditionnés à Core selon la documentation actuelle.

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

### 12.1.1 Contrat normatif E‑Code des quatre types

| Type | Contrat minimal | Interdictions |
|---|---|---|
| `AUTOSCALE` | trafic entrant, min/max instances, scale-to-zero selon policy, health/readiness, cold-start SLO, metering réel | aucun succès tant que la route finale n'est pas saine |
| `STATIC` | build hermétique vers bundle immuable, headers/rewrites, objet + edge/CDN, invalidation atomique | aucun processus applicatif ni secret runtime |
| `RESERVED_VM` | ressources fixes toujours allouées, restart policy, health, WebSocket/background selon capability, coût forfaitaire ou réservé | aucun faux « always-on » reposant sur une instance éphémère non surveillée |
| `SCHEDULED` | cron/timezone, deadline, retry, concurrency policy, idempotence, logs, coût et cleanup | aucune URL entrante implicite ; aucun job orphelin |

`DEPLOYMENT_TYPES_CONTRACT.md` porte pour chacun : lifecycle, configuration,
ports, secrets, access policy, observabilité, billing, changement de type,
rollback et preuves négatives. Un type non contractualisé et non prouvé est
`NOT_IMPLEMENTED`.

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

Lorsque le SLO de premier publish le justifie, le pool de projets précréés suit sa propre machine à états :

```text
PROVISIONING → BASELINING → AVAILABLE → RESERVED → ASSIGNED
                                 ↘ QUARANTINED → REPAIRING | PURGING
```

Une réservation expire, se compense et ne peut jamais attribuer le même projet à deux CloudTenants. Le pool est une optimisation mesurée, pas une excuse pour contourner les contrôles de Project Factory.

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

À la baseline du 20/07/2026, les attachments sont documentés en Preview. Le launch stage est lu depuis `SOURCE_REGISTRY.yaml`, jamais figé comme vérité éternelle. Tant que le mécanisme n'est pas GA et validé en contexte cible, prévoir fallback ORAS/referrers, Container Analysis/Binary Authorization et exit strategy. Supprimer l'image cible peut supprimer ses attachments : rétention couplée obligatoire.

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
- readiness probes et au moins une minimum instance par région participante pour calculer la santé ;
- coût de ce chauffage régional mesuré et intégré au ledger ;
- stratégie applicative séparée pour données, sessions, idempotence et dépendances régionales.

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
| `parityBaselineReady` | univers de la `baselineId` gelée évalué et DONE/NA justifié |

### 17.4 Sortie de statut générée

Le plan ne contient aucune valeur courante de readiness. La CI génère
`APPROVAL_STATUS.json` au commit mergé avec au minimum :

```yaml
ApprovalStatus:
  generatedFromCommit:
  generatedAt:
  overallStatus:
  highestPassedLevel:
  levels: []
  blockingIds: []
  uiGaps: []
  unanchoredClaims: []
  registryCoverage:
  evidenceCoverage:
```

Un niveau n'est vert que si tous les niveaux dont il dépend sont verts. Toute
valeur inconnue, référence orpheline, claim non ancrée, contrat non validé ou
preuve absente doit produire un motif bloquant explicite.

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
| P0-LS-02 | Corriger 21 tentatives / 20 routes / 19 HTTP 200 / 16 empreintes distinctes | sourceBaselineReady |
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
| P0-EX-01 | Retirer le statut d'audit et l'overlay incomplet du plan normatif | documentReconciled |
| P0-EX-02 | Générer `IMPLEMENTATION_STATUS.yaml` depuis le code, les registres et les preuves | registryUniverseReady |
| P0-EX-03 | Reclasser la persistance du layout en UNKNOWN Replit + exigence E-Code | sourceBaselineReady |
| P0-EX-04 | Corriger le branchement clean/quarantaine de la machine Import | contractsValidated |
| P0-EX-05 | Corriger les entitlements Starter : apps supplémentaires vs types d'Artifact | sourceBaselineReady |
| P0-EX-06 | Retirer les montants tarifaires du plan durable | sourceBaselineReady |
| P0-EX-07 | Ajouter identité, Workspace, Membership, Group, Guest et AccessGrant au domaine | contractsValidated |
| P0-EX-08 | Ajouter un `ProjectManifest` versionné comme source des composants et scopes | contractsValidated |
| P0-EX-09 | Contractualiser séparément Autoscale, Static, Reserved et Scheduled | contractsValidated |
| P0-EX-10 | Rendre l'activation canonique et la génération de statut entièrement CI | documentReconciled |

---

## 20. Ordre d'exécution contraignant

### Phase 0 — Installer la source de vérité

1. Copier ce fichier vers `docs/parity/PLAN_PARITE_REPLIT.md` sur une branche dédiée.
2. Supprimer ou archiver toute copie active concurrente ; conserver seulement les historiques non normatifs.
3. Réconcilier le split-brain Git avant de générer un état produit.
4. Merger après revue, puis générer `DOCUMENT_MANIFEST.yaml` au commit final.
5. Faire échouer la CI si le plan, le manifeste ou les vues générées dérivent.

### Phase 1 — Fermer l'univers documentaire

6. Ajouter tous les P0-LS et P0-EX avec owner, date ISO, dépendances et critère de clôture.
7. Importer le paquet complet du scan ; recalculer tous les hashes, sans accepter un préfixe comme preuve.
8. Ancrer chaque claim historique dans le baseline et le registre des sources.
9. Classifier N1–N15 dans les registres spécialisés ; dédupliquer avant tout compteur.
10. Produire `LEGACY_SOURCE_COVERAGE.yaml` pour chaque ancien plan, tracker, dette Bolt et checklist production.

### Phase 2 — Calculer l'état E-Code réel

11. Générer `IMPLEMENTATION_STATUS.yaml` en croisant code, migrations, routes, services, feature flags, registres et preuves.
12. Ne jamais attribuer `CODED` à un fichier non mergé sur main.
13. Ne jamais attribuer `INTEGRATED` sans déploiement de l'adapter réel.
14. Ne jamais attribuer `PROVEN` sans `evidenceId` et artefacts hashés présents.
15. Publier un rapport des incohérences code ↔ registre ↔ plan et les convertir en work items.

### Phase 3 — Valider les contrats

16. Faire relire les contrats par des reviewers réels.
17. Valider schémas, invariants, transitions refusées, compatibilité et migrations.
18. Contractualiser les quatre types de déploiement, le `ProjectManifest`, l'identité/collaboration et l'overlay d'état.

### Phase 4 — Fermer les gates de bêta

19. Rollback permanent dans Helm, fail-closed.
20. Nix multi-zone et Python neuf zéro-manuel avec perte d'une zone.
21. Promotion Artifact Registry réelle, métadonnées et policy vérifiées dans le tenant.
22. CloudTenant, Project Factory, IAM et edge minimum réellement déployés.
23. Billing minimal sûr : réservation, idempotence, compensation, hard limits aux frontières cohérentes.
24. Preuves UI du parcours Create → Edit → Run → Preview → Publish → Observe → Rollback.
25. Restore drills, observabilité, alertes et absence de secret canari dans toutes les surfaces.

### Phase 5 — Fermer la baseline produit

26. Exécuter des scans authentifiés avec comptes de test légitimes et plans représentatifs.
27. Recalculer les entitlements, surfaces et clients par cohorte.
28. Fermer chaque surface par `PROVEN`, `NOT_APPLICABLE` justifié ou `UNSUPPORTED` décidé.
29. Régénérer les statuts au commit mergé ; ne demander qu'une approbation de niveau nommé.

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
- https://docs.replit.com/features/data-and-storage/development-and-production
- https://replit.com/blog/defense-in-depth-how-replit-secures-every-layer-of-the-vibe-coding-stack

### Google Cloud

- https://cloud.google.com/run/docs/securing/multi-tenant
- https://cloud.google.com/run/docs/release-notes
- https://cloud.google.com/run/docs/configuring/configure-service-health
- https://cloud.google.com/run/docs/configuring/services/sandboxes
- https://cloud.google.com/artifact-registry/docs/manage-metadata-with-attachments
- https://cloud.google.com/kubernetes-engine/docs/concepts/workload-identity
- https://cloud.google.com/kubernetes-engine/docs/concepts/pod-snapshots
- https://cloud.google.com/resource-manager/docs/limits
- https://cloud.google.com/kubernetes-engine/docs/concepts/machine-learning/agent-sandbox

### Nix / NixOS

- https://nixos.org/blog/announcements/2026/nixos-2605/
- https://nix.dev/manual/nix/stable/

### 21.1 Claims minimaux à ancrer avant `sourceBaselineReady`

Le registre doit contenir au minimum des claims séparés et hashés pour :

- retrait des starter frameworks et maintien de Gallery/Remix ;
- douze entrées du hub Import et capacité GitLab distincte de la tuile ;
- modèle Project → Artifacts, limites, partage et publication groupée ;
- layout Window/Pane/Tab et outils documentés, sans supposer la persistance ;
- Starter/Core/Pro/Enterprise et entitlements, sans montant durable ;
- dev/prod Database et interdiction d'écriture Agent en prod ;
- MCP Server bêta et statut séparé de toute API générale ;
- conteneurs seccomp-bpf, rollout microVM, Determinate Nix ;
- projet GCP par client publiant, Cloud Run et Cloud Armor ;
- recommandations Cloud Run multi-tenant ;
- Workload Identity Federation for GKE ;
- Artifact Registry attachments et leur launch stage ;
- Cloud Run service health GA ;
- limites des Pod snapshots ;
- NixOS/Nixpkgs 26.05 et sa fenêtre de support.

Les URLs servent à l'amorçage. Les assertions normatives utilisent les
snapshots et hashes du `SOURCE_REGISTRY.yaml`, pas la disponibilité future
d'une page distante.

---

## 22. Limite de certification

Ce plan constitue le contrat normatif exécutable à installer au chemin canonique. Il ne certifie ni l'implémentation, ni les artefacts de preuve non vérifiés, ni la totalité des rollouts privés Replit. Toute approbation porte sur un niveau calculé précis : document, baseline, registres, contrats, implémentation, parcours utilisateur, bêta, lancement public ou baseline de parité.

---

## 23. Overlay d'état E-Code — généré, jamais maintenu dans une annexe

L'annexe manuelle est supprimée. `IMPLEMENTATION_STATUS.yaml` est l'unique
source d'état d'implémentation.

```yaml
ImplementationStatusEntry:
  itemId:
  itemType: SURFACE | CAPABILITY | SERVICE | CONTRACT | INFRA | WORK_ITEM
  status: NOT_STARTED | PARTIAL | CODED | INTEGRATED | PROVEN | BLOCKED | NOT_APPLICABLE
  codeCommit: null
  mergedToMain: false
  deploymentEnvironment: null
  contractIds: []
  surfaceIds: []
  serviceIds: []
  workItemIds: []
  evidenceIds: []
  blockingIds: []
  lastMeasuredAt:
  measuredBy:
  notes:
```

Règles :

- `CODED` exige un commit mergé sur main ;
- `INTEGRATED` exige l'adapter réel déployé dans l'environnement déclaré ;
- `PROVEN` exige toutes les preuves du contrat, avec artefacts présents et hashés ;
- `PARTIAL` ne satisfait aucun gate ;
- `NOT_APPLICABLE` exige une justification produit et une revue ;
- une preuve périmée ou une régression redescend automatiquement l'état.

Les vues peuvent afficher « déjà construit / partiel / non fait », mais elles
sont générées à partir de ce registre et jamais ajoutées à la main au plan.

---

## 24. Definition of Done commune

Un work item n'est terminé que lorsque :

1. le besoin ou claim est ancré et correctement classé ;
2. le contrat et le schéma sont versionnés ;
3. authn/authz serveur, erreurs, idempotence et limites sont définis ;
4. télémétrie, audit et métriques de coût sont branchés ;
5. chemins d'échec, cancel, timeout, compensation et cleanup sont testés ;
6. le code est mergé sur main ;
7. rollout, kill-switch et rollback existent ;
8. tests unitaires, intégration et négatifs passent ;
9. la preuve live requise traverse le vrai client et le vrai backend ;
10. registres, manifeste et vues générées sont à jour ;
11. aucune régression du parcours vertical n'est observée ;
12. owner et reviewer réels signent la clôture lorsque le niveau l'exige.

---

## 25. Instructions de handoff à l'agent maître

À la réception de ce fichier, l'agent maître doit produire un seul changement
cohérent, sans créer un autre plan :

1. installer ce contenu au chemin canonique ;
2. montrer le diff contre le plan actuel ;
3. créer ou migrer les schémas et registres manquants ;
4. générer l'overlay d'état réel ;
5. exécuter les validateurs ;
6. fournir les hashes, le commit, les résultats CI et les incohérences restantes ;
7. commencer ensuite la Phase 0 du §20, dans l'ordre ;
8. ne demander à Avi que les décisions réellement bloquantes, regroupées en une seule liste.

Il est interdit de répondre seulement « tout est dedans ». La sortie attendue
est : fichiers modifiés, IDs créés, compteurs recalculés, preuves vérifiées,
statut de niveau nommé et prochain lot exécutable.
