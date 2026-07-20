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
version: 2026-07-20.4
baseline: périmètre public Replit observé au 16–20/07/2026 (PUBLIC_BASELINE_REPLIT_2026.yaml)
planCommit: d1063912acf8bbbc2dabf7941490be33e4c87b51                                      # backfillé au commit suivant (même mécanique que P0-V3-15)
measuredCodeCommit: b774bfa38e881ebaa071fbf2c2fa9d72ab89efb5    # origin/main mesuré (17/07) — le code n'a pas été re-mesuré ce jour
registryCommit: d1063912acf8bbbc2dabf7941490be33e4c87b51                                  # commit des registres compagnons (= planCommit, même PR)
statusCommit: d1063912acf8bbbc2dabf7941490be33e4c87b51                                    # commit du APPROVAL_STATUS.json regénéré
statusGeneratorCommit: d1063912acf8bbbc2dabf7941490be33e4c87b51                         # commit du script générateur (aligné à la lettre de l'audit, réconciliation A2)
mergedToMainAt: null                                            # honnête — PR ouverte, rien n'est mergé
generatedAt: "2026-07-20T12:30:00Z"                             # horodatage RÉEL, POSTÉRIEUR au scan intégré (P0-LS-11)
auditCouverture: docs/parity/COVERAGE_GAP_AUDIT_2026-07-17.md   # confrontation à TOUS les anciens plans (2026-07-19)
auditReanalyse: Audit_reanalyse_PLAN_PARITE_REPLIT_LIVRAISON_2_2026.docx  # 16 P0 + 14 P1 appliqués (2026-07-20)
branche: docs/plan-parite-audit2
statutCalcule: docs/parity/APPROVAL_STATUS.json (overallStatus + highestPassedLevel — JAMAIS saisi ici, voir §7 et §11)
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

**Taxonomie des états** : 📤 Dispatché · 💻 Codé (commité+poussé main) ·
✅ Testé live (écran + greps, web/tablette/mobile). Un point n'est « fait »
QUE quand ✅ est coché.

**Hiérarchie documentaire** (P1-A2-09 — aucun état dupliqué) :
1. **Normatif** : CE plan + les contrats de domaine (`*_CONTRACT.md`,
   `DOMAIN_MODEL.md`) — des règles, jamais des états.
2. **Source d'état** : les registres (`P0_REGISTRY`, `UNKNOWN_REGISTRY`,
   `DECISION_REGISTRY`, `SURFACE_REGISTRY`, `E2E_PROOFS`,
   `LEGACY_FINDING_REGISTRY`, `WORK_ITEM_REGISTRY`, baseline/claims).
3. **Vues GÉNÉRÉES** : `APPROVAL_STATUS.json`, `DOCUMENT_MANIFEST.yaml`,
   `PARITY_STATUS.md` (vue humaine, produite par
   `generate-parity-status.mjs`, drift-check CI) — jamais éditées à la main.
   La seule partie humaine de cette vue est `PARITY_STATUS_NOTES.md`
   (détail par chantier), **maintenue à la main et déclarée comme telle**,
   embarquée verbatim par le générateur.
4. **Historique** : `CHANGELOG_AUDIT.md` (append-only) + les 4 fichiers de
   suivi racine (délégation explicite, régénérés après D1).

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
Profiles (**première observation enregistrée** le 16/07/2026, hors
documentation, `[RPL-19]` — aucune date de lancement officielle archivée ;
aveuglement mesuré depuis l'eventDate estimé : 2 jours, `OBS-COMMUNITY-PROFILES`). Le collecteur
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
`RPL-2026-001…005`, `RPL-17…26`, `GCP-11…15`. Les étiquettes héritées du v5
(`RPL-01…16`, `GCP-01…10`, `NIX-01`) citent des sources officielles mais ne
sont **pas encore ancrées individuellement** (hash+snapshot) : leur statut est
**UNVERIFIED** et le générateur calcule `unanchoredClaims` (toute étiquette
citée par ce plan et absente du baseline). **`sourceBaselineReady` ÉCHOUE tant
que `unanchoredClaims > 0`** — aucun gate ne peut plus être vert sur une claim
non ancrée (P0-A2-15, `UNK-CLAIMS-ANCHORING`, cible 2026-08-15).

Corrections factuelles portées le 17/07/2026 (détail : `CHANGELOG_AUDIT.md`) :
- **Import** : le hub « Import from a provider » compte **12 entrées dont
  Empty ET Previous Agent export** — CONFIRMÉ `[RPL-24]` (snapshot hashé).
  L'ancien comptage à 11 (Previous Agent export manquant) est remplacé.
  Convention unique : **12 entrées dont Empty**.
- **Cloud Run multi-région** : l'ancien claim « pas de failover automatique »
  (étiqueté RPL-23 dans le v5) est **remplacé par `GCP-11`** — source cloud,
  pas produit Replit. Voir §4.6.
- **Artifact Registry attachments** : **Preview** — CONFIRMÉ `[GCP-12]`
  (bannière Pre-GA dans le snapshot hashé) ; **la suppression de l'image cible
  supprime aussi ses attachments** (même snapshot). Voir §4.5.

Corrections factuelles portées le 20/07/2026 (audit de réanalyse) :
- **Workload Identity** : « WIF uniquement si source externe » était **FAUX
  pour GKE** — remplacé par trois chemins d'identité, CONFIRMÉ `[GCP-13]`
  (citation exacte dans le claim). Voir §4.4.
- **Auth Clerk** : « migration documentée » était trop large — la doc couvre
  **custom-auth → Clerk** ; le guide **Replit Auth → Clerk** est « coming
  soon » ; **MFA/SMS/orgs ne sont PAS supportés** par Clerk Auth Replit —
  CONFIRMÉ `[RPL-25]`/`[RPL-26]`. Voir §3.9.
- **Cloud Run multi-tenant** : architecture officielle du 17/07 intégrée —
  CONFIRMÉ `[GCP-14]`/`[GCP-15]`. Voir §4.2–4.3.

Faits portés le 20/07/2026 (LIVE SCAN rendu JS anonyme, captures hashées —
`REPLIT_LIVE_SCAN_2026-07-20.md` sha256 `396b07e2…` — corrigés par l'audit
expert du même jour, P0-LS-01…18) :
- **Les deltas du scan sont des OBSERVATIONS, pas des surfaces** : les
  « 15 nouveautés » (Spreadsheet, Gallery publique, Community Profiles,
  Experts, Parallel Agents, General Agent, Clerk Auth, warehouse, MCP Server,
  design system org, custom templates, écosystème, pricing, imports
  concurrents, Vibe Coding 101) sont `OBS-DELTA-20260720-01…15` **à
  classifier** vers des **registres séparés** (§6) — surfaces / capacités /
  intentions / kinds / connecteurs / entitlements / écosystème ne
  s'additionnent pas (P0-LS-01).
- **Prix = observations contextualisées, jamais des constantes** — CONFIRMÉ
  `[RPL-27]` (Starter gratuit · Core $20 observé au scan, **$25 selon la
  vérification expert — divergence conservée** · Pro $100 · Enterprise sur
  devis ; **Teams retiré comme offre**, capacités d'équipe conservées).
  Limites du gratuit — CONFIRMÉ `[RPL-28]` : 1 app publiée expirant à
  30 jours, Lite build seul. Voir §3.12 et
  `OFFERING_ENTITLEMENT_REGISTRY.yaml`.
- **Constats de retrait reformulés** — CONFIRMÉ `[RPL-29]` : Max mode et
  starter templates RETIRÉS (preuves positives) ; **GitLab = pas une tuile du
  hub courant, capacité git plus large UNKNOWN — jamais « retiré »**
  (P0-LS-05) ; **/@user : une seule route testée, inférence limitée**
  (P0-LS-14) ; Bounties → Experts (pivot).
- **MCP Server** — CONFIRMÉ `[RPL-30]` : `DOC_CURRENT_BETA` ;
  `PublicApiStatus: UNKNOWN` — pas de « remplacement » affirmé (P0-LS-13).
- **24 points sans trace** → `UNK-LS-*` (les 4 faux sans-trace — Preview
  DevTools, Library, Android Emulator, Grouped Publish — reclassés 📘
  DOC-JOUR après vérification directe du corpus hashé du jour,
  P0-LS-06…09) + `UNK-LS-GITLAB-GIT`. Vérification = vrai compte connecté
  (session dédiée, P0-LS-18).

---

## 3. Modèle produit

### 3.0 Project → Artifacts — le cœur du produit 2026 (normatif)

CONFIRMÉ `[RPL-03]` *(What's an Artifact? — étiquette héritée, ancrage
UNK-CLAIMS-ANCHORING)* : un projet Replit contient jusqu'à **7 Artifacts dont
1 seule app mobile** ; les Artifacts **partagent backend et données** et sont
**publiés ensemble**. *(L'Artifact UTILISATEUR de ce §3.0 n'a RIEN à voir avec
Artifact Registry, §4.5 — deux objets entièrement différents.)*

```
Project { projectId, ownerBoundary, manifestVersion, sharedBackendRef, sharedDataRefs[] }
Artifact { artifactId, projectId, type, sourceRoot, previewConfig, publishConfig }
Component { componentId, artifactId, kind, sourcePath }
ProjectRevision { sourceDigest, manifestDigest, environmentLockDigest, artifactRevisionDigests[] }
ArtifactRevision { artifactId, revisionDigest, buildConfigDigest }
ArtifactKind ∈ { WEB_APP, MOBILE_APP, DATA_VISUALIZATION, SLIDE_DECK,
                 ANIMATION_VIDEO, DESIGN, EXPERIENCE_3D }   # ARTIFACT_KIND_REGISTRY — rien d'autre
SharedBackendBinding { projectId, backendRef, dataRefs[], accessPolicy }
ProjectRelease { projectRevisionDigest, publicationMode: GROUPED, deploymentRevisionIds[] }
```

**Corrections de taxonomie (P0-LS-02/03/04)** : `SERVICE`/`JOB`/`STATIC_SITE`
ne sont PAS des Artifacts — ce sont des **composants** ou des modes de
**déploiement** (`COMPONENT_KIND_REGISTRY`, `DEPLOYMENT_TYPE_REGISTRY`).
`DOCUMENT`/`SPREADSHEET` sont des **intentions de création** + **assets
générés** (`CREATION_INTENT_REGISTRY`, `GENERATED_ASSET_KIND_REGISTRY`) tant
que leur publication autonome n'est pas prouvée.

DÉCISION E-CODE : les limites **7 artifacts / 1 mobile sont des ENTITLEMENTS
configurables** (jamais codées en dur) ; la publication est **groupée**
(`publicationMode: GROUPED`) — la publication indépendante par artifact est
HORS parité courante (extension éventuelle, décision séparée). Toute release
naît d'un `ProjectRevision` pinné ; le §4.7 (ReleaseManifest) consomme
`artifactRevisionDigests[]` tel quel.

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

- CONFIRMÉ `[RPL-13]` : **Replit Auth** et **Clerk Auth** sont **deux
  produits distincts** (« Clerk-compatible » est un défaut de langage).
- CONFIRMÉ `[RPL-26]` : la migration documentée est **auth personnalisée →
  Clerk Auth** (import des users + password digests, `externalId` →
  `sessionClaims.userId`).
- INCONNU / NON LIVRÉ : le guide **Replit Auth → Clerk Auth** — la doc dit
  « official guidance for that migration path is **coming soon** » `[RPL-26]`.
- CONFIRMÉ `[RPL-25]` : Clerk Auth (Replit-managed) supporte email/password,
  Google, GitHub, Apple, X, user management, sessions, environnements
  **DEV/PROD isolés**. **« What's not supported » : SMS, MFA end-user,
  couverture SSO complète, Organization tenants.**
- DÉCISION E-CODE : **MFA, passkeys, récupération renforcée et organisations
  sont des EXTENSIONS E-Code** — jamais présentées comme parité Replit
  courante. Restent requis en parité : provider adapter, dev/prod, session
  fixation, migration sans perte, logout, et la séparation des **trois
  identités** (plateforme E-Code / app publiée / utilisateurs finaux).

### 3.10 Secret proxy

CONFIRMÉ `[RPL-06]` : proxy transparent confirmé pour MCP ; Connectors =
direction en cours, pas un état livré. Contrat séparé : lease, scope,
revocation, redaction, audit, circuit breaker, zero exposure.

### 3.11 Les 4 types de déploiement — contractualisés

**Autoscale · Static · Reserved VM · Scheduled** ne sont plus des lignes de
backlog : contrat produit complet dans `DEPLOYMENT_TYPES_CONTRACT.md`
(lifecycle, config, port, secrets, coûts, observabilité, **changement de type
sans recréer l'app**, preuve exigée par type — P0-A2-04). État réel mesuré :
Autoscale et Scheduled prouvés live (pipeline + cron volume réel), Static en
prod, **Reserved VM NON FAIT** (P1-COV-04). Un type non contractualisé
n'existe pas. Registre : `DEPLOYMENT_TYPE_REGISTRY.yaml`.

### 3.12 Offres et entitlements mesurés (observations, jamais des constantes)

`OFFERING_ENTITLEMENT_REGISTRY.yaml` — chaque prix est une **observation**
avec geo/locale/cohorte/date/hash (P0-LS-10). Au 20/07/2026 : **Starter
gratuit** (CONFIRMÉ `[RPL-28]` : crédits quotidiens, Lite build seul, **1 app
publiée qui expire à 30 jours**, badge à lien de parrainage, 2 GB) · **Core
$20/mois observé au scan anonyme — $25 selon la vérification expert du même
jour, divergence CONSERVÉE** · **Pro $100/mois** (50 viewers, 10 agents
parallèles) · **Enterprise sur devis** — CONFIRMÉ `[RPL-27]`. **Teams :
l'offre commerciale est retirée, les capacités d'équipe demeurent**
(P0-LS-15, `CAP-TEAM-COLLAB`). Nos propres prix vivent dans `RATE_CARD.json`,
**indépendant** — on ne copie jamais un prix observé dans une constante.
Reprendre ou non l'expiration à 30 jours du gratuit = décision owner.

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
**révoque puis re-accorde**, il ne renomme pas.

**Multi-tenant, architecture officielle** — CONFIRMÉ `[GCP-14]` (doc Google
mise à jour 17/07/2026, snapshot hashé) : **1 projet par tenant recommandé**
(multi-tenant par projet déconseillé) ; **pool de projets PRÉCRÉÉS** (la
création/init a de la latence) ; **folders séparant code first-party et code
tenant non fiable obligatoires** ; routage = Global External ALB + **Service
Extensions** ; **un billing account différent par tier de réputation** pour
contenir les abus ; Cloud Armor. CONFIRMÉ `[GCP-15]` : **1000 services / 1000
jobs / 1000 worker pools max par projet et par région** (augmentables) —
c'est la borne de sharding de `CapacityPolicy`.

```
ReputationTier { tierId, name ∈ { FREE_NEW, FREE_ESTABLISHED, PAID, ENTERPRISE },
  billingAccountRef, abuseThresholds, egressPolicy }
BillingAccountBinding { cloudTenantId, billingAccountRef, reputationTierId, effectiveFrom }
AbuseEventPolicy { signals[], thresholds, actions ∈ { THROTTLE, SUSPEND, ISOLATE, REPORT }, appealPath }
CapacityPolicy += { servicesPerProjectQuota: ≤1000 [GCP-15], jobsQuota, workerPoolsQuota,
  serviceAccountBudget [GCP-08], shardingThreshold, projectPoolTarget, projectPoolMin,
  region, reputationTierId }
```

**État réel : contrat écrit, implémentation non commencée**
(`UNK-CLOUDTENANT-IMPL`, gate bêta) — le pool précréé et la séparation billing
par réputation font partie de l'implémentation minimale attendue.

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

Interdit : une identité par déploiement/révision `[GCP-08]`. **Trois chemins
d'identité** — CONFIRMÉ `[GCP-13]` *(l'ancien « WIF uniquement si source
externe » était FAUX pour GKE : « In GKE, Google Cloud manages the workload
identity pool and provider for you and doesn't require an external identity
provider » ; « recommended way »)* :

1. **Workloads GKE** → **Workload Identity Federation for GKE** : pool et
   provider gérés par Google, **aucun IdP externe**, méthode recommandée.
2. **Workloads hors Google Cloud** → **IAM Workload Identity Federation**
   avec fournisseur d'identité externe.
3. **Cloud Run (apps publiées)** → **service identity dédiée** par service +
   **impersonation courte durée** pour les opérations du control plane.

**Zéro clé persistante partout.** Rotation, SLO de révocation, audit des
impersonations.

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
**Couplage de rétention** — CONFIRMÉ `[GCP-12]` (même snapshot) : « You can
delete attachments **indirectly by deleting the artifact it refers to** » —
supprimer l'image cible supprime ses attachments. Le graphe de rétention
(§4.7) doit donc protéger **l'image ET ses métadonnées** ensemble, et le test
de suppression/rollback doit prouver que les attachments survivent tant qu'une
release les référence.

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
niveau applicatif par la seule grâce du LB. Requis en plus (P1-A2-04) :
**min instances** ou trafic synthétique + readiness dans chaque région de
secours (un failover vers une région froide n'est pas un failover), et le
**coût mesuré** de ce chauffage entre dans le rapport de coût multi-région.

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
   quarantaine. (PREUVE LIVE — evidenceId
   `docs/deploy-evidence/2026-07-16-remix/`, hashé dans
   `APPROVAL_STATUS.json.evidence[]`)
2. **Import** : aucune suppression silencieuse ; staging sans montage du
   workspace cible ; commit tardif refusé ; `targetProjectId` jamais touché
   hors commit. (PREUVE LIVE — evidenceId
   `docs/deploy-evidence/2026-07-16-import/`, hashé)
3. **Checkpoint** : `CHECKPOINT_SNAPSHOT_BEFORE_BARRIER` refusé.
4. **Migration DB** : `MIGRATION_APPLY_BEFORE_BACKUP` refusé ; aucune mutation
   PROD par l'Agent.
5. **Promotion** : une promotion non `COMMITTED` ne peut jamais devenir une
   release ; BinAuthz/policy revalidée dans le contexte tenant.
6. **Rollback** : pas de digest retenu ⇒ 409 typé, jamais une URL peut-être
   morte ; politique de secrets insatisfiable ⇒ 409. (PREUVE LIVE —
   `E2E-VERTICAL-ROLLBACK`, evidenceId `docs/deploy-evidence/2026-07-17-rollback/`)
7. **Edge** : auth fail-closed ; bypass `run.app` testé activement.
8. **Agent** : aucun nom de modèle dans l'UI ; marge négative ⇒ 409 bloquant ;
   pas de downgrade silencieux (403 typés). (PREUVES LIVE —
   `E2E-AGM-A/B/C/E/F`, evidenceId `docs/deploy-evidence/2026-07-16-agent-modes/`)
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

**Univers des surfaces (P0-A2-02, corrigé P0-LS-01)** — le registre porte
l'**univers EXACT attendu** : **159 surfaces `P001–P159`** (8 familles) +
**56 services logiques `S01–S56`**, importés de l'inventaire IDE antérieur
(`Plan_IDE_Complet_Replit_2026_ECode.docx`, sha256 `0b232212…`), verrouillés
en CI (`EXPECTED_SURFACE_UNIVERSE_IDS` / `EXPECTED_SERVICE_UNIVERSE_IDS` — un
ID qui disparaît casse le build). Chaque entrée doit être **évaluée**
SUPPORTED / UNSUPPORTED / NOT_APPLICABLE **avec justification** ;
`availability: UNKNOWN` = non évaluée, et **`parityBaselineReady` ÉCHOUE tant
qu'une entrée reste UNKNOWN**. Les **deltas du scan ne s'y additionnent pas** : univers différents, registres
séparés (P0-LS-01) — `ARTIFACT_KIND` · `COMPONENT_KIND` · `CREATION_INTENT` ·
`GENERATED_ASSET_KIND` · `CAPABILITY` · `DEPLOYMENT_TYPE` · `IMPORT_PROVIDER`
· `CONNECTOR` · `OFFERING_ENTITLEMENT` · `EXTERNAL_ECOSYSTEM`, chacun présent
et vérifié en CI. État mesuré : P141 évalué (tuile GitLab absente du hub —
capacité plus large UNKNOWN) ; 4 surfaces reclassées 📘 DOC-JOUR vérifié
(P025/P059/P067/P078) ; le reste NON évalué, dont 24 « sans trace »
(`UNK-LS-*`) — un backlog n'est pas une évaluation. **Exigence Avi (B)** :
chaque entrée porte de plus un `builtState` (DEJA_CONSTRUIT / PARTIEL /
NON_FAIT + `codeRefs`) croisé avec le code réel et l'héritage bolt — rien
n'est « fait » sans preuve code. La matrice
source→surface→service→contrat→work item→preuve est amorcée dans
`TRACEABILITY_MATRIX.yaml`.

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
  "overallStatus": "NOT_APPROVED",
  "highestPassedLevel": "documentReconciled",
  "levels": [
    {
      "name": "documentReconciled",
      "passed": true,
      "reasons": []
    },
    {
      "name": "sourceBaselineReady",
      "passed": false,
      "reasons": [
        "claim GCP-01 cited by the plan but not anchored (UNVERIFIED)",
        "claim GCP-02 cited by the plan but not anchored (UNVERIFIED)",
        "claim GCP-03 cited by the plan but not anchored (UNVERIFIED)",
        "claim GCP-04 cited by the plan but not anchored (UNVERIFIED)",
        "claim GCP-06 cited by the plan but not anchored (UNVERIFIED)",
        "…"
      ]
    },
    {
      "name": "registryUniverseReady",
      "passed": true,
      "reasons": []
    },
    {
      "name": "contractsPresent",
      "passed": true,
      "reasons": []
    },
    {
      "name": "contractsValidated",
      "passed": false,
      "reasons": [
        "DOMAIN_MODEL.md: no real reviewer",
        "AUTH_ACCESS_CONTRACT.md: no real reviewer",
        "GALLERY_COMMUNITY_CONTRACT.md: no real reviewer",
        "RELEASE_PUBLISH_CONTRACT.md: no real reviewer",
        "PROJECT_FACTORY_CONTRACT.md: no real reviewer",
        "…"
      ]
    },
    {
      "name": "implementationReady",
      "passed": false,
      "reasons": [
        "P0-V3-01 is OPEN",
        "P0-V3-05 is OPEN",
        "P0-V3-06 is OPEN",
        "P0-V3-07 is OPEN",
        "P0-A2-12 is OPEN",
        "…"
      ]
    },
    {
      "name": "verticalBackendReady",
      "passed": true,
      "reasons": []
    },
    {
      "name": "verticalUserJourneyReady",
      "passed": false,
      "reasons": [
        "stage \"publish\" has no UI proof (une preuve API n'est pas une preuve UI)",
        "stage \"rollback\" has no UI proof (une preuve API n'est pas une preuve UI)"
      ]
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
        "…"
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
        "…"
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
        "…"
      ]
    }
  ],
  "uiGaps": [
    "publish",
    "rollback"
  ],
  "unanchoredClaims": [
    "GCP-01",
    "GCP-02",
    "GCP-03",
    "GCP-04",
    "GCP-06",
    "GCP-07",
    "GCP-08",
    "GCP-09",
    "GCP-10",
    "NIX-01",
    "RPL-01",
    "RPL-02",
    "RPL-03",
    "RPL-05",
    "RPL-06",
    "RPL-09",
    "RPL-10",
    "RPL-13"
  ],
  "surfaceUniverse": {
    "expected": 159,
    "present": 159,
    "evaluated": 1,
    "services": 56,
    "builtStates": {
      "dejaConstruit": 79,
      "partiel": 43,
      "nonFait": 37,
      "nonCroise": 0
    }
  },
  "workItems": {
    "sourceFindingCount": 336,
    "canonicalWorkItemCount": 99
  },
  "counts": {
    "p0": {
      "total": 53,
      "closed": 0,
      "proven": 45,
      "open": 8
    },
    "decisions": {
      "total": 12,
      "open": 3
    },
    "unknowns": {
      "total": 46,
      "p0Linked": 0
    },
    "claims": {
      "total": 24,
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
      "total": 40,
      "open": 12
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
    },
    "canonicalWorkItems": 99,
    "unanchoredClaims": 18
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
| `DEC-OWNER-GALLERY-OPTION-B` | Option B Gallery — confirmation owner enregistrée (17/07) mais **contenu exact non capturé** | **OPEN / CAPTURE_INCOMPLETE** (P0-A2-10) — refermée quand `UNK-GALLERY-OPTION-B-CONTENT` sera inscrit |

D2 à D6 ont été approuvés par « **Oui** » à la question « tu adoptes D2 à D6
tels qu'écrits dans ce document ? » (17/07/2026) ; le « document » est celui
de l'expert d'Avi (réponses D1–D6), dont le contenu est recopié dans les
rationales du registre.

---

## 9. P0 / P1

**P0** — registre : `P0_REGISTRY.yaml`, **35 entrées** en ensembles EXACTS
verrouillés CI (`EXPECTED_P0_IDS` — un ID absent casse le build) : les 4 P0
de l'audit v4 (`P0-V4-1…4`), les **15 P0 de l'audit v3** (`P0-V3-01…15`) et
les **16 P0 de l'audit de réanalyse du 20/07** (`P0-A2-01…16`). Chaque entrée
porte : description, source, owner (rôle), statut, targetDate ISO, commit,
reviewer, preuve, dépendances, condition de clôture. États : voir §7 (JSON
généré — jamais recopiés ici, P1-A2-09).

**P1** — registre : section `p1s` de `P0_REGISTRY.yaml`, **40 entrées** en
ensemble EXACT (`EXPECTED_P1_IDS`) : les **8 P1 de couverture**
(`P1-COV-01…08`), les **18 P1 de l'audit v3 enfin tracés individuellement**
(`P1-V3-01…18` — la plupart APPLIED au niveau documentaire ; `P1-V3-07`
SUPERSEDED par `GCP-11`), et les **14 P1 de l'audit de réanalyse**
(`P1-A2-01…14` — APPLIED sauf 4 OPEN : dates→dépendances, lifecycle complet,
tests de panne du collecteur, contrats des domaines cœur).

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

**Ni `approvalReady` ni `approved.level` n'existent** (interdits par le
validateur — P0-A2-16) : le premier était un faux positif de couverture, le
second donnait une impression d'approbation. Le statut calculé porte
**`overallStatus`** (`NOT_APPROVED` tant qu'aucune approbation de périmètre
explicite — avec approbateur stocké — n'existe dans `APPROVALS.yaml`) et
**`highestPassedLevel`** (plus haut niveau **contigu** de l'échelle).

| Niveau | Définition calculée |
|---|---|
| `documentReconciled` | plan unique présent, RÉCONCILIÉ avec le dernier audit (métadonnées complètes) + registres requis avec `schemaVersion` |
| `sourceBaselineReady` | `unanchoredClaims == 0` (toute claim citée est ancrée URL+snapshot+hash) · sources dans le SLA de fraîcheur · aucun triage PENDING hors SLA |
| `registryUniverseReady` | ensembles EXACTS présents : 35 P0 + 40 P1 + Bolt 29 + readiness 50 + **univers 159 surfaces + 56 services** + 336 constats→work items sans orphelin · aucune targetDate UNKNOWN · aucune référence orpheline |
| `contractsPresent` | les 20 fichiers de contrat existent |
| `contractsValidated` | **contenu, pas présence** : reviewer humain réel + ≥3 sections + zéro placeholder par contrat (échoue aujourd'hui — honnête) |
| `implementationReady` | aucun P0 OPEN ou BLOCKED |
| `verticalBackendReady` | les 7 étages du vertical ont une preuve PROVEN (artefacts présents et hashés) |
| `verticalUserJourneyReady` | verticalBackendReady **ET `uiGaps` vide** — chaque étage prouvé depuis un vrai client UI (une preuve API n'est pas une preuve UI) |
| `betaReady` | registryUniverseReady + verticalBackendReady + fraîcheur + aucune décision expirée + aucune capacité gate-bêta encore UNKNOWN |
| `publicLaunchReady` | betaReady + tous P0 CLOSED (reviewer réel) + aucune décision OPEN + aucun claim PENDING |
| `parityBaselineReady` | univers des surfaces **entièrement évalué** (0 UNKNOWN) + surfaces déclarées DONE/NA justifié + sources fraîches + tout trié |

Contrôles de complétude supplémentaires (validateur, exit 1) : aucun P0 CLOSED
sans commit + reviewer réel + preuve · evidenceId inexistant ou vide interdit
pour PROVEN · snapshots des sources présents sur disque · `APPROVAL_STATUS`
sans `approvalReady` ni `approved` et avec `highestPassedLevel` = plus haut
niveau contigu · `DOCUMENT_MANIFEST.yaml` généré sans dérive (chaque fichier
compagnon hashé) · 336 constats ↔ work items canoniques sans orphelin ·
**aucune contradiction entre sections** : ce plan ne déclare aucun état — il
pointe le JSON calculé (§7).

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
8. **P1** : les 40 P1 sont désormais tous tracés individuellement (§9) ;
   4 P1-A2 restent OPEN (dates→dépendances, lifecycle, tests collecteur,
   contrats domaines cœur).
9. **Évaluation de l'univers des surfaces** : importé (159+56, ensembles
   exacts) mais **0/159 évalué** — `parityBaselineReady` FAIL jusqu'à
   évaluation justifiée de chaque entrée (P0-A2-02).
10. **Déduplication sémantique** : 336 constats → 99 work items par
   regroupement mécanique (suivi + 6 paires d'audit) ; la passe sémantique
   complète et la provenance fichier/ligne des 29 documents d'ORIGINE restent
   ouvertes (P0-A2-12).
11. **Provenance du statut** : `mergedToMainAt: null` — rien de tout ceci
   n'est sur main tant que la PR n'est pas mergée ; le statut devra être
   recalculé au commit mergé (P0-A2-13).

---

## 13. Périmètres complémentaires — tracés, pas flottants

L'audit de couverture du 19/07 (`COVERAGE_GAP_AUDIT_2026-07-17.md`) a confronté
ce plan à TOUS les anciens plans et fichiers de tâches : **`sourceFindingCount
= 336` constats sources** (compte certifié). **P0-A2-11/12 : un constat n'est
pas une tâche** — la source unique des compteurs est le JSON généré
(`counts.backlog`, `counts.canonicalWorkItems`) ; les anciens « 26 » / « 48 »
saisis à la main dans cette section sont supprimés. Règle : **tout ce que ce
plan n'absorbe pas est tracé dans un registre nommé ou explicitement délégué
à un fichier de suivi actif — rien ne flotte.** La CI compare l'ensemble EXACT des IDs attendus
(`EXPECTED_P1_IDS`, `EXPECTED_BOLT_DEBT_IDS`, `EXPECTED_PROD_READINESS_IDS`
dans `scripts/parity/generate-approval-status.mjs`) : un ID qui disparaît casse
le build, comme pour les 19 P0. Tout y est **NON FAIT par défaut** — rien ne
passe FAIT_PROUVE sans `evidenceId` présent sur disque (validateur).

| Périmètre | Où c'est tracé | Dans ce plan ? |
|---|---|---|
| Features Replit absentes du plan (File History, Skills, éditeur en panneaux, types de déploiement, entitlements par plan, starters→démos, pixel) | `P0_REGISTRY.yaml` section `p1s` (P1-COV-01…08) + surfaces `UNSUPPORTED` dans `SURFACE_REGISTRY.yaml` | OUI (§9) — à intégrer au périmètre produit lors de la prochaine itération |
| Mise en route du billing existant (SHADOW) et arbitrage vs ledger §3.7 | `DEC-BILLING-LEGACY-VS-LEDGER` (OPEN) + `UNK-BILLING-LEGACY-GOLIVE` + `UNK-DB-COMPUTE-METERING` + P1-COV-08 | OUI (§3.7) |
| Dette héritée du fork bolt (**compteur = `counts.boltDebt` du JSON généré — source unique, jamais recopié ici** : Workflows morts, Debugger factice, panneaux localStorage…) | `BOLT_DEBT_REGISTRY.yaml` (BD-*) | NON — hors périmètre parité, suivi par ce registre |
| Programme mise-en-production (**compteur = `counts.prodReadiness` du JSON généré** : isolation, k6, restore RTO/RPO, pentest, mobile/desktop, juridique, React Router 7…) | `PRODUCTION_READINESS_REGISTRY.yaml` (PR-*) | NON — hors périmètre parité, suivi par ce registre |
| Actions qui n'attendent qu'Avi | `ACTIONS_AVI.md` (liste consolidée, mots simples) | NON — délégué |
| Design marketing (SOL-*), bugs live, chantiers en cours | `DESIGN_PROGRAM_MASTER.md` / `DESIGN_AUDIT_LIVE.md`, `BUG_INVENTORY_LIVE.md`, `PLAN_REMAINING_UNIFIED.md`, `REPLIT_PARITY.md` (fichiers de suivi actifs, règle CLAUDE.md) | NON — délégué explicitement |

Exclusion volontaire : la fuite `tokenHash` des invitations (famille E de
l'audit) est traitée par une session dédiée (PR #6) — pas d'ID ici pour ne pas
dupliquer le suivi.

---

## 14. Backlog — résumé (les constats vivent dans les registres)

> **P1-A2-10 appliqué** : les **336 constats sources** ont quitté ce plan pour
> `LEGACY_FINDING_REGISTRY.yaml` (provenance : plan version 2026-07-19.2
> sha256 `af88c6c6…`, ligne par ligne + `originRef`), et leur déduplication
> canonique vit dans `WORK_ITEM_REGISTRY.yaml`
> (`sourceFindingId → canonicalWorkItemId`, `duplicateOf` posés sur les
> 6 paires identifiées par l'audit de réanalyse). La certification est
> INCHANGÉE : `scripts/parity/check-plan-completeness.mjs` vérifie le compte
> exact (336) et le SHA-256 de la liste des IDs **sur le registre** — retirer,
> renommer ou ajouter un seul constat casse le build.
>
> Compteurs (source unique = `APPROVAL_STATUS.json`) :
> `counts.backlog` = {336 ; 332 NON FAIT · 1 DÉJÀ FAIT · 3 PÉRIMÉ} ·
> `counts.canonicalWorkItems` = 99 (regroupement mécanique par pointeur de
> suivi + 6 paires — la passe de déduplication SÉMANTIQUE complète est
> ouverte, P0-A2-12). Un constat DUPLICATE_OF ne disparaît jamais de
> l'historique.
>
> Limite de provenance déclarée : le fichier/ligne d'ORIGINE dans les 29
> anciens documents n'a pas été capturé par l'audit de couverture — la
> provenance enregistrée est celle du plan qui les a matérialisés
> (P0-A2-12, complétion ou ACCEPTED_RISK d'ici 2026-08-15).
