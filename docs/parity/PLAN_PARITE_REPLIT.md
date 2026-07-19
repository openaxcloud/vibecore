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
version: 2026-07-19.2
baseline: périmètre public Replit observé au 16–17/07/2026 (PUBLIC_BASELINE_REPLIT_2026.yaml)
measuredRepoCommit: b774bfa38e881ebaa071fbf2c2fa9d72ab89efb5   # origin/main lu le 17/07/2026 ~09:50Z
date: "2026-07-19T00:00:00Z"
auditCouverture: docs/parity/COVERAGE_GAP_AUDIT_2026-07-17.md   # confrontation à TOUS les anciens plans (2026-07-19)
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

**Nouveau ledger vs ancien système : à réconcilier.** Un système de crédits
COMPLET existe déjà dans le code (CreditWallet/checkpoints/packs/PAYG, certifié
SHADOW en prod — audit de couverture du 19/07, famille B) et ce plan décrit un
ledger NOUVEAU sans dire ce que devient l'ancien. Cet arbitrage est une
décision propriétaire OUVERTE : `DEC-BILLING-LEGACY-VS-LEDGER` ; la mise en
route (Stripe, bascule `BILLING_CREDITS_ENABLED`, backfill des plans) est
tracée `UNK-BILLING-LEGACY-GOLIVE` + `P1-COV-08`. Aucun des deux systèmes ne
facture réellement tant que la décision n'est pas prise.

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
        "decision DEC-BILLING-LEGACY-VS-LEDGER still OPEN",
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
        "surface SRF-IDE-FILE-HISTORY not done",
        "surface SRF-IDE-AGENT-SKILLS not done",
        "surface SRF-IDE-PANES-LAYOUT not done",
        "surface SRF-DEPLOY-RESERVED-VM not done",
        "surface SRF-DEPLOY-SCHEDULED not done",
        "surface SRF-GALLERY-STARTER-DEMOS not done",
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
      "total": 12,
      "open": 2
    },
    "unknowns": {
      "total": 21,
      "p0Linked": 0
    },
    "claims": {
      "total": 15,
      "stale": 0
    },
    "surfaces": {
      "total": 10,
      "done": 4
    },
    "e2e": {
      "total": 12,
      "proven": 12
    },
    "p1": {
      "total": 8,
      "open": 8
    },
    "boltDebt": {
      "total": 29,
      "nonFait": 29,
      "faitProuve": 0
    },
    "prodReadiness": {
      "total": 50,
      "nonFait": 50,
      "faitProuve": 0
    },
    "backlog": {
      "total": 336,
      "nonFait": 332,
      "dejaFait": 1,
      "perime": 3
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

**P1** — deux familles distinctes :
- les **18 P1 de l'audit externe v3** ne sont pas encore tracés
  individuellement en registre ; ils restent portés par les contrats de domaine
  (§3–§5). Trace : `UNK-CLAIMS-ANCHORING` + prochaine itération du registre
  (cible 2026-08-15) ;
- les **8 P1 de l'audit de couverture du 19/07** (`P1-COV-01…08`,
  section `p1s` de `P0_REGISTRY.yaml`) tracent les features Replit que ce plan
  ne mentionnait pas alors qu'elles étaient suivies ailleurs : File History,
  Agent Skills, Project Editor en panneaux, types de déploiement
  Reserved VM/Scheduled, entitlements par plan, starters→démos, parité pixel,
  réconciliation billing. Même mécanisme CI que les P0 (ensemble EXACT attendu,
  `EXPECTED_P1_IDS`) ; chacun porte une surface déclarée dans
  `SURFACE_REGISTRY.yaml` quand il en a une (`availability: UNSUPPORTED` —
  une absence déclarée, pas oubliée, §6).

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
8. **P1** : 18 P1 du dernier audit externe non tracés individuellement (§9) ;
   les 8 P1 de l'audit de couverture, eux, le sont (`P1-COV-*`, §9).

---

## 13. Périmètres complémentaires — tracés, pas flottants

L'audit de couverture du 19/07 (`COVERAGE_GAP_AUDIT_2026-07-17.md`) a confronté
ce plan à TOUS les anciens plans et fichiers de tâches : **336 points encore
ouverts** (compte exact, §14), ~13 seulement référencés ici avant le versement.
**Chaque point est désormais une ligne du §14 de CE plan**, verrouillée par
`scripts/parity/check-plan-completeness.mjs` (compte exact + SHA-256). Règle : **tout ce que ce plan n'absorbe
pas est tracé dans un registre nommé ou explicitement délégué à un fichier de
suivi actif — rien ne flotte.** La CI compare l'ensemble EXACT des IDs attendus
(`EXPECTED_P1_IDS`, `EXPECTED_BOLT_DEBT_IDS`, `EXPECTED_PROD_READINESS_IDS`
dans `scripts/parity/generate-approval-status.mjs`) : un ID qui disparaît casse
le build, comme pour les 19 P0. Tout y est **NON FAIT par défaut** — rien ne
passe FAIT_PROUVE sans `evidenceId` présent sur disque (validateur).

| Périmètre | Où c'est tracé | Dans ce plan ? |
|---|---|---|
| Features Replit absentes du plan (File History, Skills, éditeur en panneaux, types de déploiement, entitlements par plan, starters→démos, pixel) | `P0_REGISTRY.yaml` section `p1s` (P1-COV-01…08) + surfaces `UNSUPPORTED` dans `SURFACE_REGISTRY.yaml` | OUI (§9) — à intégrer au périmètre produit lors de la prochaine itération |
| Mise en route du billing existant (SHADOW) et arbitrage vs ledger §3.7 | `DEC-BILLING-LEGACY-VS-LEDGER` (OPEN) + `UNK-BILLING-LEGACY-GOLIVE` + `UNK-DB-COMPUTE-METERING` + P1-COV-08 | OUI (§3.7) |
| Dette héritée du fork bolt (26 items : Workflows morts, Debugger factice, panneaux localStorage…) | `BOLT_DEBT_REGISTRY.yaml` (BD-01…26) | NON — hors périmètre parité, suivi par ce registre |
| Programme mise-en-production (48 items : isolation, k6, restore RTO/RPO, pentest, mobile/desktop, juridique, React Router 7…) | `PRODUCTION_READINESS_REGISTRY.yaml` (PR-*) | NON — hors périmètre parité, suivi par ce registre |
| Actions qui n'attendent qu'Avi | `ACTIONS_AVI.md` (liste consolidée, mots simples) | NON — délégué |
| Design marketing (SOL-*), bugs live, chantiers en cours | `DESIGN_PROGRAM_MASTER.md` / `DESIGN_AUDIT_LIVE.md`, `BUG_INVENTORY_LIVE.md`, `PLAN_REMAINING_UNIFIED.md`, `REPLIT_PARITY.md` (fichiers de suivi actifs, règle CLAUDE.md) | NON — délégué explicitement |

Exclusion volontaire : la fuite `tokenHash` des invitations (famille E de
l'audit) est traitée par une session dédiée (PR #6) — pas d'ID ici pour ne pas
dupliquer le suivi.

---

## 14. Backlog complet — chaque point trouvé dans les 29 anciens fichiers, un par ligne

> **Certification calculable** : cette section contient UNE ligne par point
> encore ouvert trouvé par l'audit de couverture du 19/07 dans les 29 anciens
> plans/fichiers de tâches. Le script
> `scripts/parity/check-plan-completeness.mjs` (exécuté par le validateur, donc
> par la CI) vérifie le **compte exact** et le **SHA-256 de la liste des IDs** :
> retirer, renommer ou ajouter UN SEUL point sans mise à jour explicite des
> constantes casse le build — même mécanisme que les 19 P0. On peut donc dire :
> « tous les points y sont, vérifié par machine » — jamais « c'est fini » :
> un point n'est PAS fait tant que sa ligne dit NON FAIT.
>
> Statuts : **NON FAIT** (défaut, y compris au moindre doute) · **DÉJÀ FAIT**
> (uniquement avec « (preuve : …) ») · **PÉRIMÉ** (le point n'a plus de sens,
> uniquement avec preuve). La colonne « Suivi par » pointe l'entrée de registre
> ou le fichier de suivi actif qui porte le détail. Plusieurs lignes peuvent
> pointer la même entrée (une entrée regroupe un chantier).

### 14.1 Fichiers de suivi actifs (racine) — 47 points

| ID | Point (mots simples) | Statut | Owner | Échéance | Suivi par |
|---|---|---|---|---|---|
| ACT-01 | Remix : le clic « Remix » connecté jusqu'à l'IDE dans le navigateur reste à prouver à l'écran | NON FAIT | claude | 2026-08-01 | REPLIT_PARITY.md TPL-02.2 + DEC-OWNER-D5-E2E-ACCOUNT |
| ACT-02 | Hub Import : les 12 sources d'import documentées, avec validation et aperçu avant création | NON FAIT | claude | 2026-08-31 | REPLIT_PARITY.md TPL-02.3 + P0-V3-06 |
| ACT-03 | Créer un projet vide, sans Agent ni squelette (voie power-user) | NON FAIT | claude | 2026-08-31 | REPLIT_PARITY.md TPL-02.4 |
| ACT-04 | Requalifier les 6 anciens starters en applications de démo publiées et remixables | NON FAIT | claude | 2026-08-31 | P1-COV-06 |
| ACT-05 | Prouver séparément que prompt, import et remix mènent chacun à un projet publiable | NON FAIT | claude | 2026-08-31 | REPLIT_PARITY.md TPL-02.PROOF + P1-COV-06 |
| ACT-06 | Historique de fichier automatique, indépendant de Git, avec rétention documentée | NON FAIT | claude | 2026-09-15 | P1-COV-01 |
| ACT-07 | Bouton History + panneau autonome avec navigation au curseur, aux flèches et au clavier | NON FAIT | claude | 2026-09-15 | P1-COV-01 |
| ACT-08 | Comparer avec la dernière version + restaurer sans jamais rien effacer | NON FAIT | claude | 2026-09-15 | P1-COV-01 |
| ACT-09 | Rejouer les modifications d'un fichier comme un film (lecture/pause/vitesse) | NON FAIT | claude | 2026-09-15 | P1-COV-01 |
| ACT-10 | Compatibilité des skills d'agent au format ouvert (.agents/skills/…/SKILL.md) | NON FAIT | claude | 2026-09-15 | P1-COV-02 |
| ACT-11 | Chargement progressif des skills : titre d'abord, contenu à la demande | NON FAIT | claude | 2026-09-15 | P1-COV-02 |
| ACT-12 | Filtre de sécurité anti-injection pour tout catalogue de skills externe (quarantaine, audit) | NON FAIT | claude | 2026-09-15 | P1-COV-02 |
| ACT-13 | Tests et validation live du lot File History + Skills sur les 3 formats d'écran | NON FAIT | claude | 2026-09-15 | P1-COV-01 + P1-COV-02 |
| ACT-14 | Éditeur : inventaire de l'existant + captures avant, aux 3 formats | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-15 | Éditeur : modèle persistant Fenêtre → Panneaux → Onglets | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-16 | Éditeur : diviser l'écran, redimensionner, déplacer un onglet, panneau flottant | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-17 | Éditeur : barre d'outils à gauche + fenêtre « Tous les outils » avec recherche | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-18 | Éditeur : menu Options de l'onglet actif (actions fenêtre/panneau/onglet) | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-19 | Éditeur : panneau Ressources avec RAM/CPU/stockage réels | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-20 | Éditeur : page Spotlight au clic sur le nom du projet | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-21 | Terminologie : « Project Editor » pour l'IDE, « Workspace » réservé à l'organisation | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-22 | Éditeur : responsive et accessible aux 3 formats, sans débordement | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-23 | Éditeur : captures avant/après présentées à Avi avant tout push | NON FAIT | claude | 2026-09-30 | P1-COV-03 |
| ACT-24 | Agent : raccourci ⌘⇧I et texte garde-fou du mode Lite jamais capturés à l'écran | NON FAIT | claude | 2026-08-31 | PARITY_STATUS.md (AGM-4) |
| ACT-25 | Agent : popover Advanced, escalade sur tâche dure et mention « +0 credit » jamais capturés | NON FAIT | claude | 2026-08-31 | PARITY_STATUS.md (AGM-5) |
| ACT-26 | Agent : publication réelle d'une v2 de la table de routage (historique avant/après) jamais exécutée | NON FAIT | claude | 2026-08-31 | PARITY_STATUS.md (AGM-9) |
| ACT-27 | Agent : appel réel du classifieur jamais déclenché ni loggé (nécessite High effort) | NON FAIT | claude | 2026-08-31 | PARITY_STATUS.md (AGM-10) |
| ACT-28 | Agent : nudge « passe en Power » (max 1×/projet) jamais testé en vrai | NON FAIT | claude | 2026-08-31 | PARITY_STATUS.md (AGM-11) |
| ACT-29 | Pipeline de publication : barrières de sécurité et scan de secrets (B6) | NON FAIT | claude | 2026-09-30 | PARITY_STATUS.md (Phase B) |
| ACT-30 | Pipeline de publication : signature des images (cosign, B7) | NON FAIT | claude | 2026-09-30 | PARITY_STATUS.md (Phase B) |
| ACT-31 | Offres de déploiement Reserved VM (4 tarifs) + changement de type sans recréer | NON FAIT | claude | 2026-09-30 | P1-COV-04 |
| ACT-32 | Recréer le pool de serveurs en disques standard pour débloquer l'autoscale (GO Avi) | NON FAIT | avi | 2026-08-15 | PR-MISC-05 + ACTIONS_AVI #2 |
| ACT-33 | Bug : pousser le correctif de la page /solutions/internal-ai (testé, jamais commité) | NON FAIT | claude | 2026-08-15 | BUG_INVENTORY_LIVE.md BUG-SOL-001 |
| ACT-34 | Bug : App Builder montre des démos salon à côté de promesses de génération — corriger le discours et prouver un vrai run | NON FAIT | claude | 2026-08-31 | BUG_INVENTORY_LIVE.md BUG-SOL-002 |
| ACT-35 | Bug : la page templates est une liste figée sans recherche ni catégories | NON FAIT | claude | 2026-08-31 | BUG_INVENTORY_LIVE.md BUG-TPL-001 |
| ACT-36 | Bug : la refonte Gallery modélise encore des starters par framework au lieu d'apps communautaires | NON FAIT | claude | 2026-08-31 | BUG_INVENTORY_LIVE.md BUG-TPL-002 |
| ACT-37 | Bug : vérifier en vrai le build séquentiel Cloud Build au prochain déploiement (BUG-CI-002) | NON FAIT | claude | 2026-08-15 | BUG_INVENTORY_LIVE.md BUG-CI-002 |
| ACT-38 | Page de vente App Builder : validation du gabarit par Avi (violet résiduel + limites du run signalées) | NON FAIT | avi | 2026-08-15 | DESIGN_PROGRAM_MASTER SOL-01 + ACTIONS_AVI #9 |
| ACT-39 | Page de vente Website Builder (bloquée par la validation du gabarit) | NON FAIT | claude | 2026-09-30 | DESIGN_PROGRAM_MASTER SOL-02 |
| ACT-40 | Page de vente Game Builder | NON FAIT | claude | 2026-09-30 | DESIGN_PROGRAM_MASTER SOL-03 |
| ACT-41 | Page de vente Dashboard Builder | NON FAIT | claude | 2026-09-30 | DESIGN_PROGRAM_MASTER SOL-04 |
| ACT-42 | Page de vente Chatbot / AI Agent Builder | NON FAIT | claude | 2026-09-30 | DESIGN_PROGRAM_MASTER SOL-05 |
| ACT-43 | Page de vente Internal AI Builder | NON FAIT | claude | 2026-09-30 | DESIGN_PROGRAM_MASTER SOL-06 |
| ACT-44 | Page de vente Enterprise | NON FAIT | claude | 2026-09-30 | DESIGN_PROGRAM_MASTER SOL-07 |
| ACT-45 | Page de vente Startups | NON FAIT | claude | 2026-09-30 | DESIGN_PROGRAM_MASTER SOL-08 |
| ACT-46 | Page de vente Freelancers | NON FAIT | claude | 2026-09-30 | DESIGN_PROGRAM_MASTER SOL-09 |
| ACT-47 | Sauvetage de la spec design Solutions hors du stash volatil (PR #8 en attente de merge) | NON FAIT | claude | 2026-07-31 | PR #8 |

### 14.2 Anciens documents de parité Replit — 27 points

| ID | Point (mots simples) | Statut | Owner | Échéance | Suivi par |
|---|---|---|---|---|---|
| RPD-01 | Le système de crédits existant tourne « à blanc » : bascule réelle jamais faite (BILLING_CREDITS_ENABLED) | NON FAIT | avi | 2026-08-15 | UNK-BILLING-LEGACY-GOLIVE |
| RPD-02 | Stripe : créer les produits/prix des plans et remplacer la clé expirée (2 actions Avi) | NON FAIT | avi | 2026-08-15 | UNK-BILLING-LEGACY-GOLIVE + ACTIONS_AVI #1 |
| RPD-03 | Basculer les anciens noms de plans vers les nouveaux (pro→core, team→pro, free→starter) | NON FAIT | avi | 2026-08-15 | UNK-BILLING-LEGACY-GOLIVE |
| RPD-04 | Facturer le calcul base de données aux heures réellement actives | NON FAIT | claude | 2026-09-30 | UNK-DB-COMPUTE-METERING |
| RPD-05 | Option de paiement à l'usage (PAYG) : interface prête, activation jamais faite | NON FAIT | avi | 2026-08-15 | UNK-BILLING-LEGACY-GOLIVE |
| RPD-06 | Choix facturation annuelle dans le formulaire d'upgrade : serveur prêt, bouton absent | NON FAIT | claude | 2026-08-15 | UNK-BILLING-LEGACY-GOLIVE |
| RPD-07 | Nettoyage automatique d'inactivité : encore en mode « répétition », jamais activé pour de vrai | NON FAIT | claude | 2026-08-15 | UNK-BILLING-LEGACY-GOLIVE |
| RPD-08 | Plafonds de dépense par utilisateur (Enterprise) réellement appliqués | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-09 | Limite d'agents en parallèle selon le plan (1/2/10) réellement appliquée | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-10 | Plan Starter : une seule app publiée, limite réellement appliquée | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-11 | Plan Starter : 2 Go de stockage et liens publiés qui expirent à 30 jours | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-12 | Badge « Made with » : le retrait payant n'existe pas encore | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-13 | Régions de publication limitées selon le plan | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-14 | Plan Pro : limite de 50 spectateurs réellement appliquée | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-15 | Offre Enterprise avancée : instance dédiée, IP fixes, VPC, entrepôts de données, centre de sécurité | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-16 | Quotas de bande passante sortante par plan (ex. 100 Go Core) | NON FAIT | claude | 2026-10-31 | P1-COV-05 |
| RPD-17 | Écran admin d'édition avancée des plans et quotas | NON FAIT | claude | 2026-10-31 | PR-MISC-07 |
| RPD-18 | Profil/Préférences/Données/MCP perso en vraies pages du Dashboard | NON FAIT | claude | 2026-10-31 | PR-MISC-07 |
| RPD-19 | Certification des écrans admin en prod + test d'impersonation (nécessite la connexion d'Avi) | NON FAIT | avi | 2026-10-31 | PR-SEC-04 + ACTIONS_AVI #7 |
| RPD-20 | Appliquer les mesures pixel déjà prises (couleurs, panneaux Deploy et Git) | NON FAIT | claude | 2026-09-30 | P1-COV-07 |
| RPD-21 | Re-vérifier face à Replit les 3 éléments d'interface IDE marqués « à confirmer » | NON FAIT | claude | 2026-09-30 | P1-COV-07 |
| RPD-22 | Finition du panneau Files (attend la capture de référence d'Avi) | NON FAIT | avi | 2026-09-30 | P1-COV-07 + ACTIONS_AVI #10 |
| RPD-23 | Décision : thème clair copié de Replit, ou notre thème sombre+orange (Avi) | NON FAIT | avi | 2026-09-30 | ACTIONS_AVI #8 |
| RPD-24 | Contenu juridique définitif des 5 pages légales relu par un juriste | NON FAIT | avi | 2026-10-31 | PR-LEGAL-01 + ACTIONS_AVI #4 |
| RPD-25 | Confirmer les vraies boîtes mail appeals@ et le canal DMCA | NON FAIT | avi | 2026-10-31 | ACTIONS_AVI #5 |
| RPD-26 | Fixer les délais de support (SLA) que l'entreprise s'engage à tenir | NON FAIT | avi | 2026-11-30 | ACTIONS_AVI #6 |
| RPD-27 | Décision produit : proxy des services d'agent (phase 2 des intégrations) — faire ou abandonner | NON FAIT | claude | 2026-12-31 | PR-MISC-02 |

### 14.3 Dette héritée du fork bolt — 27 points

| ID | Point (mots simples) | Statut | Owner | Échéance | Suivi par |
|---|---|---|---|---|---|
| BD-01 | Le bouton « sync » des intégrations IDE ne fait rien ; le catalogue est figé dans le code | NON FAIT | claude | 2026-09-30 | BOLT_DEBT_REGISTRY |
| BD-02 | Le débogueur affiche des points d'arrêt décoratifs : rien ne s'arrête vraiment | NON FAIT | claude | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-03 | Les tâches planifiées par l'utilisateur (panneau Workflows) ne se déclenchent jamais — feature morte | NON FAIT | claude | 2026-09-15 | BOLT_DEBT_REGISTRY |
| BD-04 | La page facturation n'affiche pas les factures, pourtant disponibles côté serveur | NON FAIT | claude | 2026-08-31 | BOLT_DEBT_REGISTRY |
| BD-05 | Aucune cloche/badge de notifications dans l'interface | NON FAIT | claude | 2026-09-30 | BOLT_DEBT_REGISTRY |
| BD-06 | L'onglet Profil des réglages IDE stocke en local en se faisant passer pour le compte | NON FAIT | claude | 2026-09-15 | BOLT_DEBT_REGISTRY |
| BD-07 | Deux réglages contradictoires pour les clés IA personnelles (local vs admin) — sort du panneau à trancher | NON FAIT | claude | 2026-09-30 | BOLT_DEBT_REGISTRY |
| BD-08 | Cinq formulaires de jetons d'accès stockent en clair côté navigateur au lieu du coffre chiffré | NON FAIT | claude | 2026-09-30 | BOLT_DEBT_REGISTRY |
| BD-09 | L'onglet Notifications des réglages montre des logs techniques, pas les préférences | NON FAIT | claude | 2026-09-30 | BOLT_DEBT_REGISTRY |
| BD-10 | Les verrous de fichiers ne sont pas appliqués côté serveur (contournables, pas partagés entre appareils) | NON FAIT | claude | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-11 | Les outils de dev (console/réseau) ne capturent que les erreurs, pas tout le trafic | NON FAIT | claude | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-12 | Douze compteurs de supervision définis mais jamais alimentés (« no data ») | NON FAIT | claude | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-13 | Des mesures collectées (Stripe, emails, restaurations) ne sont affichées nulle part | NON FAIT | claude | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-14 | Trois fonctions admin existent côté serveur sans écran pour s'en servir | NON FAIT | claude | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-15 | Le flux de logs des pods n'a pas d'écran admin | NON FAIT | claude | 2026-11-30 | BOLT_DEBT_REGISTRY |
| BD-16 | Des pages orphelines (/search, /help, /marketplace/templates…) ne mènent nulle part | NON FAIT | claude | 2026-11-30 | BOLT_DEBT_REGISTRY |
| BD-17 | Des pages marketing figées ignorent les données réelles disponibles côté serveur | NON FAIT | claude | 2026-11-30 | BOLT_DEBT_REGISTRY |
| BD-18 | Un menu marketing existe dans le code mais n'est jamais affiché (code mort) | NON FAIT | claude | 2026-11-30 | BOLT_DEBT_REGISTRY |
| BD-19 | Parcours admin entreprise incomplet : rôles non modifiables, SSO sans relecture, ajout de membre par identifiant technique | NON FAIT | claude | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-20 | La restauration de base « point dans le temps » n'a jamais été prouvée ; l'interrupteur est éteint en prod | NON FAIT | claude | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-21 | Les connexions externes (GitHub, GitLab, Netlify, Vercel, Supabase) attendent les accès réels d'Avi | NON FAIT | avi | 2026-09-30 | BOLT_DEBT_REGISTRY |
| BD-22 | Publier chez un hébergeur externe (Netlify/Vercel) n'a jamais été prouvé, ni son retour arrière | NON FAIT | avi | 2026-10-31 | BOLT_DEBT_REGISTRY |
| BD-23 | Les serveurs MCP « stdio » sont coupés en prod ; construire le mode sécurisé ou acter l'abandon | NON FAIT | claude | 2026-11-30 | BOLT_DEBT_REGISTRY |
| BD-24 | Des erreurs de qualité de code anciennes bloquent des commits légitimes (à purger) | NON FAIT | claude | 2026-09-30 | BOLT_DEBT_REGISTRY |
| BD-25 | Le nettoyage final de la migration depuis bolt n'a jamais été fait ni déclaré caduc | NON FAIT | claude | 2026-12-31 | BOLT_DEBT_REGISTRY |
| BD-26 | Acter par écrit que la facturation a été placée dans l'espace utilisateur, pas dans l'IDE | NON FAIT | claude | 2026-08-31 | BOLT_DEBT_REGISTRY |
| BD-27 | Tableaux de bord de supervision avancés dans l'app : option jamais décidée | NON FAIT | claude | 2026-11-30 | BOLT_DEBT_REGISTRY |

### 14.4 Programme mise-en-production — 169 points (GO_LIVE_CHECKLIST 102 · REMAINING_BLOCKERS 34 · COMPLETION_MATRIX 30 · DEFERRED_HARDENING 3)

| ID | Point (mots simples) | Statut | Owner | Échéance | Suivi par |
|---|---|---|---|---|---|
| GLC-L030 | La validation de configuration production passe avec les vrais secrets (SSO, SIEM, Stripe, monitoring) | NON FAIT | claude | 2026-10-31 | PR-CFG-02 |
| GLC-L037 | Ancienne gate « dernière image committée déployée » (sha-1116d9d) (preuve : CD auto sur main via .github/workflows/deploy-main.yml, cf. docs/DEPLOY_RUNBOOK.md) | PÉRIMÉ | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L039 | Rejouer la validation runtime Kubernetes contre l'API et le workspace-manager déployés | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L040 | Rejouer la validation complète du cycle de vie workspace contre le cluster GKE réel | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L042 | Drill réseau en réel : vérifier que le trafic interdit est bien bloqué | NON FAIT | claude | 2026-09-30 | PR-ISO-02 |
| GLC-L044 | Ancienne gate « run id de validation staging fourni au déploiement prod » (preuve : CD auto sur main via .github/workflows/deploy-main.yml, cf. docs/DEPLOY_RUNBOOK.md) | PÉRIMÉ | claude | 2026-10-31 | docs/DEPLOY_RUNBOOK.md (pipeline remplacé) |
| GLC-L045 | Ancienne étape de validation production du workflow deploy-prod.yml (preuve : CD auto sur main via .github/workflows/deploy-main.yml, cf. docs/DEPLOY_RUNBOOK.md) | PÉRIMÉ | claude | 2026-10-31 | docs/DEPLOY_RUNBOOK.md (pipeline remplacé) |
| GLC-L049 | Terraform appliqué sur un projet GCP staging dédié | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| GLC-L050 | Cluster GKE applicatif staging joignable en configuration privée | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| GLC-L051 | Cluster GKE workspaces staging joignable avec pool de nœuds gVisor | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| GLC-L052 | La classe d'exécution gVisor existe dans le cluster | NON FAIT | claude | 2026-09-30 | PR-ISO-01 |
| GLC-L053 | Kyverno (contrôleur de règles d'admission) installé | NON FAIT | claude | 2026-10-31 | PR-ISO-03 |
| GLC-L054 | La règle de sécurité workspace est en mode Enforce (blocage réel) | NON FAIT | claude | 2026-10-31 | PR-ISO-03 |
| GLC-L055 | L'admission rejette tout pod workspace sans isolation gVisor | NON FAIT | claude | 2026-09-30 | PR-ISO-01 |
| GLC-L056 | L'admission rejette les pods privilégiés, avec accès hôte, tag latest ou sans limites | NON FAIT | claude | 2026-09-30 | PR-ISO-01 |
| GLC-L057 | Règles réseau (NetworkPolicies) plateforme et workspaces installées | NON FAIT | claude | 2026-09-30 | PR-ISO-02 |
| GLC-L058 | Accès au serveur de métadonnées bloqué depuis les pods workspace | NON FAIT | claude | 2026-09-30 | PR-ISO-02 |
| GLC-L059 | Accès Cloud SQL, Redis et réseaux internes bloqués depuis les workspaces | NON FAIT | claude | 2026-09-30 | PR-ISO-02 |
| GLC-L060 | Le sélecteur d'ingress dans Helm correspond au vrai contrôleur d'ingress | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| GLC-L061 | IP privée Cloud SQL et restauration à un instant donné vérifiées | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| GLC-L062 | Redis privé haute disponibilité vérifié | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| GLC-L063 | Intégration Secret Manager vérifiée | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| GLC-L064 | cert-manager et certificat TLS wildcard des previews vérifiés | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| GLC-L068 | Démarrer un workspace distant depuis l'API | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L069 | Démarrer un workspace distant depuis l'IDE | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L070 | Toutes les opérations fichiers (lire, écrire, renommer, supprimer, chercher, surveiller) fonctionnent | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L071 | Le terminal s'ouvre en WebSocket à travers l'ingress | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L072 | Reconnexion et redimensionnement du terminal fonctionnent | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L073 | Le streaming des commandes fonctionne | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L074 | Les logs remontent du workspace-manager jusqu'à l'IDE | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L075 | La détection des ports de preview fonctionne | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L076 | L'URL de preview fonctionne en HTTPS | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L077 | Arrêt, redémarrage et suppression du workspace fonctionnent | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L078 | Le disque du workspace survit à un redémarrage | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L079 | Mise en veille automatique et nettoyage des workspaces observés (preuve : BUG-CRON-001 testé live 16/07, BUG_INVENTORY_LIVE.md) | DÉJÀ FAIT | claude | 2026-09-30 | PR-RUN-01 |
| GLC-L083 | Inscription, connexion et déconnexion testées de bout en bout | NON FAIT | claude | 2026-10-31 | PR-PROD-01 |
| GLC-L084 | Vérification d'email et réinitialisation de mot de passe via un vrai fournisseur d'email | NON FAIT | claude | 2026-10-31 | PR-PROD-01 |
| GLC-L085 | Double authentification : enrôlement, connexion et codes de secours testés | NON FAIT | claude | 2026-10-31 | PR-PROD-01 |
| GLC-L086 | Connexion Google et GitHub via les vraies applications OAuth | NON FAIT | claude | 2026-10-31 | PR-PROD-01 |
| GLC-L087 | Connexion OIDC via un vrai tenant avec vérification des clés | NON FAIT | claude | 2026-10-31 | PR-PROD-01 |
| GLC-L088 | Connexion SAML via un vrai fournisseur d'identité | NON FAIT | claude | 2026-10-31 | PR-PROD-01 |
| GLC-L089 | Provisionnement et désactivation SCIM via un vrai client | NON FAIT | claude | 2026-10-31 | PR-PROD-01 |
| GLC-L090 | Cycle de vie projet complet : créer, importer, exporter, snapshot, restaurer | NON FAIT | claude | 2026-09-30 | PR-PROD-02 |
| GLC-L091 | GitHub de bout en bout : import, branche, commit, push, pull request | NON FAIT | claude | 2026-09-30 | PR-PROD-02 |
| GLC-L092 | Tous les panneaux de l'IDE testés de bout en bout | NON FAIT | claude | 2026-09-30 | PR-PROD-02 |
| GLC-L093 | Collaboration à deux : présence, édition, commentaires, lien de partage | NON FAIT | claude | 2026-11-30 | PR-PROD-03 |
| GLC-L094 | Déploiement testé de bout en bout pour chaque provider activé | NON FAIT | avi | 2026-10-31 | BD-22 |
| GLC-L095 | Rollback testé de bout en bout pour chaque provider qui le permet | NON FAIT | avi | 2026-10-31 | BD-22 |
| GLC-L096 | Domaine personnalisé testé de bout en bout | NON FAIT | claude | 2026-10-31 | PR-PROD-04 |
| GLC-L100 | Paiement Stripe (checkout) testé en mode test | NON FAIT | claude | 2026-09-15 | PR-STRIPE-01 |
| GLC-L101 | Portail client Stripe testé en mode test | NON FAIT | claude | 2026-09-15 | PR-STRIPE-01 |
| GLC-L102 | Rejet des webhooks Stripe à signature invalide testé | NON FAIT | claude | 2026-09-15 | PR-STRIPE-01 |
| GLC-L103 | Idempotence des webhooks Stripe dupliqués testée | NON FAIT | claude | 2026-09-15 | PR-STRIPE-01 |
| GLC-L104 | Événements facture payée/échouée, essai, upgrade, downgrade, annulation vérifiés | NON FAIT | claude | 2026-09-15 | PR-STRIPE-01 |
| GLC-L105 | Un changement de plan est visible dès la requête backend suivante | NON FAIT | claude | 2026-10-31 | PR-QUOTA-01 |
| GLC-L106 | Quota dépassé : le backend renvoie 429 et enregistre audit et usage | NON FAIT | claude | 2026-10-31 | PR-QUOTA-01 |
| GLC-L107 | Le quota bloque les démarrages de workspaces simultanés au-delà de la limite | NON FAIT | claude | 2026-10-31 | PR-QUOTA-01 |
| GLC-L108 | Le dépassement accordé par un admin est audité et expire automatiquement | NON FAIT | claude | 2026-10-31 | PR-QUOTA-01 |
| GLC-L109 | Le tableau de bord facturation correspond à l'état backend et Stripe | NON FAIT | claude | 2026-09-30 | PR-STRIPE-02 |
| GLC-L118 | Protection CSRF vérifiée sur toutes les mutations, navigateur et API | NON FAIT | claude | 2026-10-31 | PR-SEC-03 |
| GLC-L120 | Secret canari introuvable dans logs API, runtime, sorties IA, vues admin, exports et logs de déploiement | NON FAIT | claude | 2026-09-30 | PR-SEC-02 |
| GLC-L121 | Test d'intrusion externe planifié avant le lancement payant | NON FAIT | avi | 2026-11-30 | PR-SEC-01 |
| GLC-L122 | Audit navigateur des actions admin dangereuses réussi | NON FAIT | claude | 2026-10-31 | PR-SEC-04 |
| GLC-L123 | Livraison des alertes d'abus vers une vraie cible SIEM observée | NON FAIT | claude | 2026-10-31 | PR-SEC-05 |
| GLC-L127 | Métriques Prometheus collectées depuis staging | NON FAIT | claude | 2026-10-31 | PR-OPS-01 |
| GLC-L128 | Tableau de bord Grafana importé et alimenté | NON FAIT | claude | 2026-10-31 | PR-OPS-01 |
| GLC-L129 | Règles d'alerte chargées et routées vers l'astreinte | NON FAIT | claude | 2026-10-31 | PR-OPS-01 |
| GLC-L130 | Vérifications synthétiques (robots de surveillance) en fonctionnement | NON FAIT | claude | 2026-10-31 | PR-OPS-01 |
| GLC-L131 | Erreurs visibles dans Sentry/OTLP | NON FAIT | claude | 2026-10-31 | PR-OPS-01 |
| GLC-L132 | Exercice de restauration Cloud SQL exécuté | NON FAIT | claude | 2026-09-30 | PR-DR-01 |
| GLC-L133 | Exercice de restauration du stockage projets exécuté | NON FAIT | claude | 2026-09-30 | PR-DR-01 |
| GLC-L134 | Temps de reprise et perte maximale (RTO/RPO) mesurés et documentés | NON FAIT | claude | 2026-09-30 | PR-DR-01 |
| GLC-L135 | Runbook de reprise après sinistre exercé | NON FAIT | claude | 2026-10-31 | PR-DR-02 |
| GLC-L136 | Rollback Helm exercé | NON FAIT | claude | 2026-10-31 | PR-DR-02 |
| GLC-L137 | Retour arrière Terraform exercé | NON FAIT | claude | 2026-10-31 | PR-DR-02 |
| GLC-L138 | Processus de page de statut testé | NON FAIT | claude | 2026-10-31 | PR-DR-02 |
| GLC-L142 | Test de charge API exécuté contre staging | NON FAIT | claude | 2026-10-31 | PR-LOAD-01 |
| GLC-L143 | Test de charge du cycle de vie workspace exécuté contre staging | NON FAIT | claude | 2026-10-31 | PR-LOAD-02 |
| GLC-L144 | Test de charge des previews exécuté contre staging | NON FAIT | claude | 2026-10-31 | PR-LOAD-03 |
| GLC-L145 | Test de charge IA simulée exécuté contre staging | NON FAIT | claude | 2026-10-31 | PR-LOAD-04 |
| GLC-L146 | Test de charge des webhooks facturation exécuté contre staging | NON FAIT | claude | 2026-10-31 | PR-LOAD-05 |
| GLC-L147 | Objectif de capacité de la beta privée atteint | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| GLC-L148 | Objectif de capacité 1 000 utilisateurs atteint | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| GLC-L149 | Modèle de capacité 10 000 utilisateurs validé | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| GLC-L150 | Modèle de coût mis à jour avec les mesures réelles | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| GLC-L157 | Pipeline iOS signé (IPA/TestFlight) vérifié | NON FAIT | avi | 2026-12-31 | PR-MOB-01 |
| GLC-L158 | Pipeline Android signé (AAB/piste interne Play) vérifié | NON FAIT | avi | 2026-12-31 | PR-MOB-02 |
| GLC-L159 | Validation release mobile passe avec le vrai domaine de production | NON FAIT | claude | 2026-09-30 | PR-MOB-04 |
| GLC-L161 | Vérification des assets de release mobile passe avec les vraies métadonnées | NON FAIT | claude | 2026-09-30 | PR-MOB-04 |
| GLC-L164 | Notifications push APNs et FCM vérifiées | NON FAIT | claude | 2026-12-31 | PR-MOB-03 |
| GLC-L165 | QA de l'éditeur sur vrais téléphones et tablettes effectuée | NON FAIT | claude | 2026-12-31 | PR-MOB-05 |
| GLC-L166 | Build macOS signé vérifié | NON FAIT | avi | 2026-12-31 | PR-DESK-01 |
| GLC-L167 | Build Windows signé vérifié | NON FAIT | avi | 2026-12-31 | PR-DESK-01 |
| GLC-L168 | Paquet Linux vérifié | NON FAIT | avi | 2026-12-31 | PR-DESK-01 |
| GLC-L169 | Exercice de mise à jour automatique desktop effectué | NON FAIT | avi | 2026-12-31 | PR-DESK-01 |
| GLC-L173 | Conditions d'utilisation relues par un juriste | NON FAIT | avi | 2026-10-31 | PR-LEGAL-01 |
| GLC-L174 | Politique de confidentialité relue par un juriste | NON FAIT | avi | 2026-10-31 | PR-LEGAL-01 |
| GLC-L175 | Accord de traitement des données (DPA) rédigé et relu | NON FAIT | avi | 2026-10-31 | PR-LEGAL-01 |
| GLC-L176 | Liste des sous-traitants publiée | NON FAIT | avi | 2026-10-31 | PR-LEGAL-01 |
| GLC-L177 | Politique d'usage acceptable liée depuis l'inscription | NON FAIT | avi | 2026-10-31 | PR-LEGAL-01 |
| GLC-L178 | Politique de rétention des données alignée avec le code | NON FAIT | avi | 2026-11-30 | PR-LEGAL-02 |
| GLC-L179 | Responsables des contrôles SOC2 désignés | NON FAIT | avi | 2026-11-30 | PR-LEGAL-02 |
| RB-L009 | Preuve E2E complète du runtime Kubernetes après déploiement (fichiers, terminal, logs, preview, snapshot) | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| RB-L015 | Isolation des workspaces prouvée en réel (gVisor, pods restreints, trafic interdit bloqué) | NON FAIT | claude | 2026-09-30 | PR-ISO-01 |
| RB-L022 | Configuration production complète : renseigner les secrets externes manquants (SSO, SIEM, Stripe, monitoring, SOC2) | NON FAIT | avi | 2026-10-31 | PR-CFG-01 |
| RB-L037 | Parcours Stripe en mode test vérifié (clé expirée à remplacer d'abord) | NON FAIT | claude | 2026-09-15 | PR-STRIPE-01 |
| RB-L042 | Restauration des sauvegardes prouvée en staging avec temps mesurés | NON FAIT | claude | 2026-09-30 | PR-DR-01 |
| RB-L047 | Les cinq tests de charge exécutés avec rapports chiffrés | NON FAIT | claude | 2026-10-31 | PR-LOAD-01 |
| RB-L052 | Audit navigateur complet des actions admin dangereuses | NON FAIT | claude | 2026-10-31 | PR-SEC-04 |
| RB-L059 | Secret canari prouvé absent de toutes les sorties en réel | NON FAIT | claude | 2026-09-30 | PR-SEC-02 |
| RB-L069 | Preuve Stripe mode test complète et documentée | NON FAIT | claude | 2026-09-15 | PR-STRIPE-01 |
| RB-L070 | Application des quotas mesurée sous pression simultanée (workspaces, IA, facturation) | NON FAIT | claude | 2026-10-31 | PR-QUOTA-01 |
| RB-L071 | Tableau de bord facturation rapproché de l'état Stripe | NON FAIT | claude | 2026-09-30 | PR-STRIPE-02 |
| RB-L072 | Déploiement et rollback prouvés en sandbox pour chaque provider activé au lancement | NON FAIT | avi | 2026-10-31 | BD-22 |
| RB-L073 | Revue juridique : conditions, confidentialité, DPA, usage acceptable, sous-traitants | NON FAIT | avi | 2026-10-31 | PR-LEGAL-01 |
| RB-L074 | Monitoring production, alertes, webhook incident et astreinte opérationnels | NON FAIT | avi | 2026-11-30 | PR-OPS-02 |
| RB-L075 | Rollback exercé en staging | NON FAIT | claude | 2026-10-31 | PR-DR-02 |
| RB-L079 | Latence du scaling des nœuds workspace et de la création des disques mesurée | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| RB-L080 | Concurrence des terminaux et débit des previews mesurés | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| RB-L081 | Latence et pools de connexions Cloud SQL et Redis mesurés sous charge | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| RB-L082 | Stratégie de limitation et de repli des fournisseurs IA testée | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| RB-L083 | Exercices de détection d'abus exécutés et livraison SIEM observée | NON FAIT | claude | 2026-10-31 | PR-SEC-05 |
| RB-L084 | Processus support et réponse aux incidents staffé et répété | NON FAIT | avi | 2026-11-30 | PR-OPS-02 |
| RB-L088 | Décision multi-région ou mono-région documentée et validée | NON FAIT | avi | 2026-12-31 | PR-DR-03 |
| RB-L089 | Dimensionnement GKE, Cloud SQL et Redis basé sur des mesures réelles | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| RB-L090 | Profondeur des files et scaling des workers testés | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| RB-L091 | Modèle de coût du trafic preview et des déploiements validé | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| RB-L092 | Modèle de quota, débit et coût des fournisseurs IA validé | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| RB-L093 | Exercice de reprise après sinistre répété à l'échelle | NON FAIT | avi | 2026-12-31 | PR-DR-03 |
| RB-L097 | Preuve iOS : IPA signé et TestFlight | NON FAIT | avi | 2026-12-31 | PR-MOB-01 |
| RB-L098 | Preuve Android : AAB signé et piste interne Play | NON FAIT | avi | 2026-12-31 | PR-MOB-02 |
| RB-L099 | Preuve notifications push APNs et FCM | NON FAIT | claude | 2026-12-31 | PR-MOB-03 |
| RB-L100 | App links publiés avec les vrais domaines de production (encore app.example.com) | NON FAIT | claude | 2026-09-30 | PR-MOB-04 |
| RB-L104 | QA de l'éditeur sur vrais téléphones et tablettes | NON FAIT | claude | 2026-12-31 | PR-MOB-05 |
| RB-L105 | Artefacts desktop signés macOS, Windows et Linux | NON FAIT | avi | 2026-12-31 | PR-DESK-01 |
| RB-L106 | Exercice de mise à jour automatique desktop | NON FAIT | avi | 2026-12-31 | PR-DESK-01 |
| CM-2 | Adaptateur runtime : validation contre un vrai cluster Kubernetes encore manquante | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| CM-4 | Mode Kubernetes distant : preuve sur le vrai cluster GKE manquante | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| CM-5 | Authentification : preuve avec fournisseurs d'identité et email réels manquante | NON FAIT | claude | 2026-10-31 | PR-PROD-01 |
| CM-7 | SSO/SCIM entreprise : preuve avec un vrai fournisseur d'identité manquante | NON FAIT | avi | 2026-10-31 | PR-CFG-01 |
| CM-8 | Projets : gros projets et restauration du stockage non prouvés en réel | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| CM-9 | Opérations fichiers : non prouvées sur un workspace GKE réel | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| CM-10 | Terminal : WebSocket à travers le vrai ingress non prouvé | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| CM-11 | Preview : TLS wildcard, routage des ports et domaine custom non prouvés en réel | NON FAIT | claude | 2026-09-30 | PR-RUN-01 |
| CM-12 | Outils IA : limitation, repli, BYOK et registre de coûts non prouvés en réel | NON FAIT | claude | 2026-12-31 | PR-SCALE-01 |
| CM-13 | Facturation : parcours Stripe réel non exercé | NON FAIT | claude | 2026-09-15 | PR-STRIPE-01 |
| CM-14 | Quotas : comportement sous charge réelle non prouvé | NON FAIT | claude | 2026-10-31 | PR-QUOTA-01 |
| CM-15 | Admin : audit navigateur complet des routes et boutons dangereux manquant | NON FAIT | claude | 2026-10-31 | PR-SEC-04 |
| CM-16 | Application desktop : builds signés et mise à jour automatique non vérifiés | NON FAIT | avi | 2026-12-31 | PR-DESK-01 |
| CM-17 | Application iOS : build signé et TestFlight non vérifiés | NON FAIT | avi | 2026-12-31 | PR-MOB-01 |
| CM-18 | Application Android : build signé et piste Play non vérifiés | NON FAIT | avi | 2026-12-31 | PR-MOB-02 |
| CM-19 | Expérience tablette : QA sur vrais appareils manquante | NON FAIT | claude | 2026-12-31 | PR-MOB-05 |
| CM-20 | Éditeur mobile de secours : QA sur vrais téléphones manquante | NON FAIT | claude | 2026-12-31 | PR-MOB-05 |
| CM-21 | Collaboration : pas de CRDT/OT pour une édition multi-auteurs sûre | NON FAIT | claude | 2026-11-30 | PR-PROD-03 |
| CM-22 | Déploiements : exécution sandbox et rollback des providers non exercés en réel | NON FAIT | avi | 2026-10-31 | BD-22 |
| CM-23 | Sécurité : durcissement CSP styles, pentest externe et canari live manquants | NON FAIT | avi | 2026-11-30 | PR-SEC-01 |
| CM-24 | Isolation workspace : non prouvée dans le cluster réel | NON FAIT | claude | 2026-09-30 | PR-ISO-01 |
| CM-25 | Règles réseau : drill de trafic interdit non exécuté en réel | NON FAIT | claude | 2026-09-30 | PR-ISO-02 |
| CM-26 | Règles d'admission : Kyverno non installé ni prouvé en staging | NON FAIT | claude | 2026-10-31 | PR-ISO-03 |
| CM-27 | Détection d'abus : seuils et livraison SIEM non observés sous vrai trafic | NON FAIT | claude | 2026-10-31 | PR-SEC-05 |
| CM-28 | Observabilité : métriques, alertes et synthetics non déployés ni observés en réel | NON FAIT | claude | 2026-10-31 | PR-OPS-01 |
| CM-29 | Sauvegardes : aucun exercice de restauration réel, RTO/RPO non mesurés | NON FAIT | claude | 2026-09-30 | PR-DR-01 |
| CM-30 | CI/CD : pipeline complet et rollback non exercés avec les vrais environnements | NON FAIT | claude | 2026-10-31 | PR-DR-02 |
| CM-31 | Infra GCP : Terraform non appliqué sur un vrai projet dans cette revue | NON FAIT | avi | 2026-11-30 | PR-INFRA-01 |
| CM-32 | Tests de charge : aucun rapport k6 exécuté contre staging | NON FAIT | claude | 2026-10-31 | PR-LOAD-01 |
| CM-34 | Pages légales : versions approuvées par un juriste manquantes | NON FAIT | avi | 2026-10-31 | PR-LEGAL-01 |
| DH-1 | Migration React Router 7 pour purger l'alerte sécurité turbo-stream (chantier 6-8 semaines) | NON FAIT | claude | 2026-12-31 | PR-RR7-01 |
| DH-2A | Réduire les permissions OAuth des nœuds GKE (recréation supervisée du pool) | NON FAIT | avi | 2026-11-30 | PR-ISO-04 |
| DH-2B | Installer Kyverno en mode audit puis blocage, règle par règle | NON FAIT | claude | 2026-10-31 | PR-ISO-03 |

### 14.5 Restes des rapports outputs/ — 66 points (état final, master, audit log, bugs P2, design A–I, 23 drives QA, 15 scénarios UI)

| ID | Point (mots simples) | Statut | Owner | Échéance | Suivi par |
|---|---|---|---|---|---|
| OUT-EF-01 | Panneau Monitoring du projet : affichage partiel en lecture seule, sans vraies métriques dédiées | NON FAIT | claude | 2026-10-31 | BD-28 |
| OUT-EF-02 | Historique des chats hors projet stocké seulement dans le navigateur, non synchronisé entre appareils | NON FAIT | claude | 2026-11-30 | BD-29 |
| OUT-EF-03 | Instabilité récurrente des tests automatiques (timeout onTaskUpdate) qui fait échouer la chaîne CI | NON FAIT | claude | 2026-09-30 | PR-MISC-01 |
| OUT-EF-04 | Renseigner les identifiants OAuth des connecteurs (GitHub, GitLab, Netlify, Vercel, Supabase) | NON FAIT | avi | 2026-09-30 | BD-21 |
| OUT-EF-05 | Fournir les vraies clés des fournisseurs d'IA pour prouver le cache et la latence | NON FAIT | claude | 2026-08-31 | PR-MISC-04 |
| OUT-EF-06 | Brancher un vrai fournisseur d'identité SSO/SCIM pour prouver la connexion entreprise de bout en bout | NON FAIT | avi | 2026-10-31 | PR-CFG-01 |
| OUT-EF-07 | Rotation des secrets et purge de l'historique git (précaution, en attente du GO d'Avi) | NON FAIT | avi | 2026-11-30 | PR-CFG-03 |
| OUT-M-01 | Fuite du tokenHash dans la liste des invitations d'organisation (correctif prêt : PR #6, en attente de merge) | NON FAIT | claude | 2026-08-31 | PR #6 |
| OUT-M-02 | Compteurs de métriques IA comptés par serveur isolé : il faut un agrégateur Prometheus couvrant tous les pods | NON FAIT | claude | 2026-10-31 | PR-OPS-01 |
| OUT-M-03 | Preuve du cache IA incomplète : blocage par le quota de tokens de l'organisation de test | NON FAIT | claude | 2026-08-31 | PR-MISC-04 |
| OUT-M-04 | Cache IA non implémenté pour environ 13 fournisseurs restants (dont le mode explicite Gemini) | NON FAIT | claude | 2026-08-31 | PR-MISC-04 |
| OUT-M-05 | Preuve réelle d'économie de cache faite seulement pour OpenAI ; autres fournisseurs en attente de clés | NON FAIT | claude | 2026-08-31 | PR-MISC-04 |
| OUT-M-06 | Rotation des jetons SCIM avec double validité 24 h : à prouver en conditions réelles | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-BI-01 | Bug mineur différé : clé de liste des messages du chat basée sur la position (impact quasi nul) | NON FAIT | claude | 2026-12-31 | PR-MISC-06 |
| OUT-BI-02 | Bug mineur différé : code mort d'échelle d'affichage dans l'aperçu (aucun impact utilisateur) | NON FAIT | claude | 2026-12-31 | PR-MISC-06 |
| OUT-DAL-01 | A1 : derniers réglages de couleurs (teintes sombres marketing) jamais portés dans la palette réellement utilisée | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-02 | E18 : page support, délais de réponse par offre encore provisoires, à valider par l'équipe support | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-03 | E27 : admin support, délai de première réponse encore provisoire, à valider par les opérations | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-04 | G13 : requêtes destructrices en base, simple relecture affichée au lieu d'une saisie de confirmation exigée | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-05 | F15 : SSO, test de connexion, application forcée avec délai de grâce et exemption propriétaire côté serveur | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-06 | F16 : SCIM, rotation en deux phases et liste des utilisateurs provisionnés à construire côté serveur | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-07 | H23 : page paramètres de compte unifiée codée mais pas encore certifiée en réel à l'écran | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-08 | I3 : pages légales, vraies dates de dernière mise à jour à fournir par Avi | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-09 | I6 : SIEM, bouton « envoyer un événement de test » en attente d'un vrai point d'envoi serveur | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-10 | I18 : onglet de mise à jour auto-hébergée, décider s'il faut le retirer du panneau SaaS | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-11 | I20 : galerie publique d'exploration, décider entre vraie construction ou simple redirection | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-12 | I21 : page /docs, décider entre vraie intégration du guide ou redirection | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-DAL-13 | I25 : détail d'un ticket support, nécessite un accès aux messages du ticket, à confirmer | NON FAIT | claude | 2026-09-30 | PR-MISC-03 |
| OUT-QA-01 | Test navigateur du panneau Fichiers : créer, renommer et supprimer un fichier en réel | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-02 | Test navigateur de l'éditeur : modifier, sauvegarder, annuler et gérer plusieurs onglets | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-03 | Test navigateur de la recherche dans le projet (avec et sans expressions régulières) | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-04 | Test navigateur de l'aperçu : l'application s'affiche et se recharge correctement | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-05 | Test navigateur de l'inspecteur : cliquer un élément ouvre le fichier source à la bonne ligne | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-06 | Test navigateur du terminal : commandes simples et bon dossier de travail | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-07 | Test navigateur du panneau Ports : le port 5173 est listé avec son lien d'aperçu | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-08 | Test navigateur du stockage d'objets : envoyer un fichier puis le relire | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-09 | Test navigateur de la base de données : créer, insérer et relire une ligne en SQL | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-10 | Test navigateur des packages : ajouter une dépendance et vérifier son installation | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-11 | Test navigateur des skills : installer une skill depuis le catalogue GitHub | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-12 | Test navigateur des logs : les journaux défilent en direct pendant une action | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-13 | Test navigateur des variables d'environnement : variable par environnement et différences visibles | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-14 | Test navigateur des secrets : ajouter un secret et le retrouver dans l'environnement du terminal | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-15 | Test navigateur du déploiement : publier et vérifier que l'URL en ligne répond | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-16 | Test navigateur des domaines : ajouter un domaine et voir les instructions DNS | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-17 | Test navigateur de l'activité : le fil montre les vrais événements du projet | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-18 | Test navigateur des réglages projet : un changement sauvegardé persiste au rechargement | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-19 | Test navigateur des snapshots : créer une sauvegarde puis la restaurer | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-20 | Test navigateur des collaborateurs : inviter quelqu'un par email crée bien l'invitation | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-21 | Test navigateur de l'Agent Studio : lancer un agent et voir ses sous-agents travailler | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-22 | Test navigateur de Git : créer un commit, une branche et voir les différences | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-QA-23 | Test navigateur du panneau Monitoring : les métriques d'état du runtime s'affichent | NON FAIT | claude | 2026-10-31 | PR-QA-01 |
| OUT-UI-01 | Vérifier à l'écran que fermer la page réglages ramène à la page précédente | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-02 | Vérifier à l'écran qu'une erreur console de l'aperçu ouvre le fichier à la bonne ligne | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-03 | Vérifier à l'écran les workflows : lancement manuel, statut, durée et journaux par étape | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-04 | Vérifier à l'écran l'export de mes données : téléchargement JSON complet sans aucun secret | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-05 | Vérifier tous les panneaux en thème clair et sombre : lisibilité et contrastes corrects | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-06 | Vérifier à l'écran l'ajustement d'un portefeuille de crédits avec motif obligatoire et journal | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-07 | Vérifier à l'écran les actions sur un événement d'abus : ignorer, avertir, suspendre | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-08 | Vérifier à l'écran les événements de sécurité : filtre par gravité et résolution avec note | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-09 | Vérifier à l'écran l'export admin des données d'un utilisateur (téléchargement JSON audité) | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-10 | Vérifier à l'écran les aperçus admin : durée de vie restante, arrêt, réglage par défaut | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-11 | Vérifier à l'écran les coûts admin : barres sur 30 jours et budget mensuel avec alertes | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-12 | Vérifier à l'écran les métriques fournisseurs IA : latence p95 et taux d'erreur réels | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-13 | Prouver en réel qu'un tour avec le modèle Auto est bien routé automatiquement | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-14 | Prouver en réel que l'estimateur réduit le budget de tokens sur une toute petite modification | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
| OUT-UI-15 | Prouver en réel la récupération automatique quand une modification ciblée de fichier échoue | NON FAIT | claude | 2026-10-31 | PR-QA-02 |
