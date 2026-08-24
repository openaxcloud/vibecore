# PLAN_REMAINING_UNIFIED — plan de travail (source de vérité)

États par point : 📤 Dispatché · 💻 Codé (commité+poussé sur main) · ✅ Testé live (écran + greps, web/tablette/mobile le cas échéant).
Un point n'est « fait » QUE quand ✅ est coché.

## Finition des huit pages Solutions — demande Avi du 24/08

Les validations d'une version antérieure de SOL-02→SOL-09 restent historiques. Ce lot n'est terminé qu'après commit+poussé sur `main`, déploiement du SHA exact et matrice navigateur en production. Décision fail-closed : les cartes utilisent des démos E-Code statiques exécutables et des liens directs `/gallery-apps/<id>/preview/`, sans fiche Gallery, sans claim `GalleryListing` publié/remixable et sans seeding. Preuve commune : EN/FR × clair/sombre × 390/768/1024/1440, 0 overflow/pageerror/erreur console, images 1200×675 chargées avec alt localisés, aperçus directs HTTP 200/non blancs, interaction centrale de chaque application vérifiée et cibles ≥44 px.

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| SOL-02-APP-REAL — Website Builder : vraies captures de sites/apps web thématiques | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | Principal + 2 appuis et previews statiques vérifiés sur la matrice production. |
| SOL-03-APP-REAL — Game Builder : vrai quiz/jeu navigateur jouable | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | Neon Trivia Arena joué jusqu'au résultat et au replay ; aucun visuel App Builder réutilisé. |
| SOL-04-APP-REAL — Dashboard Builder : vrais dashboards interactifs | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | Données, contrôles et trois visuels thématiques vérifiés en production. |
| SOL-05-APP-REAL — Chatbot Builder : vrai support documentaire conversationnel | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | Docs Copilot exercé avec réponses sourcées et états fail-closed. |
| SOL-06-APP-REAL — Internal AI Builder : vrais workflows IA internes | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | Trois cas procédures/incidents/revues vérifiés sur la matrice production. |
| SOL-07-APP-REAL — Enterprise : vraies apps gouvernance/risque/opérations | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | Trois cas Enterprise et leurs aperçus exécutables vérifiés. |
| SOL-08-APP-REAL — Startups : vraies apps SaaS/go-to-market | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | App SaaS principale et cas complémentaires vérifiés en production. |
| SOL-09-APP-REAL — Freelancers : vraies apps de livraison client/terrain | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | App terrain principale et deux cas complémentaires vérifiés en production. |
| SOL-I18N-HEADER-ONLY — supprimer les sélecteurs FR/EN locaux | ✅ 24/08 | ✅ 24/08 `79ec62f4` | ✅ 24/08 | SOL-01→SOL-09 : exactement 1 sélecteur global, 0 dans `<main>` ; bascule/persistance/SSR vérifiés. |

Clôture live : matrice exhaustive production **153/153** sur `web:79ec62f442`, 96 captures inspectées et 16/16 URLs clés HTTP 200 ; puis smoke final **48/48** après le remplacement par le descendant `web:7d9a96d36e` (digest `sha256:ff2b506d037d08cd90e75bf171d74a9a48bda8946612c789e7904f3b6259710b`, déploiement `32714604287`, Helm `1065`) en EN/clair + FR/sombre × 390/768/1440, sans défaut responsive, console, réseau ou accessibilité tactile.

## AUDIT V4 — 4 chantiers + statut calculé (décision Avi 16/07)

Audit externe v4 (15 P0). Priorité 4 (sécu) → 3 (échelle) → 2 → 1. Statut CALCULÉ (jamais écrit à la main).

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| V4-P4. Promotion Artifact Registry : découvrir referrers → copier+relier → vérifier subjectDigest tenant → BinAuthz ; échec ⇒ bloqué | ✅ | ✅ `07ced1c5` | 🟡 partiel | `artifact-promotion.ts` 7 tests dont 4 NÉGATIFS (SBOM manquant, relink échoué, BinAuthz refusé, source absente) ; adapter AR live = follow-up (UNK-AR-LIVE-PROMOTION) |
| V4-P3. Hiérarchie GCP : pas de folder-per-tenant (300 cap + 0,1 req/s), shards<300, CapacityPolicy quotas+rate | ✅ | ✅ `07ced1c5` | ✅ 16/07 | `capacity-policy.ts` 6 tests : 1000 tenants sharded=4/~40s vs folder-per-tenant=2,78h inadmissible ; DOMAIN_MODEL §3 corrigé |
| V4-P2. Gallery requalifiée (mesures rendues+hashées) : RPL-17/18/19 ; conséquence self-publish=dépassement | ✅ | ✅ `b42459fc` | ✅ 16/07 | `SRC-GALLERY-RENDERED` sha256 fad9ec75… ; DEC-GALLERY-NO-SELF-PUBLISH. `docs/deploy-evidence/2026-07-16-collector-gallery/` |
| V4-P1. Collecteur voyant : routes produit rendues JS + canal lancement ; retrouve Community Profiles | ✅ | ✅ `b42459fc` | ✅ 16/07 | collect-baseline v2 (3 familles) ; watchHits["Community Profiles"]==["community"] ; 🟡 rendu JS en CI = UNK-COLLECTOR-CI-RENDER |
| V4-STATUS. APPROVAL_STATUS.json CALCULÉ + P0/DECISION/UNKNOWN registres + CI (refs croisées, freshness, no-DONE-sans-preuve, no-CLOSED-sans-reviewer) | ✅ | ✅ `b42459fc` | ✅ 16/07 | generate-approval-status.mjs ; validateur échoue sur dérive ; 3 tests négatifs prouvent les refus |

### Compléments A→I (2e lecture Avi 16/07)

Priorité A, B d'abord, puis C→I. UNKNOWN partout où on ne sait pas.

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| A. Observation : sourceType/observedAt/**eventDate≠detectionDate**/contentHash/archiveUri/plan/region/client/rollout/triageState + SLA triage + familles | ✅ | ✅ `e503220e` | ✅ 16/07 | OBSERVATION_REGISTRY.yaml + schema ; validateur vérifie triageSla + cohérence blindnessGapDays |
| B. Changelog 10/07 (domain purchase, Excalidraw, editors-answer) → PUBLIC_BASELINE triageState PENDING | ✅ | ✅ `e503220e` | ✅ 16/07 | RPL-20/21/22 (SRC-CHANGELOG-2026-07-10 sha256 010fb57a) |
| C. PromotionManifest + ReleaseManifest + machine PROMOTION_PREPARED→…→COMMITTED ; promotion incomplète nettoyée ≠ release ; rollback ≠ inversion DB | ✅ | ✅ `57ab0a67` | ✅ 16/07 | lifecycle-state-machines.ts ; releaseMayBeCut refuse non-committé/attachment non-relié/BinAuthz≠PASSED ; 4 tests ; DOMAIN_MODEL §5 |
| D. Checkpoint barrière 2 phases : BARRIER_ESTABLISHED avant tout snapshot ; manifest visible après vérif de TOUS ; quiesce timeout+dégel | ✅ | ✅ `4a61800c` | ✅ 16/07 | assertCheckpointTransition (CHECKPOINT_SNAPSHOT_BEFORE_BARRIER) + checkpointManifestVisible + quiesceAdmissible ; tests négatifs ; CHECKPOINT_CONTRACT.md |
| E. Migrations DB : PLANNED→…→COMMITTED, APPLYING exige BACKUP_VERIFIED, une seule active par env | ✅ | ✅ `4a61800c` | ✅ 16/07 | assertMigrationTransition (MIGRATION_APPLY_BEFORE_BACKUP) + migrationMayStart ; DATABASE_CONTRACT.md |
| F. Gallery CONFIRMED vs UNKNOWN séparés (publish self-service/preview embarquée/review/licence remix = UNKNOWN) | ✅ | ✅ `06fabcf1` | ✅ 16/07 | GALLERY_COMMUNITY_CONTRACT.md ; 4 UNKNOWN dédiés ; rien d'interne marqué CONFIRMED par ressemblance |
| G. SurfaceRegistryEntry champs exacts (clientKind/entitlement/region/rolloutCohort/availability/serverAuthz/errors/recovery/responsiveContract/a11y/locale/rtl/tz/perfBudget/observedAt) | ✅ | ✅ `b8186f2f` | ✅ 16/07 | SURFACE_REGISTRY schemaVersion 2 + surface-registry.schema.json ; enum availability prouvé (MAYBE→exit 1) ; UNKNOWN 1re classe |
| H. APPROVAL_STATUS : algorithme EXACT à 6 conditions (P0, fichiers+schemaVersion, refs sans orphelin, vertical vert, sources fraîches, décisions/unknowns) | ✅ | ✅ `ca299f87` | ✅ 16/07 | conditions[] ; validateur : approvalReady==6-pass ; **approvalReady=false honnête** (vertical : seuls execute+publish verts) ; hand-flip→DRIFT prouvé |
| I. 14 contrats manquants (17 groupes) + private deployments RPL-23 (4 modes, accessPolicyVersion) | ✅ | ✅ `b20eb6bc` | ✅ 16/07 | 14 CONTRACT.md header-checkés (22 md) ; RPL-23 cité SRC-LLMS-FULL-TXT ; AUTH_ACCESS_CONTRACT ; UNK-AUTH-ACCESS-LIVE + UNK-REGRESSION-HARNESS |

**État du vertical d'approbation (calculé)** — **7/7 GREEN, `approvalReady=true`** au 2026-07-17. Les 7 stages ont une preuve e2e taggée : `create` (E2E-VERTICAL-CREATE), `modify` (E2E-VERTICAL-MODIFY), `execute` (E2E-AGM-C), `preview` (E2E-VERTICAL-PREVIEW), `publish` (E2E-PHASEB-NODE), `observe` (E2E-VERTICAL-OBSERVE), `rollback` (E2E-VERTICAL-ROLLBACK). `approvalReady=true` = les 6 conditions de l'algorithme passent (pas d'approbation humaine — c'est le calcul, pas un jugement). Validateur vert, refus prouvés.

### Vertical d'approbation — chantier rollback (le plus critique)

**Écart MESURÉ 16/07 (code lu)** : le rollback `provider='server'` **ne re-déploie aucune image** — il recopie l'URL/metadata du déploiement précédent dans une ligne `READY`. **Aucune table `ReleaseCatalog`, aucun digest persisté** sur `Deployment`. Si la révision de v1 est supprimée, l'URL rollbackée est morte → I-REL-1 **non tenu**. Le contrat le déclarait obligatoire ; il n'a jamais été exécuté.

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| ROLLBACK-core. Mécanisme rollback-depuis-digest-retenu + policy secret (`resolveRollbackImage` + `resolveRollbackSecrets`) | ✅ | ✅ `ec0e50ca`+`b9413417` | ✅ | 10 tests (révision-supprimée→résout v1 ; sans-digest→`ROLLBACK_NO_RETAINED_DIGEST` ; PINNED-sans-snapshot→`ROLLBACK_SECRET_POLICY_UNSATISFIABLE`) |
| ROLLBACK-wiring. Persistance digest (build) + câblage handler + test handler | ✅ | ✅ `9680b20e`+`6b78dc50` | ✅ | `deployment-rollback-digest.spec.ts` : endpoint réel re-déploie par digest, refuse sans digest/PINNED. Fix `ec0ad6bd` (ligne non-terminale vs garde monotone — bug prod que le test handler ratait) |
| ROLLBACK-live. **Preuve e2e LIVE** v1→v2→supprimer révision v1→rollback→sert v1 | ✅ | ✅ `ec0ad6bd` | ✅ 17/07 | **E2E-VERTICAL-ROLLBACK PROVEN** : app-`<rb>` pull-by-digest `@sha256:657271c5` ready 1/1 sert « ROLLBACK-PROOF v1 » après delete révision (410) ; 2 négatifs 409 live. `docs/deploy-evidence/2026-07-17-rollback/`. **Stage `rollback` = GREEN → vertical 7/7, `approvalReady=true`** |

### ZONE — D2/D3 approuvés par Avi 17/07 (« Oui » sur D2–D6)

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| D2.1 Flag rollback digest PERMANENT : values prod+staging + configmap inconditionnelle `default "1"` + `values.schema.json` + test de rendu bloquant (deploy-main) | ✅ 17/07 | 🔄 20/07 | ⬜ | Le flag n'existait que par `kubectl set env`. 5 checks de rendu (dont simulation `--reuse-values` values legacy) vérifiés sous helm 3.16.2 (version CD). ⚠️ Travail du 17/07 perdu (worktree purgé avant commit) → réappliqué 20/07, commit --no-verify autorisé par Avi avec typecheck séparé montré vert |
| D2.2 Fail-closed : digest = DÉFAUT (env perdue ⇒ digest), `=0` → 409 `SERVER_ROLLBACK_DIGEST_DISABLED`, fallback URL-only server SUPPRIMÉ + `rollbackUnavailableReason` (liste+détail) + backfill | ✅ 17/07 | 🔄 20/07 | 🟡 backfill prod FAIT+TIENT | Backfill EXÉCUTÉ en prod 17/07 (9/9 depuis AR, 14/18 READY avec digest, 4 sans imageUri → 409 honnête), re-vérifié 20/07 : tient en DB. `docs/deploy-evidence/2026-07-17-rollback-permanent/` |
| D2.3 Observabilité : étape CD post-deploy lit configmap LIVE + env pod api Running, échec ⇒ job rouge+Slack | ✅ 17/07 | 🔄 20/07 | ⬜ | = l'alerte « flag absent après helm upgrade » exigée |
| D2.4 Preuve I-REL-1 rejouée APRÈS un vrai helm upgrade + 2 négatifs 409 | ✅ 17/07 | — | ⬜ | À rejouer après le déploiement CD du commit D2 (runner prêt dans l'evidence dir) |
| D3.1 Coût réel multi-zone MESURÉ (Cloud Billing Catalog, europe-west9) | ✅ 17/07 | 🔄 | ✅ 17/07 (mesure) | +3,74 $/mois (clone 80 Gio pd-standard 3,712 + snapshot 0,029) ; total 2 zones 7,45 $ ; regional PD 2,5–2,8× plus cher, 2 zones max. `COST_REPORT.md`. L'hypothèse « ~10 $ » remplacée par la mesure |
| D3.2 Multi-zone : snapshot signé gen-2 → clone zone-b + PV/PVC + choix de zone topology-aware + garde de dérive (initContainer bloque le pod) | ✅ 17/07 | 🔄 20/07 | 🟡 infra live FAITE+TIENT | Snapshot `nix-store-v2-gen2-20260717` + disque `nix-store-v2-b` + PVC Bound (re-vérifiés 20/07) ; identité de génération PROUVÉE 17/07 (sha256 catalog identique, 2012 chemins, Python 3.12.13 exécuté depuis le clone en zone-b). Code : 18 tests verts. Enablement live = one-time `--set` post-deploy |
| D3.3 Test de perte de zone (cordon zone-a → projet Python neuf en zone-b → uv/python → Preview → Publish → restore sans split-brain) | ✅ 17/07 | ✅ 20/07 | ✅ **20/07 VERT** | Phase panne : zone-b bout en bout (uv venv, Preview 200, Publish READY 200, guard vérifié). Restauration : 2 jambes prouvées (data-b→zone-b via annotation selected-node ; frais→zone-a, même hash) après 2 fixes trouvés PAR le test (RBAC PV manquant, deadlock data-PVC). `ZONE_LOSS_TEST.md`. Passage allowlist `'*'` = décision Avi explicite |

## REMIX — pipeline de fork sécurisé (décision Avi 16/07)

Contrat `DOMAIN_MODEL.md §1`. Machine à états NORMATIVE : SNAPSHOT_PINNED → **CREDENTIALS_DETACHED** → CLONING → DB_FORKING → STORAGE_POLICY_APPLIED → SCANNING → INDEXING. Invariant SÉCURITÉ : une **valeur** de secret n'entre JAMAIS dans l'artefact de clone (secrets = références) ; le détachement précède le clone. Preuve exigée : remix réel d'un projet CONTENANT un secret + démonstration que le secret est introuvable (FS, DB, env, logs) — le test doit CHERCHER le secret et échouer à le trouver. App Storage : 3 modes DETACH / CLONE / SHARE_WITH_CONSENT testés (bucket account-level partageable — « nouveau bucket » est NOTRE décision, explicite).

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| RMX-1. Machine à états typée + persistée (SNAPSHOT_PINNED→…→INDEXING), CREDENTIALS_DETACHED prérequis dur de CLONING | ✅ | ✅ `bd4c334e` | ✅ 16/07 | assertRemixTransition refuse CLONING avant DETACH (REMIX_CLONE_BEFORE_DETACH) ; 11 tests module pur |
| RMX-2. Secrets = références seules dans l'artefact de clone ; valeur jamais exportée (snapshot, archive, env, logs) | ✅ | ✅ `bd4c334e` | ✅ 16/07 | preuve : secret cherché dans fichiers+base+job du clone → introuvable (`docs/deploy-evidence/2026-07-16-remix/`) |
| RMX-3. Clone : nouveau projet/propriétaire/repo/workspace/locks, données isolées, lien source (provenance) | ✅ | ✅ `bd4c334e` | 🟡 partiel | nouveau projet + provenance (audit project.remix sourceProjectId) prouvés ; repo/workspace/locks non re-testés |
| RMX-4. DB_FORKING : nouvelle base isolée, DATABASE_URL re-seedé, aucune donnée partagée | ✅ | ✅ `bd4c334e` | 🟡 partiel | isolation prouvée (dbForked=false, DATABASE_URL source NON copié) ; fork physique CNPG = follow-up infra |
| RMX-5. STORAGE_POLICY_APPLIED : 3 modes DETACH / CLONE / SHARE_WITH_CONSENT | ✅ | ✅ `bd4c334e` | 🟡 partiel | 3 modes modélisés+validés, DETACH prouvé (défaut) ; copie/partage objets réelle = reconcile Object Storage flag-gated |
| RMX-6. SCANNING : scan de secrets sur l'artefact cloné (échoue si un secret matérialisé est trouvé) | ✅ | ✅ `bd4c334e` | ✅ 16/07 | scanClonedFilesForSecrets trouve la valeur matérialisée → 409 REMIX_SECRET_LEAK (test dédié) |
| RMX-7. Preuve : remix d'un projet AVEC secret → secret introuvable (FS+DB+job), test qui CHERCHE le secret | ✅ | ✅ `bd4c334e` | ✅ 16/07 | remix-routes.spec 14/14 ; `docs/deploy-evidence/2026-07-16-remix/README.md` (preuve = test intégration, pas encore parcours UI prod) |

## IMPORT — pipeline d'import sécurisé (décision Avi 16/07)

Contrat `DOMAIN_MODEL.md §2`. RECEIVED → STAGING_ISOLATED → SCANNING → QUARANTINED → AWAITING_USER_ACTION → COMMITTING → COMMITTED ; cleanup ROLLING_BACK/EXPIRED/CANCELLED. Invariants : (1) aucune suppression silencieuse — findings présentés+bloquants, contenu modifié qu'avec consentement explicite ; (2) staging jetable, cible jamais montée avant le commit atomique. Preuve = test qui CHERCHE le secret. 12 tuiles du hub (Empty inclus ; GitLab/Screenshot exclus). Réservation crédits idempotente = DÉCISION E-CODE (pas parité).

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| IMP-1. Machine à états typée + persistée ; commit exige scan propre OU consentement | ✅ | ✅ `7d45c2cb` | ✅ 16/07 | assertImportTransition + IMPORT_COMMIT_WITHOUT_CONSENT ; 15 tests module pur |
| IMP-2. Aucune suppression silencieuse : scan read-only, findings redactés bloquants, redaction sur consentement | ✅ | ✅ `7d45c2cb` | ✅ 16/07 | hash source inchangé ; 409 IMPORT_UNRESOLVED_FINDINGS ; redact vs keep (`docs/deploy-evidence/2026-07-16-import/`) |
| IMP-3. Staging jetable, cible jamais montée avant le commit atomique | ✅ | ✅ `7d45c2cb` | ✅ 16/07 | writeCalls==[] hors commit ; cancel/rollback/échec → aucune cible |
| IMP-4. Cleanup prouvé sur cancel, timeout ET échec | ✅ | ✅ `7d45c2cb`+`317a9cbb` | ✅ **16/07** | cancel + échec (write mocké) + **timeout** prouvés : `reapExpiredImportJobs` (updateMany → EXPIRED, ne touche JAMAIS `targetProjectId`) + interval 60s + dispose staging ; test : import périmé → EXPIRED, targetProjectId undefined, writeCalls==[], files.size==0, commit tardif refusé ; job frais laissé intact (9 tests import-routes) |
| IMP-5. Logs redactés (valeur du secret absente des logs) | ✅ | ✅ `7d45c2cb` | ✅ 16/07 | import.scan loggé, valeur absente (test dédié) |
| IMP-6. 12 tuiles du hub ; providers exécutés vs modélisés | ✅ | ✅ `7d45c2cb` | 🟡 partiel | github/bitbucket/zip/empty exécutés ; vercel/figma/claude/bolt/lovable/base44/spreadsheet/previous-agent-export = source réelle follow-up connecteur |
| IMP-7. Réservation crédits idempotente = DÉCISION E-CODE | ✅ | ✅ `7d45c2cb` | 🟡 partiel | marqueur creditsReserved (idempotent par importJobId) ; débit réel non wiré |

## DOC NORMATIVE — P0-02 registres parité + P0-04 collecteur baseline (décision Avi 16/07)

Audit externe : 19 P0. P0-02 = 12 registres/contrats sous `docs/parity/` (chaque fichier porte `schemaVersion` + `repoCommit` ; `status: UNKNOWN` explicite plutôt qu'inventer). P0-04 = collecteur baseline QUOTIDIEN (le changelog Replit n'est PAS hebdo-vendredi : l'index contient un dimanche 16/11/2025 et un mercredi 26/11/2025 — toute automatisation « vendredi » interdite). Preuve = validateur qui passe + collecteur qui tourne en réel.

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| P002-1. Les 12 fichiers/dossiers sous docs/parity/ (baseline, sources, surfaces, contrats service, domain model, e2e proofs, rate card+ledger, nix contract, ops DR, sécurité, parity status, changelog audit) | ✅ | ✅ `97759a77`+`afd741d5` | ✅ 16/07 (validateur exit 0 + CI parity-registries verte sur HEAD `2b421a45`) | Le validateur prouve structure/hash/snapshots, PAS la complétude fonctionnelle. Domaines tranchés reflétés : Remix/Import/CloudTenant/IAM/Rollback/Checkpoint |
| P002-2. scripts/parity/validate-registries.mjs + cible CI qui ÉCHOUE sur violation de schéma | ✅ | ✅ (ce commit) | ✅ 16/07 (run réel: 8 OK exit 0; test négatif: 3 violations exit 1) | Sortie réelle du run exigée |
| P004-1. scripts/parity/collect-baseline.mjs quotidien (hash SHA-256 de llms.txt, llms-full.txt, sitemap, changelog, blog, pricing ; diff trié ; nb de liens = propriété du snapshot) | ✅ | ✅ (ce commit) | ✅ 16/07 (run réel 6/6 sources, snapshot 2026-07-16 commité, llms.txt 51 169 o/299 liens sha256 03cbdb07…) | Premier snapshot réel commité avec hash |

## AGENT — 3 modes + routage admin avec marge (décision Avi 16/07)

Décision produit validée par audit Replit : Replit n'a AUCUN sélecteur de modèle nulle part ; nous en affichons 147 (« AI Model Selection — 147 available », incl. `Gemini Robotics-ER 1.6` = modèle robotique). Cible : 3 modes (Lite / **Economy = défaut** / Power) dans l'IDE uniquement, aucun nom de modèle dans l'UI, réglages par UTILISATEUR ; table de routage admin versionnée avec coût de revient + marge. Preuve = parcours réel UI → control plane → modèle → réponse ; artefacts dans `docs/deploy-evidence/`.

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| AGM-1. Supprimer le menu « 147 modèles » de la landing (aucun nom de modèle sur marketing) | ✅ | ✅ `84c860b5` | ✅ 16/07 | `a-dom-scan.txt` landing 3 formats hits=[] |
| AGM-2. Supprimer tout sélecteur modèle/provider de la création de projet | ✅ | ✅ `84c860b5` | ✅ 16/07 | `a-dom-scan.txt` projects-new desktop+mobile hits=[] |
| AGM-3. Supprimer le sélecteur modèle/provider de l'IDE (chat Bolt) | ✅ | ✅ `84c860b5` | ✅ 16/07 | `b-ide-modes-desktop.png` oldModelCombobox=false, hits=[] |
| AGM-4. Segmented control 3 modes dans l'IDE + ⌘⇧I (Lite / Economy défaut / Power) + garde-fou Lite | ✅ | ✅ `84c860b5` | 🟡 partiel | segmented+Economy défaut prouvés (`b-ide-modes-desktop.png`) ; ⌘⇧I + texte garde-fou Lite NON capturés live ⬜ |
| AGM-5. Advanced settings : High effort (Economy+Power, jamais Lite, escalade seulement sur tâches dures + « +0 credit » sinon) ; Turbo (Power only, OFF, activable admin org) | ✅ | ✅ `84c860b5` | 🟡 partiel | refus 403 prouvés (`e-refus-plan.txt`) ; popover Advanced + escalade + « +0 credit » NON capturés (High effort indispo en free) ⬜ |
| AGM-6. Routage serveur mode→modèle (config versionnée, PAS un déploiement) + refus mode non autorisé par plan | ✅ | ✅ `d0b302fa`+`9ec04adf`+`7abcb045` | ✅ 16/07 | `c-routing-logs.txt` economy→opus-4-8, lite→haiku-4-5 (log agent-mode.routed) + `e-refus-plan.txt` |
| AGM-7. Log par appel admin-only { userId, projectId, mode, highEffort, escaladeDeclenchee, providerReel, modeleReel, tokensIn/Out, coutRevient, creditsFactures, marge } | ✅ | ✅ `d0b302fa`+`7abcb045` | ✅ 16/07 | `d-agent-call-log.json` (2 lignes, revient 651 vs 129 mc) |
| AGM-8. Écran Admin → Agent → Routage des modèles (revient /1M in/out, multiplicateur, prix crédits, marge % et €, volume 30j, dispo plan, actif) + alerte marge négative bloquante | ✅ | ✅ `d0b302fa`+`fee92bd0` | ✅ 16/07 | `f-admin-spa-table.png` + `f-admin-spa-negative-alert.png` + `f-409-negative-margin.json` |
| AGM-9. Simulateur avant application + historique complet (qui/quoi/quand, marge avant/après) + versionnage effectiveFrom/effectiveTo/sourceDate | ✅ | ✅ `d0b302fa`+`fee92bd0` | 🟡 partiel | simulateur prouvé (`f-simulate.json`) + historique v1 affiché ; publication d'une v2 live NON exécutée ⬜ |
| AGM-10. Ligne classifieur harness (rapide/cheap, non facturé, revient visible) | ✅ | ✅ `dc2d6c9d`+`7abcb045` | 🟡 partiel | ligne « not billed » prouvée (`f-admin-spa-table.png`) ; appel classifieur réel loggé NON déclenché (High effort indispo en free) ⬜ |
| AGM-11. Nudge Economy→Power si boucle, max 1×/projet | ✅ | ✅ `84c860b5` | ⬜ | NON testé live (boucle 4 envois Economy non déclenchée) |
| AGM-12. Preuves live (a)–(f) : DOM sans nom de modèle, 3 modes IDE, mode change le modèle appelé (log), coût diffère, refus par plan, alerte marge | ✅ | ✅ (`c94f2fdf`) | ✅ **16/07** — (a) scan DOM 3 surfaces × 3 formats hits=[] ; (b) segmented IDE Economy défaut ; (c) economy→opus-4-8, lite→haiku-4-5 (agent-mode.routed live) ; (d) AgentCallLog revient 651 vs 129 mc ; (e) 403 HIGH_EFFORT/TURBO_NOT_ALLOWED ; (f) marges live + 409 AGENT_ROUTING_NEGATIVE_MARGIN | Artefacts bruts `docs/deploy-evidence/` |

## Server deploy Phase A — « Publish = snapshot du workspace → image → run » (décision Avi 15/07)

Contexte : le chemin boot-script (détection Node → tarball source → install/build au boot) est l'impasse par-langage.
Cible Replit : le déploiement EST le workspace, imagé. Mesures baseline (15/07, prod) : cold boot boot-script depuis 0 réplique = **91 s** (Next.js « nextproofb2 ») ; réponse chaude 0,45 s.

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| A1. serverApp pods : ECODE_DEPLOYMENT=1 + probe 5 s (règle Replit) + montage /nix kill-switch | ✅ | ✅ `1738afc0` | ⬜ | vérif live = env du pod app + probe |
| A2. Plumbing nixStorePvcName per-request (API→manager→k8s), allowlist projet | ✅ | ✅ `1738afc0`+`f32aa5f6` | ⬜ | flip global NIX_STORE_PVC_NAME intact (off) |
| A3. Snapshot COMPLET (deps incluses) uploadé depuis le pod (URL signée PUT, plafond 2 Mo contourné) | ✅ | ✅ `43080762` | ⬜ | |
| A4. Builder Cloud Build : Dockerfile généré générique (FROM base workspace + COPY + RUN build + CMD run), push AR, taille d'image rapportée | ✅ | ✅ `ca021f99` | ⬜ | limite Replit 8 Gio à surveiller |
| A5. Chemin image flag-gated `SERVER_DEPLOY_SNAPSHOT_IMAGE=1` dans le flux server-deploy (flag absent = boot-script octet pour octet) | ✅ | ✅ `f32aa5f6` | ⬜ | |
| A6. `.ecode/deploy.json` {run,build} générique (équivalent `.replit [deployment]`) honoré par le handler ET /deployments/detect | ✅ | ✅ `f32aa5f6` | ⬜ | zéro code par-langage |
| A7. Infra : repo AR `vibecore-prod-apps`, IAM (GSA platform cloudbuild.builds.editor + AR reader ; compute SA AR writer), PV nix recréé avec nodeAffinity zone-a, clés chart | ✅ | ✅ `63fdcde1` + fait live | ⬜ | PVC ROX 80Gi bound ; affinité PROUVÉE (scheduler exclut zone b) |
| A8. Preuve live Node : app publiée PAR LE BOUTON UI → 200, chemin image | ✅ | — | ⬜ | mesurer publish + cold boot + taille image |
| A9. Preuve live Python : app publiée PAR LE BOUTON UI → 200, zéro code par-langage (nix /python 3.12.8 du store prouvé sous gVisor le 15/07) | ✅ | — | ⬜ | nécessite allowlist nix du projet |
| A10. Mesures jour-1 : cold boot image-path (cible ressentie < 30 s ; 4 min = cassé) + taille d'image à chaque publish | ✅ | 💻 (loggé métadonnées) | ⬜ | baseline boot-script = 91 s |

Règles dures Replit déjà en place : port externe unique (Service 80→PORT), health `/` budget 5 s (A1), FS non persistant par publish (image immuable), idle 15 min par défaut (`SERVER_DEPLOY_IDLE_MINUTES`), `ECODE_DEPLOYMENT=1` (A1).
Reste hors Phase A : unités de facturation Autoscale (1 CPU-s=18 / 1 GoRAM-s=2), tiers Reserved VM ($20/$40/$80/$160), changement de type en place.

## Server deploy Phase B — pipeline reproductible + Nix v2 (15/07, correction d'architecture `d013e5fd`)

Décisions committées : `docs/DEPLOY_REPRODUCIBLE_PIPELINE.md` (pipeline) + `docs/NIX_V2_DECISION.md` (Nix v2 : nixpkgs 26.05 rev `8eeec934ae0d`, Nix 2.34.8, store partagé RO, compilateur d'env central, `ecode.lock.json`, build via Job in-cluster — le blocage « Cloud Build n'a pas /nix » est dissous par design).

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| B0. readinessProbe app+workspace : échantillonnage 1 s (baseline mesurée 6-7 s start→Ready) | ✅ | ✅ `b2558c41` | ✅ **15/07** | MESURÉ live : containerStart→Ready 6-7 s → **0 s** ; réveil scale-0→200 **16 s** (vs 22 s). Preuves `docs/deploy-evidence/2026-07-15-phase-b/` |
| B1. Snapshot-révision (source seule, sha256 pod-side, `revisions/server-deploy/<id>.tgz`) | ✅ | ✅ `98e16a8d` | ✅ **15/07** | objet GCS 489 o + sha256 persistés (deployment `cmrmb34mz…`) |
| B2. Pod de build isolé (gVisor, emptyDir, /nix RO optionnel, label egress server-deploy, AUCUNE PVC workspace) | ✅ | ✅ `98e16a8d` | ✅ **15/07** | pod `app-build-<id>` observé live ; deps de l'app déployée installées SANS que le workspace n'ait jamais lancé npm |
| B3. Câblage flag-gated `SERVER_DEPLOY_REVISION_PROJECTS` (allowlist projet, vide = chemin A octet pour octet) | ✅ | ✅ `98e16a8d` | ✅ **15/07** | `--set` fait (rev 840) ; publish hors allowlist inchangé |
| B4. Preuve live Node : Publish réel via révision → URL 200 + artefact rejouable | ✅ | ✅ | ✅ **15/07** | publish→READY 62 s, URL 200 `builtFrom:revision`, image 163 MB (Cloud Build 26,7 s, COPY seul), fix `fb855095` (skip npm sans package.json) |
| B5. Store Nix v2 (26.05 pinné) + bundles d'activation + preuve Python | ✅ | ✅ | ✅ **15/07** | store 1,9 Go/2 012 chemins signés ; publish Python réel `cmrmc2v0u…` → URL 200 `python:3.12.13` (toolchain 26.05), venv construit dans le pod isolé, pod app monte `nix-store-v2-pvc` ; fix `fb855095` |
| B6. Gates policy + scan secrets/vulns bloquants avant déploiement | ✅ | ✅ **mergé sur main 07/08** — PR #81 merge `aa447067` (SHA signé `ef13a979`) + fix bloquant `57efc379` | 🟠 gates prouvées en CI réelle, `helm upgrade` à confirmer | `deploy-main.yml` : job `preflight-gates` (gitleaks bloquant + garde policy « signature toujours câblée ») que `build-and-deploy` `needs`, puis **gate Trivy bloquant entre Cloud Build et `helm upgrade`** (CRITICAL corrigeables, `.trivyignore` justifié+daté). Preuves LOCALES : gate policy passe propre / **échoue** si l'étape de signature est supprimée ET si elle est mise en `allowFailure` ; gitleaks 8.21.2 exit 0 propre → **exit 1** sur clé privée injectée (`docs/deploy-evidence/2026-08-03-b6-b7-supply-chain/02`,`03`). ⚠️ **jamais exécuté en CI réelle** → ✅ interdit. ⚠️ Découverte : les étapes `gcloud artifacts docker images scan` existantes ne scannent **rien** (API `containerscanning` désactivée, masqué par `allowFailure: true`) |
| B7. Signature d'images (cosign) + vérification à l'admission | ✅ | ✅ **mergé sur main 07/08** — PR #81 merge `aa447067` (SHA signé `ef13a979`). **Kyverno reste en `failureAction: Audit`** ; Enforce NON activé (interdit tant que : build main vert → image signée → digest déployé vérifié → canari 3 cas). Le manifeste n'est appliqué par aucun workflow ni chart Helm — merger le code ne peut pas basculer le cluster | ☐ Enforce interdit | **LIVE** : clé KMS `ecode-supply-chain/cosign-images` (EC_P256, privée jamais exportée) ; **40/40 digests prod en vol signés + vérifiés hors-ligne** ; Kyverno 1.18.2 installé, `namespaceSelector` **In [vibecore]** (l'API server n'appelle jamais le webhook pour `workspaces`/`project-databases` — prouvé). Politique **en AUDIT**, pas Enforce. **Preuve négative obtenue en ns canari** : image signée **ADMISE**, image non signée **REFUSÉE** (`no signatures found`) sous `Enforce` réel (`…/01`). Étapes cosign ajoutées aux 3 configs Cloud Build mais **build vert pas encore obtenu** (file d'attente 1 slot) → **Enforce volontairement PAS activé** : l'activer avant que le pipeline ne signe = prochain push sur main non signé = tous les pods refusés. ⚠️ 2 pièges désamorcés : (a) la policy AR `delete-older-than-7d` aurait **supprimé les signatures** (tags `sha256-*.sig`) → rollback refusé des semaines plus tard ; (b) Kyverno sans identité GCP **refusait** les pods (deny, donc `failurePolicy: Ignore` ne protège pas) → WI `vibecore-kyverno-ar` lecture seule 1 repo |
| B8. Interface `SandboxRuntime`/RuntimeAdapter (aucun objet métier = Pod ; microVM cible) | ✅ | ✅ `fead062e` | ✅ **15/07** | publish B5 réel passé par `GvisorPodRuntime` (manager `fb85509520`) ; réveil Node re-mesuré **14,5 s** (22 s Phase A) avec le poll 1 s |

## Zone Autoscale + tailles machine + rétention AR (16/07, session zone-autoscale)

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| Z1. **BUG-CRON-001** : enqueue CronJobs mort (bullmq ≥5.76 rejette `:` dans jobId) → tous les crons plateforme Failed depuis ~9/07 | ✅ | ✅ `9b3315b1` | ✅ **16/07** | Preuve live : jobs Complete 1/1 post-CD + tick 05:15 → 11 apps idle endormies 0/0 (dont Phase B, 1/1 depuis 12 h). Voir BUG_INVENTORY_LIVE |
| Z2. Tailles machine 0.25→8 vCPU (RAM=4×vCPU) sur Rate Card versionné (DB `RateCard` seed v1, migration 0070, fallback code) ; `Deployment.machineSize` persisté + hérité (redeploy/publish-prod) ; requests==limits sur le pod ; garde plan (8 vCPU interdit en free) + plafond capacité `SERVER_DEPLOY_MAX_VCPU` (défaut 2 = nœuds 3920m) ; sélecteur au panneau Deploy depuis `GET /projects/:id/deployments/rate-card` (prix $/h actif, zéro chaîne en dur) | ✅ | ✅ `1ea573b4` | ✅ **16/07** | Publish réel `cmrn4qhjy…` dedicated-1 → kubectl `requests==limits {cpu:1, memory:4Gi}`, URL 200 ; gardes 400 PLAN/CAPACITY/UNKNOWN prouvées ; panneau vu à l'écran (6 tailles, prix carte, désactivées avec raison). `docs/deploy-evidence/2026-07-16-zone-autoscale/` |
| Z3. Billing runtime autoscale : sweep sur tick deploy.reap (5 min) — temps ACTIF (replicas>0) × taille (18 u/CPU-s + 2 u/Go-s), **jamais 0** (plancher 1 unité), sommeil gratuit, watermark par déploiement, fenêtre plafonnée 30 min | ✅ | ✅ `1ea573b4` | ✅ **16/07** | Événement live 06:35 : 6 830 unités = 26 u/s × 262,7 s (contrôle exact) = 2,19 ¢, metadata machineSize/activeSeconds/replicas/requests/rateCardVersion, watermarks avancés (shadow mode) |
| Z4. Metering requêtes : proxy compte→delta au touch 30 s ; manager cumule annotation `vibecore.ai/request-count` + `/status` l'expose ; sweep facture le delta $1.20/M (watermark `meteredRequests`, reset ⇒ jamais négatif) | ✅ | ✅ `894c5f6f` | ✅ **16/07** | Événement 06:35 : requests:1 facturée, watermark meteredRequests=1 sur la ligne (vérifié en DB) |
| Z5. Autoscale bout en bout : replicas=0 sans trafic (15 min) → 1 requête → réveil + 200, requête non perdue | ✅ | ✅ (préexistant + Z1) | ✅ **16/07** | 2 cycles bruts : `app-cmrmb34mz` 0→200 en 16,05 s ; `cmrn4qhjy` (dedicated-1) endormi tick 07:00 → 200 en 16,3 s → replicas 1/1. Port unique 80→3000 + probe 5 s relevés |
| Z6. Rétention AR : chiffré (containers 1380 img/483,4 Go ; apps 6 img/168 Mo sans policy) ; policies posées : containers keep-20 + KEEP `running-*`/`helm-active-*` + DELETE >7 j ; apps keep-10 + KEEP `active-*` + DELETE >60 j ; 23 tags de protection posés ; workflow `ar-protect-images.yml` (*/6 h) | ✅ | ✅ `019e0a53` | ✅ **16/07** | Trou réel bouché : `screenshotter:377792b0e1` TOURNAIT hors keep-20 (supprimable à J+23 sous l'ancienne policy). Policies vérifiées par describe ; run workflow 29473177657 **success** (après grant repoAdmin repo-scoped au SA CI) |

⚠️ Capacité : demande de quota `SSD_TOTAL_GB` REPORTÉE par Google (« resubmit après 48 h ou avec plus d'historique billing » — pas un refus définitif). État 15/07 soir : 432/500, dont **400 = boot disks pd-balanced des 4 nœuds gvisor** (aucun pd-ssd n'existe ; pd-balanced compte DANS ce quota). Seule sortie structurelle : recréer le pool gvisor avec boot disks **pd-standard 200 Go** (throughput ≈ équivalent, coût identique, `DISKS_TOTAL_GB` 4,2/20 To) → SSD ~32/500 et autoscale débloqué. GO d'Avi requis (drain = redémarrage des pods workspaces). Ménage fait : spike-workspace-pvc (2 Go SSD) + 19 PVC d'orgs de test E2E supprimées.
⚠️ `--reuse-values` : les nouvelles clés chart (`serverDeployImageRepo`, `nixStorePvc`…) n'atteignent la release que via UN `--set` manuel (fait après passage CD), ensuite persistées.
