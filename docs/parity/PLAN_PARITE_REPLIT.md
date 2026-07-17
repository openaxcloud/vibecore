# PLAN DE PARITÉ PRODUIT REPLIT — plan canonique

> **CE FICHIER EST LE PLAN. Il n'y en a pas d'autre.** Toute correction se fait
> **par remplacement dans ce fichier** (jamais par ajout d'une vérité au-dessus
> d'un bloc faux, jamais par un fichier `_v6`/`_FINAL` concurrent). Git porte
> les versions ; `CHANGELOG_AUDIT.md` porte les raisons. Ce document supersède
> `PLAN_PARITE_REPLIT_v5.md` (hors repo, sha256 `cd7ec771b2deddf19c2f8115ac2745ace9e79ad1030ab1c25eac8fb4997209a1`).

---

## 0. Métadonnées

```yaml
schemaVersion: 1
version: 2026-07-17.1
baseline: périmètre public Replit observé au 16–17/07/2026 (PUBLIC_BASELINE_REPLIT_2026.yaml)
measuredRepoCommit: b774bfa38e881ebaa071fbf2c2fa9d72ab89efb5   # origin/main lu le 17/07/2026 ~09:50Z
date: "2026-07-17T09:51:51Z"
branche: docs/plan-parite-replit-canonique
statutCalcule: docs/parity/APPROVAL_STATUS.json (niveaux nommés — JAMAIS saisi ici, voir §7 et §11)
limiteDeCertification: >
  Aucune source publique ne permet d'affirmer une copie complète de
  l'infrastructure privée de Replit. La cible est la couverture du périmètre
  public daté, plus une architecture E-Code explicitement décidée et prouvée.
  Ce document ne se déclare ni définitif ni exhaustif ; son statut est calculé.
```

Aucun chiffre de ce document ne vient de la mémoire. L'historique d'audit vit
exclusivement dans `CHANGELOG_AUDIT.md` — ce fichier n'en porte aucune trace.

---

## 1. Règles de vérité et taxonomie

**Étiquetage** — toute assertion **factuelle externe** porte exactement une
étiquette : **CONFIRMÉ** (source officielle + `claimId`), **INFÉRENCE**,
**INCONNU**, **PREUVE LIVE** (`evidenceId`). Les **obligations normatives** de
ce plan (« doit », « interdit ») sont par nature des **DÉCISION E-CODE** et ne
sont pas étiquetées individuellement. Une assertion factuelle externe sans
étiquette est un défaut de conformité.

**Vérité** — un fait non mesuré n'est pas un fait. Un motif observé n'est pas
une règle. L'absence d'une page dans un index ne prouve pas l'absence d'un
produit. **Prouvé en réel ou NON FAIT.**

**Taxonomie des états** (commune aux 4 fichiers de suivi et aux registres) :
📤 Dispatché · 💻 Codé (commité+poussé main) · ✅ Testé live (écran + greps,
web/tablette/mobile). Un point n'est « fait » QUE quand ✅ est coché.

**Trois lois anti-illusion** (calculées au §11) :
1. **Un contrat n'est pas une capacité.** Une spec prouvée ne coche jamais une
   implémentation ; la capacité manquante est tracée par un `UNKNOWN` dédié.
2. **Une preuve API n'est pas une preuve UI.** Le client de chaque preuve
   (`fixtures.client`) est exposé ; les étages sans preuve UI sont listés
   (`uiGaps`) et jamais confondus.
3. **Un registre ne bloque pas sur un trou qu'il ignore.** D'où la liste
   ATTENDUE des P0 comparée en CI à l'ensemble présent (§11).

Interdits de langage : « définitif », « exhaustif », « exactement Replit »,
« 100 % complet » sans périmètre défini et preuve calculable.

---

## 2. Périmètre public et collecte

### 2.1 Cadence

CONFIRMÉ `[RPL-2026-003]` : Replit publie fréquemment, **sans garantie de
jour** (index officiel : 16/11/2025 dimanche, 26/11/2025 mercredi). Toute
automatisation indexée sur « le vendredi » est défectueuse par construction.

### 2.2 Les cinq familles du collecteur

Le collecteur documentaire seul est insuffisant : il a manqué Community
Profiles (lancé la semaine du 16/07/2026 hors documentation, `[RPL-19]`,
aveuglement mesuré : 2 jours — `OBS-COMMUNITY-PROFILES`). Le collecteur
surveille **cinq familles**, quotidiennement ET événementiellement :

| Famille | Sources |
|---|---|
| Documentation | `llms.txt`, `llms-full.txt`, `sitemap.xml`, index changelog, blog, pricing |
| Routes publiques du produit | `/gallery`, `/community`, pages d'entrée — **rendu JS + capture + hash** |
| Légal et statut | Trust & Safety, Security, legal, status, plans |
| Canal officiel de lancement | annonces, release notes des clients natifs |
| Observations UI authentifiées | par compte / plan / rollout (compte E2E dédié, D5) |

Chaque observation porte : `sourceType`, `observedAt`, **`eventDate`**,
**`detectionDate`**, `contentHash`, `archiveUri`, `plan`, `region`, `client`,
`rollout`, **`triageState`**. Un **SLA de triage par criticité** est défini
dans `OBSERVATION_REGISTRY.yaml` ; un événement critique `PENDING` au-delà de
son SLA **casse le niveau `registryComplete`** (§11). La distinction
`eventDate`/`detectionDate` rend l'aveuglement mesurable.

Les pages JS-rendered sont archivées **rendues** (capture + hash), jamais au
fetch brut. Requis : WARC, authenticité, gestion des erreurs, robots/ToS,
priorité des sources. Le nombre de liens d'un index est une **propriété du
snapshot**, jamais une constante.

### 2.3 Sources et claims

`SOURCE_REGISTRY.yaml` est **la** source (URL exacte, hashes, snapshots sur
disque — le validateur vérifie leur présence). Les claims ancrés vivent dans
`PUBLIC_BASELINE_REPLIT_2026.yaml`. Claims ancrés à ce jour :
`RPL-2026-001…005`, `RPL-17…24`, `GCP-11`, `GCP-12`. Les étiquettes héritées
du v5 (`RPL-01…16`, `GCP-01…10`, `NIX-01`) citent des sources officielles mais
ne sont **pas encore ancrées individuellement** (hash+snapshot) —
`UNK-CLAIMS-ANCHORING`, cible 2026-08-15 (§12).

Corrections factuelles portées le 17/07/2026 (détail : `CHANGELOG_AUDIT.md`) :
- **Import** : le hub « Import from a provider » compte **12 entrées dont
  Empty ET Previous Agent export** — CONFIRMÉ `[RPL-24]` (snapshot hashé).
  L'ancien comptage à 11 (Previous Agent export manquant) est remplacé.
  Convention unique : **12 entrées dont Empty**.
- **Cloud Run multi-région** : l'ancien claim « pas de failover automatique »
  (étiqueté RPL-23 dans le v5) est **remplacé par `GCP-11`** — source cloud,
  pas produit Replit. Voir §4.6.
- **Artifact Registry attachments** : **Preview** — CONFIRMÉ `[GCP-12]`
  (bannière Pre-GA dans le snapshot hashé). Voir §4.5.

---

## 3. Modèle produit

### 3.1 Gallery — surface observée (rendu JS hashé, 16/07/2026)

| Élément | Étiquette | Observation |
|---|---|---|
| Parcourir / rechercher / catégories | CONFIRMÉ `[RPL-17]` | ~22 catégories, « 82 Results », « Load all apps » |
| Pages détail par app | CONFIRMÉ `[RPL-17]` | `/gallery/work/product-and-design/journey-mapper` |
| Auteurs affichés | CONFIRMÉ `[RPL-17]` | noms visibles sur chaque carte |
| Statistiques publiques | CONFIRMÉ `[RPL-17]` | « Views 20,640 », « Used 79 times » |
| Soumission d'une app | CONFIRMÉ — **pas self-service** `[RPL-17]` | « Submit your App » → `form.typeform.com/to/yVYAWg79` (intake humaine curée) |
| Lien « View App » | CONFIRMÉ `[RPL-17]` | |
| Use Template / Remix depuis une app publiée | CONFIRMÉ `[RPL-01]` | |
| Signalement app / utilisateur | CONFIRMÉ `[RPL-18]` | via Trust & Safety |
| Publish/Unpublish self-service dans l'IDE | INCONNU | `UNK-GALLERY-SELF-PUBLISH` (ACCEPTED_RISK) |
| Preview embarquée dans la fiche | INCONNU | `UNK-GALLERY-EMBED-PREVIEW` |
| Review / modération interne | INCONNU | `UNK-GALLERY-REVIEW-WORKFLOW` (ACCEPTED_RISK) |
| Licence de remix / attribution | INCONNU | `UNK-GALLERY-REMIX-LICENSE` |

Conséquence de conception : la Gallery Replit **n'a pas de publication
self-service observée**. Un bouton « Publish to Gallery » in-product serait un
dépassement, pas de la parité — s'il est retenu, c'est une DÉCISION E-CODE
avec son coût de modération (cf. `DEC-GALLERY-NO-SELF-PUBLISH`,
`DEC-OWNER-GALLERY-OPTION-B`). Le libellé UI du clone (« Use Template »,
« Remix », « Used N times ») n'est pas pinné : nous modélisons l'opération,
pas le mot.

### 3.2 Community Profiles

CONFIRMÉ `[RPL-19]` : `replit.com/community` expose « Community Profiles » /
« Claim your profile » + Buildathons/Hackathon/Meetups (rendu JS capturé et
hashé). INCONNU tant que non capturé en détail : activité, streaks, Power
Ranking (annoncé Pro), projets épinglés, Claim Profile. INCONNU : Ramp for
Agents — **à trier, ne pas classer sans l'avoir observé**.

Entité à contractualiser :
```
CommunityProfile {
  profileId, ownerId, handle, visibility, activitySummary,
  checkpointStats, pinnedProjectIds[], publicStats,
  powerRanking?, entitlementVersion, moderationState, updatedAt
}
```
Privacy : toute statistique publique de profil exige visibilité par défaut,
opt-in, retrait, modération, entitlement. Un profil public par défaut est une
décision produit **et** une décision RGPD.

Changelog du 10/07/2026 — CONFIRMÉ `[RPL-20]` (achat de domaine),
`[RPL-21]` (Excalidraw/Connectors), `[RPL-22]` (questions Agent répondues par
les editors) : **triage `PENDING`** dans `OBSERVATION_REGISTRY` ; le SLA de
triage les rend bloquants pour `registryComplete` s'ils restent non triés.

### 3.3 Import

```
RECEIVED → STAGING_ISOLATED → SCANNING → QUARANTINED → AWAITING_USER_ACTION
  → COMMITTING → COMMITTED     ↘ ROLLING_BACK · EXPIRED · CANCELLED
```

Invariants : **aucune suppression silencieuse** (findings présentés et
bloquants ; contenu modifié uniquement avec consentement explicite) ; staging
**jetable, sans montage du workspace cible** ; le workspace n'est touché qu'au
**commit atomique**, ou jamais. Immutabilité de la décision : `sourceHash`,
`scannerVersions`, `policyVersion`, `findingsHash`, provenance. Git : LFS,
submodules, signatures, historique volumineux, credentials, rate limits,
révocation OAuth. Archive : path traversal, symlinks, hardlinks, bombes, MIME
réel, limites CPU/RAM, archives imbriquées. Quarantaine : conservation, purge,
**procédure d'appel**, export des findings, résidence. Licence — INFÉRENCE :
un scanner ne détermine pas les droits ; provenance + attestation owner requis.

**Inventaire** — CONFIRMÉ `[RPL-24]` : **12 entrées dont Empty** : GitHub,
Bitbucket, Vercel, Figma, Claude, Bolt, Lovable, Base44, ZIP, Spreadsheet,
**Previous Agent export**, Empty. GitLab passe par le flux Git mais n'est pas
une tuile ; la capture d'écran est une référence Agent/Canvas, pas un provider.
**Crédits** — CONFIRMÉ `[RPL-02]` : certaines migrations consomment des
crédits. Ordre d'exécution : **billing minimal sûr d'abord** (D4, §8), puis
connecteurs par lots : lot 1 cœur Git (Vercel, Previous Agent export, Bolt,
Lovable, Base44) ; lot 2 design (Figma, Claude) ; lot 3 données (Spreadsheet).

### 3.4 Remix — sécurité et droit

```
SNAPSHOT_PINNED → CREDENTIALS_DETACHED → SOURCE_SANITIZED → CLONING
  → DB_FORKING → STORAGE_POLICY_APPLIED → SCANNING → INDEXING → READY
latéraux : CANCELLED · QUARANTINED · ROLLING_BACK · CLEANUP_PENDING · EXPIRED
```

Détacher les credentials est nécessaire mais insuffisant : des secrets vivent
aussi dans l'historique Git, les fichiers générés, les logs, les checkpoints,
la DB et les objets. **Invariant** : une valeur de secret n'entre jamais dans
l'artefact de clone — les secrets sont des références. **Preuve** : le test
cherche la valeur du secret dans les trois surfaces du clone (fichiers, DB,
job) et **échoue à la trouver** ; une valeur survivante ⇒ quarantaine. Droit —
INFÉRENCE : sans licence explicite, la copie peut être juridiquement
interdite ; le listing porte `remixAllowed`, `licenseSnapshot`,
`consentVersion`, attribution. PII : masking/anonymisation ou consentement
explicite avant clone de DB dev.

### 3.5 Database

CONFIRMÉ `[RPL-09]` : Helium/PostgreSQL 16 en dev ; prod séparée ; l'Agent ne
peut pas écrire en prod ; migrations au publish ; remix clone la DB dev.
**Agent peut modifier DEV.** Un owner humain peut éditer PROD selon policy,
audité. Provider abstraction : le fournisseur de production n'est pas figé.

```
DBMigrationExecution
PLANNED → LOCK_ACQUIRED → BACKUP_VERIFIED → APPLYING → VALIDATING → COMMITTED
échecs : FAILED_SAFE | FORWARD_FIX_REQUIRED | MANUAL_RECOVERY
```
Invariants : `idempotencyKey` · une seule migration active par environnement ·
compatibilité backward/forward documentée · aucune mutation PROD par l'Agent ·
une release n'est jamais `ACTIVE` avant l'état de migration compatible ·
migration destructive = backup + forward-fix + caveat rollback explicite.

### 3.6 App Storage

CONFIRMÉ `[RPL-10]` : GCS ; bucket account-level, partageable entre apps.
`BucketGrant` versionné, permissions minimales, signed URLs expirantes, scan
des uploads, lifecycle, audit, versioning, holds, rétention, CMEK, résidence,
quotas, egress. Policy de Remix explicite : `DETACH` | `CLONE` |
`SHARE_WITH_CONSENT`. **DÉCISION E-CODE v1** : `SHARE_WITH_CONSENT` interdit
entre CloudTenants.

### 3.7 Billing — un ledger, pas des compteurs

Invariants comptables : **double entrée** (somme nulle par transaction),
decimal exact, arrondis, FX, timezone, cutoff, événements tardifs.
`UsageReservation` pour tout travail billable ou consommateur de quota ;
**`PaymentAuthorization` distincte** pour les achats (domaines). `UsageEvent`
immuable et idempotent ; corrections par `LedgerEntry` compensatoire, jamais
par mutation. `RateCardVersion` datée · `Entitlement` · `Budget` ·
`InvoiceLine` · proration, rollover/expiration de crédits, taxes/VAT, facture,
remboursement, dispute, chargeback · webhooks PSP idempotents · rapprochement
GCP + PSP + ledger · hard limits aux **frontières sûres**.

### 3.8 Agent — modes et routage

CONFIRMÉ `[RPL-2026-002]` : Lite / Economy / Power (segmented), Turbo dans
Advanced settings. CONFIRMÉ `[RPL-2026-001]` : « Power mode now runs on
Anthropic's Claude Opus 4.7 ». Formulation prudente : *aucun sélecteur de
modèle n'est observé dans la documentation ni l'UI publique courante*
`[RPL-2026-004]` — interdit d'écrire « à aucun moment, sur aucun plan ».

DÉCISION E-CODE : 3 modes dans l'IDE uniquement, défaut Economy · High effort
(escalade sélective) et Turbo (Power seul) · **aucun nom de modèle dans
l'UI** · mapping mode→modèle = config admin **versionnée** · le multiplicateur
affiché EST celui facturé · marge négative = blocage · classifieur non
facturé, coût visible. Trace Agent (admin only) : mode, provider/modèle réels,
tokens, coût de revient, crédits, marge — **interdiction absolue de stocker le
contenu des prompts ou des secrets**.

### 3.9 Auth

CONFIRMÉ `[RPL-13]` : **Replit Auth** et **Clerk Auth** — deux produits, avec
migration documentée (« Clerk-compatible » est un défaut de langage). Requis :
provider adapter, dev/prod, email/password, MFA/passkeys, récupération, orgs,
providers (Google, GitHub, Apple, X), session fixation, migration sans perte,
logout, et la séparation des **trois identités** : plateforme E-Code / app
publiée / utilisateurs finaux de l'app.

### 3.10 Secret proxy

CONFIRMÉ `[RPL-06]` : proxy transparent confirmé pour MCP ; Connectors =
direction en cours, pas un état livré. Contrat séparé : lease, scope,
revocation, redaction, audit, circuit breaker, zero exposure.

---

## 4. Architecture E-Code (Google Cloud)

### 4.1 Hiérarchie — mesurée, pas supposée

CONFIRMÉ `[GCP-09]` : max **300 folders enfants directs** par parent ;
profondeur 10 ; **création de folders 0,1 req/s (6/min)** ; `CreateProject`
10 req/s. Un folder par tenant est cassé par construction (à 1 000 clients :
~3 h de rate-limit pur). DÉCISION E-CODE (`DEC-TENANT-NO-FOLDER-PER-TENANT`,
DECIDED) : pas de folder dédié par tenant par défaut ; folders de
partitionnement shardés explicitement ; `CapacityPolicy` porte quotas, rate
limits, latence observée, réconciliation.

```
E-Code Organization
├─ platform-control-prod / platform-build-prod / platform-dev-region-*
└─ customers/ └─ shard-<n>/ └─ project-<tenant>-primary (+ -region-<r> si policy)
```

### 4.2 CloudTenant

CONFIRMÉ `[RPL-06]` : un projet GCP dédié par client publiant (aucune
cardinalité éternelle fixée par la source). `customerId` seul est insuffisant :

```
CloudTenant {
  id, customerBoundaryType ∈ { PERSON, WORKSPACE, LEGAL_ENTITY, BILLING_ACCOUNT },
  billingPrincipalId, legalEntityId, ownershipVersion, residencyPolicy, lifecycle
}
CloudProjectBinding[1..N] { cloudTenantId, gcpProjectNumber,
  role ∈ { PRIMARY, REGION_SHARD, QUOTA_SHARD, MIGRATION_TARGET },
  region, state, quotas, billingLabels, reconciliationStatus, deletionState }
```

Invariants : aucun projet GCP partagé entre deux CloudTenants ; machines à
états `transfer`/`merge`/`split`/`suspension`/`restoration` ; le transfert
**révoque puis re-accorde**, il ne renomme pas. **État réel : contrat écrit,
implémentation non commencée** (`UNK-CLOUDTENANT-IMPL`, gate bêta).

### 4.3 Project Factory

```
REQUESTED → CREATING → BILLING_LINKED → APIS_ENABLING → SERVICE_AGENTS_READY
  → IAM_BOUND → EDGE_READY → ACTIVE
ACTIVE ⇄ BILLING_SUSPENDED · QUOTA_EXHAUSTED · DRIFT_DETECTED
ACTIVE → DELETE_REQUESTED → RECOVERY_WINDOW → PURGING → PURGED
```
CONFIRMÉ `[GCP-07]` : suppression réversible ~30 j ; certains services
suppriment plus tôt ; quota consommé pendant la fenêtre ; project IDs non
réutilisables. Requis : teardown idempotent, inventaire, preuves d'effacement,
réserve de noms, orphelins, budgets, Essential Contacts, Org Policy baseline,
KMS/CMEK, Asset Inventory, log sinks, billing export, VPC-SC/PSC.

### 4.4 Identités IAM

| Identité | Portée | Règle |
|---|---|---|
| BuildIdentity | `platform-build` | isolée, sans accès runtime |
| PromotionIdentity | control plane | promotion par digest, impersonation courte |
| RuntimeIdentity | app × env × frontière de privilège | réutilisée par toutes ses révisions |

Interdit : une identité par déploiement/révision `[GCP-08]`. WIF uniquement si
la source d'identité est externe. Zéro clé persistante. Rotation, SLO de
révocation, audit des impersonations.

### 4.5 Promotion Artifact Registry — le digest ne suffit pas

CONFIRMÉ `[GCP-10]` : les métadonnées sont des **attachments séparés** liés à
l'artefact. **Copier une image par digest ne copie ni signature, ni SBOM, ni
provenance.** CONFIRMÉ `[GCP-12]` : les attachments Artifact Registry sont en
**PREVIEW** (« Pre-GA Offerings Terms … available "as is" and might have
limited support », snapshot hashé du 17/07/2026). **En conséquence : aucune
dépendance production aux attachments sans (a) fallback — attestations Binary
Authorization / Container Analysis, copie contrôlée des referrers via ORAS
avec manifest signé et vérification dans le tenant — et (b) exit strategy
documentée.**

```
PROMOTION_PREPARED → IMAGE_COPIED_BY_DIGEST → REFERRERS_DISCOVERED
  → ATTACHMENTS_COPIED → TARGET_SIGNATURE_VERIFIED → TARGET_POLICY_VERIFIED
  → PROMOTION_COMMITTED
```
Une promotion incomplète est nettoyée et ne peut pas devenir une release.
`PromotionManifest` : source/target, imageDigest, attachments[],
signatureVerificationResult, policyVersion, sbomDigest, provenanceDigest,
environmentLockDigest, promotionIdentity, targetVerificationResult. La preuve
live doit inclure le **contexte cible** (copie, referrers, signatures, policy
tenant, déploiement) — une simple copie de digest ne ferme pas le sujet
(`UNK-AR-LIVE-PROMOTION`, gate bêta).

### 4.6 Edge et multi-région

`ingress = internal-and-cloud-load-balancing` `[GCP-04]` · URL `run.app`
désactivée · serverless NEG → External Application Load Balancer · Cloud
Armor · TLS Certificate Manager · route versionnée par `DeploymentRevision` ·
Access Gateway avant tout cache ; contenu privé non caché ou cache-key
incluant identité/autorisation · **auth fail-closed** · test actif du bypass
`run.app`, des appels internes et des domain mappings.

**Multi-région** — CONFIRMÉ `[GCP-11]` *(remplace le claim « pas de failover
automatique », périmé ; reclassé depuis « RPL-23 » du v5 : source cloud, pas
produit Replit)* : **Cloud Run service health automatise le failover/failback
inter-régions** via readiness probes + serverless NEGs, trafic externe (LB
global) et interne (LB cross-region). Statut produit : **GA le 29/06/2026**
d'après les release notes officielles (snapshot hashé
`SRC-CLOUDRUN-RELEASE-NOTES`) ; la page produit du 17/07 ne porte pas de
bannière Pre-GA (snapshot hashé `SRC-CLOUDRUN-SERVICE-HEALTH`). *Note de
divergence consignée : une lecture owner du 17/07 rapportait une bannière
Preview ; les artefacts hashés ne la reproduisent pas — voir
`CHANGELOG_AUDIT.md`.* **Exigence E-Code inchangée, indépendante du statut
GA : fallback + exit strategy obligatoires** — E-Code définit la stratégie de
données, la cohérence des sessions, l'idempotence, les dépendances régionales
et le comportement en dégradation partielle. Rien n'est « automatique » au
niveau applicatif par la seule grâce du LB.

**Accès aux apps publiées** — CONFIRMÉ `[RPL-23]` : quatre modes (« Who can
access your app ») : Public, Password protected, Workspace only, Invite only ;
les modes privés forcent une connexion ; gouvernance admin (exiger le privé,
bannir le public). Contractualisé dans `AUTH_ACCESS_CONTRACT.md`, versionné
par `accessPolicyVersion` dans le `ReleaseManifest` (`UNK-AUTH-ACCESS-LIVE`).

### 4.7 Release et rollback

CONFIRMÉ `[GCP-06]` : Cloud Run supprime les révisions au-delà de 1000 par
service. `ReleaseCatalog` est la source de vérité, mais **une référence n'est
pas une version** : une ref vers `latest` rejoue une autre application.

`ReleaseManifest` pinne des versions, pas des pointeurs :
```
ReleaseManifest {
  sourceRevisionDigest, artifactRevisionDigests[],
  runtimeImageDigest | staticBundleDigest,
  environmentLockDigest, runtimeConfigDigest,
  secretVersionRefs[] | explicitCurrentSecretPolicy,
  accessPolicyVersion, domainRouteVersion,
  dbMigrationSetVersion + compatibilityState,
  sbomDigest + provenanceDigest + signatures, retentionRoots[]
}
```
Le rollback recrée un deployment depuis ce manifest **même si la révision
Cloud Run n'existe plus** (PREUVE LIVE `E2E-VERTICAL-ROLLBACK`). La base de
données n'est jamais supposée inversée. Politique de secrets au rollback
(anciennes vs courantes versions) : **explicite et testée** — les deux cas,
dont rotation-puis-rollback. Fail-closed permanent : décision **D2** (§8),
application tracée `UNK-ROLLBACK-FLAG-APPLIED`. GC : uniquement après zéro
référence ET expiration ; coût, fenêtre, legal hold, reference graph, pin
utilisateur. Parité — CONFIRMÉ `[RPL-05]` : `Publishing → History → redeploy`.

### 4.8 Checkpoint — déclarer le niveau de cohérence

CONFIRMÉ `[GCP-02]` : Pod snapshot inclut rootfs, `EmptyDir`, `tmpfs` ;
**« most notably, persistent volumes are not checkpointed »**. Une séquence
d'étapes ne crée pas un instant atomique. Le niveau de cohérence est déclaré
par configuration : `crash-consistent` | `application-consistent` |
`transaction-consistent` — le produit affiche celui qu'il garantit réellement.

```
CheckpointTransaction
PREPARING → QUIESCING → BARRIER_ESTABLISHED → SNAPSHOTTING → VERIFYING → COMMITTED
échecs : ABORTING → CLEANED | MANUAL_INTERVENTION
```
Barrière logique établie **avant** tout snapshot ; quiesce avec timeout et
**dégel obligatoire** ; CSI VolumeSnapshot avec fallback ; manifest signé
visible seulement après validation de tous les composants ; détection de
snapshot orphelin ; matrice StorageClass × CSI × DB provider × région ; un
PodSnapshot seul n'est jamais un « checkpoint projet ». **État réel : contrat
écrit + transitions refusées par test, implémentation non commencée**
(`UNK-CHECKPOINT-IMPL`).

### 4.9 Runtime Nix

CONFIRMÉ `[NIX-01]` : nixpkgs 26.05, sortie 30/05/2026, supportée jusqu'au
31/12/2026. DÉCISION E-CODE : pin **Nix 2.34.8** (pas un fait de parité —
Replit utilise Determinate Nix `[RPL-06]`) ; **v1 = `x86_64-linux`
uniquement**. `RUNTIME_NIX_CONTRACT.md` : générations, DB Nix RO, catalogue
signé, `ecode.lock.json`, activation atomique, no hidden user store,
collisions, wrappers, certificats, clés/rotation/révocation, provenance
builder, unfree/insecure, SBOM, rollback par génération, reprise après
corruption, **réplication zonale**, upgrade du schéma DB Nix, SLO, E2E offline.

CONFIRMÉ `[GCP-03]` : Image Streaming optimise le rootfs, **ne streame pas
`/nix`** — chaque test prouve l'événement par métrique. Agent Sandbox : POC,
pas cible ; Kata non supporté `[GCP-01]`. **Multi-zone : D3 GO** (§8) —
snapshot signé par génération + clone zonal identique, topology-aware, test de
perte de zone, **coût mesuré sur SKU réel** (jamais « ~10 $ » figé)
(`UNK-NIX-MULTIZONE-IMPL`, prérequis du Python zéro-manuel).

---

## 5. Contrats de sécurité et invariants

Les invariants ci-dessous sont **testés négativement** (une transition
interdite refusée par test vaut plus qu'une promesse) :

1. **Remix** : une valeur de secret n'entre jamais dans l'artefact de clone ;
   `CLONING` refusé avant `CREDENTIALS_DETACHED` ; valeur survivante ⇒
   quarantaine. (PREUVE LIVE, `docs/deploy-evidence/2026-07-16-remix/`)
2. **Import** : aucune suppression silencieuse ; staging sans montage du
   workspace cible ; commit tardif refusé ; `targetProjectId` jamais touché
   hors commit. (PREUVE LIVE, `docs/deploy-evidence/2026-07-16-import/`)
3. **Checkpoint** : `CHECKPOINT_SNAPSHOT_BEFORE_BARRIER` refusé.
4. **Migration DB** : `MIGRATION_APPLY_BEFORE_BACKUP` refusé ; aucune mutation
   PROD par l'Agent.
5. **Promotion** : une promotion non `COMMITTED` ne peut jamais devenir une
   release ; BinAuthz/policy revalidée dans le contexte tenant.
6. **Rollback** : pas de digest retenu ⇒ 409 typé, jamais une URL peut-être
   morte ; politique de secrets insatisfiable ⇒ 409. (PREUVE LIVE)
7. **Edge** : auth fail-closed ; bypass `run.app` testé activement.
8. **Agent** : aucun nom de modèle dans l'UI ; marge négative ⇒ 409 bloquant ;
   pas de downgrade silencieux (403 typés). (PREUVES LIVE E2E-AGM-*)
9. **Tenancy** : aucun projet GCP partagé entre deux CloudTenants ; transfert
   = révoquer puis re-accorder.
10. **Secrets plateforme** : zéro clé persistante ; leases + révocation.

`SECURITY_PRIVACY_COMPLIANCE.md` : threat model, data map, résidence des
sous-traitants, retention, legal holds, export/suppression, DPA, abuse/DMCA,
licences, communication d'incident, contrôles de contenu Gallery/Community.
`OPERATIONS_DR.md` : SLO, error budgets, alertes, on-call, runbooks, RPO/RTO,
**tests de restauration** (un backup non restauré n'est pas un backup), chaos,
perte de zone/région (SPOF-1 : store Nix zonal → D3), capacité.

---

## 6. Surfaces

`SURFACE_REGISTRY.yaml` (schemaVersion 2) déclare la **matrice réellement
supportée** — une combinaison absente est déclarée, pas oubliée :

```
SurfaceAvailability ∈ { SUPPORTED | UNSUPPORTED | NOT_APPLICABLE | ROLLOUT | UNKNOWN }
SurfaceRegistryEntry { surfaceId, route, clientKind, clientVersion, plan,
  entitlement, region, rolloutCohort, availability, permissions, serverAuthz,
  states, errors, recovery, serviceIds, events, responsiveContract,
  accessibilityContract, locale, RTL, timezoneBehavior, performanceBudget,
  e2eProofIds, observedAt }
```

`clientKind` ∈ { web responsive, desktop natif, mobile natif } — tablette web
et application mobile native ne sont pas le même client. Accessibilité et
i18n : WCAG 2.2 AA, clavier, screen reader, contraste, reduced-motion, RTL,
timezone IANA, locales. Schéma des preuves : `evidenceId`, OS, navigateur,
version client, `traceId`, horloge, stockage immuable, rétention. Une surface
n'est DONE que si **chaque** preuve référencée est PROVEN avec artefacts
présents (et hashés, §11).

---

## 7. État mesuré

> **Cette section est GÉNÉRÉE depuis les registres — jamais saisie à la main.**
> Source unique : `docs/parity/APPROVAL_STATUS.json`, produit par
> `node scripts/parity/generate-approval-status.mjs` (drift-check en CI : le
> fichier committé doit être identique au recalcul, sinon build cassé).
> Le bloc ci-dessous est un EXTRAIT VERBATIM du fichier généré au
> `measuredRepoCommit` de ce plan ; en cas d'écart, le JSON fait foi.

```json
{
  "approved": {
    "level": "architectureContracted"
  },
  "levels": [
    {
      "name": "documentReady",
      "passed": true,
      "reasons": []
    },
    {
      "name": "registryComplete",
      "passed": true,
      "reasons": []
    },
    {
      "name": "architectureContracted",
      "passed": true,
      "reasons": []
    },
    {
      "name": "implementationReady",
      "passed": false,
      "reasons": [
        "P0-V3-01 is OPEN",
        "P0-V3-05 is OPEN",
        "P0-V3-06 is OPEN",
        "P0-V3-07 is OPEN"
      ]
    },
    {
      "name": "verticalReady",
      "passed": true,
      "reasons": []
    },
    {
      "name": "betaReady",
      "passed": false,
      "reasons": [
        "beta gate capability still unknown: UNK-GIT-RECONCILE-DONE",
        "beta gate capability still unknown: UNK-ROLLBACK-FLAG-APPLIED",
        "beta gate capability still unknown: UNK-NIX-MULTIZONE-IMPL",
        "beta gate capability still unknown: UNK-AR-LIVE-PROMOTION",
        "beta gate capability still unknown: UNK-CLOUDTENANT-IMPL",
        "beta gate capability still unknown: UNK-BILLING-MINIMAL-IMPL"
      ]
    },
    {
      "name": "publicLaunchReady",
      "passed": false,
      "reasons": [
        "betaReady not passed",
        "P0-V4-1 not CLOSED (needs a real reviewer)",
        "P0-V4-2 not CLOSED (needs a real reviewer)",
        "P0-V4-3 not CLOSED (needs a real reviewer)",
        "P0-V4-4 not CLOSED (needs a real reviewer)",
        "P0-V3-01 not CLOSED (needs a real reviewer)",
        "P0-V3-02 not CLOSED (needs a real reviewer)",
        "P0-V3-03 not CLOSED (needs a real reviewer)",
        "P0-V3-04 not CLOSED (needs a real reviewer)",
        "P0-V3-05 not CLOSED (needs a real reviewer)",
        "P0-V3-06 not CLOSED (needs a real reviewer)",
        "P0-V3-07 not CLOSED (needs a real reviewer)",
        "P0-V3-08 not CLOSED (needs a real reviewer)",
        "P0-V3-09 not CLOSED (needs a real reviewer)",
        "P0-V3-10 not CLOSED (needs a real reviewer)",
        "P0-V3-11 not CLOSED (needs a real reviewer)",
        "P0-V3-12 not CLOSED (needs a real reviewer)",
        "P0-V3-13 not CLOSED (needs a real reviewer)",
        "P0-V3-14 not CLOSED (needs a real reviewer)",
        "P0-V3-15 not CLOSED (needs a real reviewer)",
        "decision DEC-GALLERY-NO-SELF-PUBLISH still OPEN",
        "claim RPL-20 triage PENDING",
        "claim RPL-21 triage PENDING",
        "claim RPL-22 triage PENDING",
        "claim RPL-23 triage PENDING"
      ]
    },
    {
      "name": "parityBaselineReady",
      "passed": false,
      "reasons": [
        "claim RPL-20 triage PENDING",
        "claim RPL-21 triage PENDING",
        "claim RPL-22 triage PENDING",
        "claim RPL-23 triage PENDING"
      ]
    }
  ],
  "uiGaps": [
    "publish",
    "rollback"
  ],
  "counts": {
    "p0": {
      "total": 19,
      "closed": 0,
      "proven": 15,
      "open": 4
    },
    "decisions": {
      "total": 11,
      "open": 1
    },
    "unknowns": {
      "total": 19,
      "p0Linked": 0
    },
    "claims": {
      "total": 15,
      "stale": 0
    },
    "surfaces": {
      "total": 4,
      "done": 4
    },
    "e2e": {
      "total": 12,
      "proven": 12
    }
  }
}
```

Preuves live détaillées : `E2E_PROOFS.yaml` (12 preuves, artefacts bruts sous
`docs/deploy-evidence/`, hashés dans `APPROVAL_STATUS.json.evidence[]`).
Vue par chantier (3 états séparés) : `PARITY_STATUS.md`.

---

## 8. Décisions

Registre : `DECISION_REGISTRY.yaml`. Décisions **OWNER_DECISION** d'Avi
(17/07/2026) — citations et contenus exacts dans le registre :

| ID | Décision | Statut |
|---|---|---|
| `DEC-OWNER-D1-GIT-RECONCILE` | Réconciliation split-brain Git, procédure contrôlée (« Merge toi meme et verifie les commits des autres sessions si ils sont bon tu les prend ») | DECIDED — exécution `UNK-GIT-RECONCILE-DONE` |
| `DEC-OWNER-D2-ROLLBACK-PERMANENT` | Rollback par digest permanent, fail-closed, Helm + canary | DECIDED — application `UNK-ROLLBACK-FLAG-APPLIED` |
| `DEC-OWNER-D3-NIX-MULTIZONE` | GO multi-zone, topologie réelle (clones zonaux signés), coût mesuré | DECIDED — exécution `UNK-NIX-MULTIZONE-IMPL` |
| `DEC-OWNER-D4-BILLING-BEFORE-CONNECTORS` | Billing minimal sûr avant connecteurs, puis lots | DECIDED — `UNK-BILLING-MINIMAL-IMPL` |
| `DEC-OWNER-D5-E2E-ACCOUNT` | Compte E2E dédié + Playwright, pas le Chrome personnel | DECIDED |
| `DEC-OWNER-D6-TPL02-POSTHOC` | Validation a posteriori TPL-02 ; gate déplacé au merge/release/✅ | DECIDED |
| `DEC-OWNER-TRACKING-FILES-VERSIONED` | Fichiers de suivi régénérés depuis les registres (« Oui si il faut le faire et c sans risque ») | DECIDED |
| `DEC-OWNER-GALLERY-OPTION-B` | Option B Gallery confirmée (contenu exact : `UNK-GALLERY-OPTION-B-CONTENT`) | DECIDED |

D2 à D6 ont été approuvés par « **Oui** » à la question « tu adoptes D2 à D6
tels qu'écrits dans ce document ? » (17/07/2026) ; le « document » est celui
de l'expert d'Avi (réponses D1–D6), dont le contenu est recopié dans les
rationales du registre.

---

## 9. P0 / P1

**P0** — registre : `P0_REGISTRY.yaml`, **19 entrées** : les **15 P0 du
dernier audit externe** (`P0-V3-01…15`, Audit v3 du 16/07/2026) tracés
individuellement + les 4 P0 de l'audit v4 (`P0-V4-1…4`). La CI compare
l'ensemble EXACT des IDs attendus à l'ensemble présent — l'absence d'un ID
casse le build. Chaque entrée porte : description, source, owner, statut,
targetDate (ISO — `UNKNOWN` interdit), commit, reviewer, preuve, dépendances,
condition de clôture.

État au `measuredRepoCommit` (détail calculé dans `APPROVAL_STATUS.json`) :
- **OPEN** (capacité ou preuve manquante) : `P0-V3-01` (rendu JS en CI +
  triage), `P0-V3-05` (licence/PII remix), `P0-V3-06` (connecteurs + crédits),
  `P0-V3-07` (promotion AR live).
- **PROVEN** (preuve présente, revue humaine manquante) : les 15 autres.
- **CLOSED** : 0 — aucun P0 n'est clos sans commit + reviewer réel + preuve.

**P1** — les 18 P1 du même audit ne sont pas encore tracés individuellement en
registre ; ils restent portés par les contrats de domaine (§3–§5). Trace :
`UNK-CLAIMS-ANCHORING` + prochaine itération du registre (cible 2026-08-15).

---

## 10. Ordre d'exécution

Ordre adopté (évaluation v5 + décisions D1–D6) :

| # | Horizon | Travail | Trace |
|---|---|---|---|
| 1 | Immédiat (stop-the-line) | D1 réconciliation Git (branche d'intégration, backups, inventaire, CI, PR) | `UNK-GIT-RECONCILE-DONE` (2026-07-20) |
| 2 | Immédiat | Durcir l'approval CI : 19/19 P0, dates réelles, triage SLA bloquant, niveaux nommés | ce plan + `APPROVAL_STATUS.json` |
| 3 | Immédiat | D2 rollback permanent (Helm values + schéma + canary + alerte post-upgrade) | `UNK-ROLLBACK-FLAG-APPLIED` (2026-07-24) |
| 4 | Ensuite | D3 Nix multi-zone + projet Python neuf zéro-manuel + test de perte de zone | `UNK-NIX-MULTIZONE-IMPL` (2026-08-01) |
| 5 | Ensuite | D5 deux preuves authentifiées (Remix→IDE ; Python neuf de bout en bout) avec compte E2E dédié | DEC-OWNER-D5 (2026-08-01) |
| 6 | Avant bêta externe | Promotion AR live (+fallback ORAS/BinAuthz, GCP-12 Preview) ; CloudTenant/IAM/edge minimum ; billing minimal | `UNK-AR-LIVE-PROMOTION`, `UNK-CLOUDTENANT-IMPL`, `UNK-BILLING-MINIMAL-IMPL` |
| 7 | Après vertical sécurisé | D4 connecteurs par lots ; Community Profiles ; triage Excalidraw / achat domaine / questions editors ; pixel parity | OBS-2026-07-10-* |
| 8 | Continu | D6 gouvernance proofApproval ; collecteur JS en CI ; régression harness | `UNK-COLLECTOR-CI-RENDER`, `UNK-REGRESSION-HARNESS` |

---

## 11. Conditions d'approbation calculables

**Le booléen global `approvalReady` est supprimé** (faux positif de
couverture : il validait un registre incomplet, pas la parité). Le statut est
une échelle de **niveaux nommés**, calculée par
`scripts/parity/generate-approval-status.mjs`, jamais écrite à la main
(drift-check CI). **`APPROVED` n'est admis que si le niveau exact est nommé**
(`approved.level`).

| Niveau | Définition calculée |
|---|---|
| `documentReady` | registres requis présents + `schemaVersion` + ce plan présent avec `measuredRepoCommit` |
| `registryComplete` | ensemble EXACT des 19 P0 présent · aucun `targetDate` UNKNOWN (hors ACCEPTED_RISK justifié) · aucune référence orpheline · **artefacts de preuve présents ET hashés** · aucun événement PENDING au-delà de son SLA de triage |
| `architectureContracted` | les 19 fichiers de contrat présents |
| `implementationReady` | aucun P0 OPEN ou BLOCKED |
| `verticalReady` | créer→modifier→exécuter→preview→publier→observer→rollback : chaque étage a une preuve PROVEN (clients par étage exposés ; étages sans preuve UI listés dans `uiGaps` — une preuve API n'est pas une preuve UI) |
| `betaReady` | registryComplete + verticalReady + fraîcheur sources + aucune décision expirée + **aucune capacité gate-bêta encore UNKNOWN** (git réconcilié, rollback appliqué, Nix multi-zone, promotion AR live, CloudTenant minimum, billing minimal) |
| `publicLaunchReady` | betaReady + tous les P0 CLOSED (reviewer humain réel) + aucune décision OPEN + aucun claim en triage PENDING |
| `parityBaselineReady` | toutes les surfaces du périmètre public daté DONE + sources fraîches + tout trié |

Contrôles de complétude supplémentaires (validateur, exit 1) : aucun P0 CLOSED
sans commit + reviewer réel + preuve · evidenceId inexistant ou vide interdit
pour PROVEN · snapshots des sources présents sur disque · `APPROVAL_STATUS`
sans clé `approvalReady` (interdite) et avec `approved.level` = plus haut
niveau **contigu** atteint · **aucune contradiction entre sections** : ce plan
ne déclare aucun état — il pointe le JSON calculé (§7), donc une contradiction
plan/registres est structurellement impossible sur les états.

---

## 12. Limites connues

1. **Périmètre** : couverture du périmètre public daté uniquement ;
   l'infrastructure privée de Replit n'est pas observable (§0,
   limiteDeCertification).
2. **Ancrage des claims hérités** : `RPL-01…16`, `GCP-01…10`, `NIX-01` cités
   sans hash individuel — `UNK-CLAIMS-ANCHORING` (2026-08-15).
3. **Contrats sans capacité** : CloudTenant/IAM, Checkpoint, migration DB au
   publish, billing ledger — spécifiés, testés négativement, **non
   implémentés** ; tracés par UNKNOWNs gate-bêta (§11).
4. **Preuves UI incomplètes** : rollback prouvé par API (client `api`), pas à
   l'écran ; Remix authentifié → IDE non prouvé visuellement (D5) ; `uiGaps`
   calculé dans le JSON.
5. **Inconnues produit Replit** : self-publish IDE, review interne, licence
   remix, preview embarquée, Ramp for Agents — `UNKNOWN_REGISTRY.yaml`
   (ACCEPTED_RISK justifiés ou datés).
6. **Divergence non résolue** : lecture owner « Preview » vs snapshots hashés
   « GA » sur Cloud Run service health (§4.6) — traitée fail-closed (fallback
   + exit strategy exigés quoi qu'il en soit), consignée au changelog.
7. **Split-brain Git** : tant que D1 n'est pas exécutée, les fichiers de suivi
   du checkout local peuvent mentir par construction ; ce plan est ancré sur
   `origin/main` uniquement.
8. **P1** : 18 P1 du dernier audit non tracés individuellement (§9).
