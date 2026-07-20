# CHANGELOG_AUDIT — journal append-only des événements d'audit parité

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
Règle: append-only; chaque entrée = date UTC, acteur, événement, artefacts.

## 2026-07-16

- (audit externe) 19 P0 levés; P0-02 (12 registres manquants) et P0-04
  (collecteur baseline quotidien) traités dans ce commit.
- (fait vérifié, fetch réel) le changelog Replit n'est PAS hebdo-vendredi:
  llms.txt (sha256 03cbdb0706d90455…) liste 2025-11-16 (dimanche) et
  2025-11-26 (mercredi). Toute automatisation « vendredi » interdite.
- (source hashée) changelog 2026-04-17: « Power mode now runs on Anthropic's
  Claude Opus 4.7 » + segmented control Lite/Economy/Power, Turbo dans
  Advanced settings (sha256 c1f1dd962c8be057…).
- (collecte) premier snapshot baseline quotidien: 6/6 sources OK
  (docs/parity/baseline/snapshots/2026-07-16/manifest.json).
- (chantier AGM) sélecteur 147 modèles supprimé, 3 modes + routage carte
  versionnée + écran admin marge codés et poussés (dc2d6c9d→fee92bd0);
  preuves live a–f PENDING (déploiement fee92bd0 in_progress).

## 2026-07-16 (resync suivi)

- Resynchronisation `PARITY_STATUS.md` ↔ `PLAN_REMAINING_UNIFIED.md` (les deux
  divergeaient : AGM-12 ✅ dans le plan, ⬜ dans le status ; P0-02/P0-04
  « cette PR » dans le status). Vue agrégée réécrite avec 3 états par point +
  evidenceId précis.
- Règle appliquée : ✅ coché UNIQUEMENT sur artefact vérifiable, jamais par
  déduction. Bilan AGM honnête : 7 points prouvés live (1,2,3,6,7,8,12),
  3 partiels (4,5,9,10), 1 non testé (11 nudge).
- P0-02 P002-1 passé ✅ : validateur exit 0 sur HEAD `2b421a45` + CI
  parity-registries verte sur ce même HEAD (push→success). Le validateur
  prouve structure/hash/snapshots, PAS la complétude fonctionnelle des domaines.
- Prochain chantier ouvert : implémentation Remix (DOMAIN_MODEL §1),
  invariant sécurité « une valeur de secret n'entre jamais dans l'artefact de
  clone ; CREDENTIALS_DETACHED précède CLONING ».

## 2026-07-17 (plan canonique + réconciliation des registres)

- (supersession) `docs/parity/PLAN_PARITE_REPLIT.md` devient LE plan canonique
  unique. Il supersède `PLAN_PARITE_REPLIT_v5.md` (document hors repo, outputs
  de l'orchestrateur, sha256 cd7ec771b2deddf19c2f8115ac2745ace9e79ad1030ab1c2
  5eac8fb4997209a1) ; un bandeau SUPERSEDED a été apposé sur le fichier v5.
  Règle : correction PAR REMPLACEMENT dans le fichier canonique ; git porte
  les versions ; interdiction de créer une variante concurrente (_v6, _FINAL…).
- (correction factuelle) §1 v5 annonçait « quatre familles » de collecte, le
  tableau en portait cinq → « cinq familles » (plan §2.2).
- (correction factuelle, source hashée) Import : le hub officiel liste
  12 entrées DONT « Previous Agent export » et « Empty »
  (SRC-REPLIT-IMPORT-PROVIDERS sha256 56b14555…, claim RPL-24). Notre comptage
  à 11 (Previous Agent export absent) est remplacé. Convention unique :
  12 entrées dont Empty.
- (correction factuelle, source hashée) Cloud Run multi-région : le claim v5
  « pas de failover applicatif automatique » (étiqueté RPL-23 dans le v5) est
  PÉRIMÉ → reclassé **GCP-11** (source cloud, pas produit Replit ; le RPL-23
  du registre repo — 4 modes d'accès — est inchangé). Cloud Run service health
  automatise failover/failback (readiness probes + serverless NEGs).
  **Statut mesuré** : GA le 29/06/2026 d'après les release notes
  (SRC-CLOUDRUN-RELEASE-NOTES sha256 54ecea8f…) ; la page produit fetchée le
  17/07 ne porte PAS de bannière Pre-GA (SRC-CLOUDRUN-SERVICE-HEALTH sha256
  dcfbdee7… ; les 6 badges « Preview » du snapshot concernent d'autres pages
  de la nav : Ephemeral Disk, Sandboxes, custom scaling, Cloud Service Mesh).
  **Divergence consignée** : la lecture owner du 17/07 rapportait une bannière
  « Preview — Pre-GA Offerings Terms » sur cette doc ; les artefacts hashés ne
  la reproduisent pas. Traitement fail-closed : l'exigence demandée est
  conservée TELLE QUELLE — fallback + exit strategy obligatoires,
  indépendamment du statut GA (plan §4.6).
- (fait vérifié, source hashée) Artifact Registry attachments : bannière
  Pre-GA « Preview … available "as is" and might have limited support »
  CONFIRMÉE (SRC-AR-ATTACHMENTS sha256 df666b6c…, claim GCP-12) → fallback
  obligatoire (attestations Binary Authorization / Container Analysis, copie
  des referrers via ORAS) + exit strategy (plan §4.5).
- (registres) P0_REGISTRY : 4 → 19 entrées. Les **15 P0 du dernier audit
  externe** (Audit_complet_PLAN_PARITE_REPLIT_v3_2026, 16/07) tracés
  INDIVIDUELLEMENT (P0-V3-01…15) avec description, source, owner, statut,
  targetDate ISO, commit, reviewer, preuve, dépendances, condition de clôture.
  4 restent OPEN (V3-01 collecteur CI, V3-05 remix licence/PII, V3-06 import
  connecteurs/crédits, V3-07 promotion AR live). La CI compare désormais
  l'ensemble EXACT des IDs attendus (EXPECTED_P0_IDS) — un ID absent casse le
  build. Le rollup respecte le statut déclaré comme plancher : un P0 déclaré
  OPEN ne peut plus être dérivé PROVEN par ses preuves partielles.
- (registres) `targetDate: UNKNOWN` INTERDIT (schémas v2 + validateur) dans
  P0/UNKNOWN/DECISION : date ISO réelle, ou `state: ACCEPTED_RISK` justifié
  (owner + expiration + reviewCondition). UNKNOWN_REGISTRY réécrit : 11 → 19
  inconnues (nouvelles : capacités gate-bêta UNK-CLOUDTENANT-IMPL,
  UNK-CHECKPOINT-IMPL, UNK-BILLING-MINIMAL-IMPL, UNK-NIX-MULTIZONE-IMPL,
  UNK-DB-MIGRATION-PUBLISH-IMPL, UNK-ROLLBACK-FLAG-APPLIED [remplace
  UNK-ROLLBACK-FLAG-PERMANENCE, tranché par D2], UNK-GIT-RECONCILE-DONE,
  UNK-GALLERY-OPTION-B-CONTENT, UNK-CLAIMS-ANCHORING) ; 3 passées
  ACCEPTED_RISK justifié (report-flow, self-publish, review-workflow).
- (statut) Le booléen `approvalReady` est SUPPRIMÉ et interdit par le
  validateur (c'était un faux positif de couverture : il validait un registre
  incomplet). Remplacé par 8 NIVEAUX NOMMÉS calculés (documentReady,
  registryComplete, architectureContracted, implementationReady,
  verticalReady, betaReady, publicLaunchReady, parityBaselineReady) +
  `approved.level` = plus haut niveau CONTIGU. Nouveaux contrôles calculés :
  artefacts de preuve présents ET hashés (evidence[].evidenceSha256), triage
  SLA bloquant (jours ouvrés), preuve API ≠ preuve UI (uiGaps par étage du
  vertical : publish et rollback n'ont pas de preuve UI), gates bêta =
  UNKNOWNs de capacité. **État mesuré au b774bfa3 :
  approved.level = architectureContracted** (implementationReady bloqué par
  les 4 P0 OPEN ; betaReady par les 6 capacités gate ; parityBaselineReady par
  le triage PENDING des claims RPL-20/21/22).
- (décisions, OWNER_DECISION) Enregistrées avec citations :
  D1 réconciliation Git (« Merge toi meme et verifie les commits des autres
  sessions si ils sont bon tu les prend ») ; D2–D6 approuvées par « Oui » à
  « tu adoptes D2 à D6 tels qu'écrits dans ce document ? » (17/07/2026,
  contenu = Reponses_decisions_D1_D6_ECode_20260717.docx de l'expert d'Avi :
  rollback permanent fail-closed · GO multi-zone topologie réelle + coût
  mesuré · billing minimal avant connecteurs par lots · compte E2E dédié
  plutôt que Chrome personnel · validation a posteriori TPL-02 + gate déplacé
  au merge/release/testé-live) ; fichiers de suivi versionnés (« Oui si il
  faut le faire et c sans risque ») ; Gallery option B confirmée (contenu
  exact à inscrire via UNK-GALLERY-OPTION-B-CONTENT — non réinterprété).
- (méthode) Correspondance des IDs v5 → registre repo consignée : v5 RPL-20
  (changelog Opus 4.7) = RPL-2026-001 ; v5 RPL-21 (changelog 10/07) =
  RPL-20/21/22 repo ; v5 RPL-22 (modes d'accès) = RPL-23 repo ; v5 RPL-23
  (Cloud Run) = GCP-11. Étiquettes héritées non encore ancrées
  individuellement : UNK-CLAIMS-ANCHORING (2026-08-15).

## 2026-07-17 (assainissement secret-scan des snapshots du 16/07)

- (triage sécurité) Les 3 détections du scan bloquant sur l'arbre (règle
  generic-api-key) ont été examinées une à une : (1) et (2)
  `pricing.html` / `pricing.rendered.html` = jeton CLIENT public Datadog
  (préfixe `pub…`) embarqué par replit.com dans sa page pricing — public par
  conception ; (3) `gallery-detail-journey-mapper.rendered.html` = valeur
  `"_key"` interne du CMS de la page (identifiant aléatoire, pas un
  credential). **Verdict : 3 faux positifs, aucun secret réel, aucun secret
  E-Code — pas d'incident, pas de rotation nécessaire.**
- (assainissement) Valeurs caviardées dans les 3 snapshots (remplacements
  courts non-matchables) ; sha256 recalculés et mis à jour dans
  `SOURCE_REGISTRY.yaml` (SRC-PRICING, SRC-GALLERY-DETAIL-JOURNEY-MAPPER,
  annotés « snapshot assaini ») et `baseline/snapshots/2026-07-16/manifest.json`
  (entrée pricing).
- (prévention) `collect-baseline.mjs` assainit désormais AUTOMATIQUEMENT les
  captures avant écriture et hash (motifs étroits : clé web publique Google
  `AIza…`, jeton browser Datadog `dd-api-key=pub…`). Aucun motif de vrai
  secret n'est caviardé : un vrai secret doit faire échouer le scan, pas être
  masqué.

## 2026-07-19 — traçage de l'audit de couverture (~300 points)

- `COVERAGE_GAP_AUDIT_2026-07-17.md` (audit du 19/07) : ~320 points ouverts des
  anciens plans, ~13 référencés dans le plan → traçage complet :
  - `P0_REGISTRY.yaml` +section `p1s` (P1-COV-01…08, famille A+B) ;
  - `SURFACE_REGISTRY.yaml` +6 surfaces déclarées (UNSUPPORTED/UNKNOWN) ;
  - `BOLT_DEBT_REGISTRY.yaml` créé (BD-01…26, famille C, NON_FAIT) ;
  - `PRODUCTION_READINESS_REGISTRY.yaml` créé (48 items PR-*, familles D+E, NON_FAIT) ;
  - `UNKNOWN_REGISTRY` +UNK-BILLING-LEGACY-GOLIVE, +UNK-DB-COMPUTE-METERING ;
  - `DECISION_REGISTRY` +DEC-BILLING-LEGACY-VS-LEDGER (OPEN, owner avi) ;
  - `ACTIONS_AVI.md` créé (11 actions propriétaire consolidées).
- CI durcie : `EXPECTED_P1_IDS`/`EXPECTED_BOLT_DEBT_IDS`/`EXPECTED_PROD_READINESS_IDS`
  (même mécanisme que les 19 P0 — un ID absent casse le build ; preuve négative
  exécutée : retrait de BD-26 → exit 1) ; les 2 nouveaux registres ajoutés à
  REQUIRED_REGISTRIES ; FAIT_PROUVE exige un evidenceId sur disque.
- Plan : version 2026-07-19.1 — §3.7 note « legacy vs ledger à réconcilier »,
  §9 P1 en deux familles, §13 « périmètres complémentaires », §7 régénéré.
- Raison : « un registre ne bloque pas sur un trou qu'il ignore » (§1, loi 3) —
  les ~300 points ne pouvaient plus rester implicites.

## 2026-07-19 (bis) — versement du backlog complet DANS le plan (§14)

- Demande propriétaire : plus de fichier de couverture « à côté » — chaque
  point DANS le plan. §14 ajouté : **336 points**, un par ligne (ID,
  description simple, statut, owner, échéance, suivi) — 332 NON FAIT,
  1 DÉJÀ FAIT (GC idle, preuve BUG-CRON-001), 3 PÉRIMÉS (ancien pipeline
  deploy-prod, preuve deploy-main.yml).
- Certification calculable : `check-plan-completeness.mjs` (appelé par le
  validateur, donc la CI) verrouille compte exact (336) + SHA-256 de la liste
  triée des IDs + schéma des lignes + résolution des références « suivi par ».
  Preuves négatives exécutées : ligne OUT-QA-17 retirée → exit 1 (compte+hash).
- Registres complétés en support : BD-28/29 (Monitoring partiel, chats
  standalone), PR-INFRA-01 (staging Terraform), PR-MISC-07 (surfaces admin) ;
  4 gates « deploy providers » re-mappées sur BD-22.
- Version du plan : 2026-07-19.2 ; §7 régénéré (counts.backlog inclus).

## 2026-07-20 (audit de réanalyse appliqué — 16 P0 + 14 P1)

- (audit externe) Audit_reanalyse_PLAN_PARITE_REPLIT_LIVRAISON_2_2026.docx sur
  le plan 2026-07-19.2 (sha256 af88c6c6…) : 16 P0 + 14 P1. TOUT appliqué par
  remplacement dans le plan canonique (version 2026-07-20.1) + registres.
- (correction factuelle VÉRIFIÉE, snapshot hashé) **WIF/GKE** : « WIF
  uniquement si source externe » était FAUX — la doc GKE dit « In GKE, Google
  Cloud manages the workload identity pool and provider for you and doesn't
  require an external identity provider » + « recommended way »
  (SRC-GKE-WORKLOAD-IDENTITY sha256 9d3f0f66…, claim GCP-13). §4.4 remplacé
  par les trois chemins (GKE→WIF for GKE ; externe→IAM WIF ; Cloud Run→service
  identity + impersonation courte). Zéro clé persistante partout.
- (correction factuelle VÉRIFIÉE, snapshots hashés) **Auth Clerk** : la
  migration documentée est custom-auth→Clerk ; le guide Replit Auth→Clerk est
  « coming soon » (citation exacte, SRC-REPLIT-CLERK-MIGRATION sha256
  daf309ee…, claim RPL-26) ; « What's not supported » : SMS, MFA end-user,
  SSO complet, Organization tenants (SRC-REPLIT-CLERK-AUTH sha256 6f94c8fd…,
  claim RPL-25). §3.9 remplacé ; MFA/passkeys/orgs = EXTENSIONS E-CODE, pas
  parité courante.
- (fait vérifié) **Cloud Run multi-tenant** (doc du 17/07, SRC-CLOUDRUN-
  MULTITENANT sha256 86362e28…, claim GCP-14) : 1 projet/tenant recommandé,
  pool de projets précréés, folders first-party vs untrusted, billing account
  par tier de réputation, LB global + Service Extensions. **Quotas** (claim
  GCP-15, sha256 604d5e5e…) : 1000 services/jobs/worker-pools par
  projet+région. §4.2 : ReputationTier, BillingAccountBinding,
  AbuseEventPolicy, CapacityPolicy étendue.
- (structure) §3.0 Project→Artifacts (7 artifacts max / 1 mobile =
  entitlements, backend+data partagés, ProjectRelease GROUPED) ;
  DEPLOYMENT_TYPES_CONTRACT.md (Autoscale/Static/Reserved VM/Scheduled).
- (univers) SURFACE_REGISTRY v3 : 159 surfaces P001–P159 + 56 services
  S01–S56 importés de l'inventaire IDE (Plan_IDE_Complet docx sha256
  0b232212…), ensembles EXACTS verrouillés CI. Évaluation honnête : 0/159
  évalué → parityBaselineReady FAIL tant que UNKNOWN.
- (backlog) Les 336 constats déplacés du §14 vers LEGACY_FINDING_REGISTRY
  (provenance plan@af88c6c6 ligne à ligne + originRef ; limite déclarée : le
  fichier/ligne des 29 documents d'ORIGINE n'a pas été capturé) ; 99 work
  items canoniques dans WORK_ITEM_REGISTRY (regroupement par suivi + 6 paires
  de l'audit, duplicateOf posés). check-plan-completeness certifie désormais
  LE REGISTRE (mêmes constantes 336 + sha 121218ff…). Compteurs : source
  unique = JSON généré (boltDebt=29, prodReadiness=50 — les « 26 »/« 48 »
  manuels supprimés).
- (registres) P0 : 19→35 (P0-A2-01…16, dont OPEN : A2-12 déduplication
  sémantique/provenance, A2-15 ancrage des claims hérités). P1 : 8→40
  (P1-V3-01…18 enfin individuels — la plupart APPLIED, P1-V3-07 SUPERSEDED
  par GCP-11 ; P1-A2-01…14 — 4 OPEN). Ensembles EXACTS + preuve négative
  rejouée (retrait de P0-A2-16/P1-A2-14 ⇒ exit 1 nommant les IDs).
  DEC-OWNER-GALLERY-OPTION-B repassée OPEN/CAPTURE_INCOMPLETE (P0-A2-10).
  Owners = RÔLES (platform/owner/security/billing) + mapping OWNER_ROLES.yaml
  (P1-A2-08).
- (statut) Échelle **11 niveaux** (documentCanonicalized → … →
  parityBaselineReady) ; verticalReady SCINDÉ (backend PASS / userJourney
  FAIL sur uiGaps publish+rollback) ; contractsPresent ≠ contractsValidated
  (validated FAIL — aucun reviewer réel) ; approved.level SUPPRIMÉ et interdit
  → **overallStatus=NOT_APPROVED + highestPassedLevel=documentCanonicalized** ;
  unanchoredClaims calculé (18) et bloquant sourceBaselineReady ;
  DOCUMENT_MANIFEST.yaml généré (hash de chaque compagnon, drift-check CI) ;
  TRACEABILITY_MATRIX amorcée ; generatedAt réel (2026-07-20T04:20:00Z),
  mergedToMainAt: null (honnête).
## 2026-07-19 (assainissement secret-scan des snapshots du 16/07 — porté sur main)

- (triage sécurité) Les 3 détections du scan bloquant sur l'arbre (règle
  generic-api-key, mêmes 3 depuis le 16/07) ont été examinées une à une :
  (1)(2) `pricing.html` / `pricing.rendered.html` = jeton CLIENT public
  Datadog (préfixe `pub…`) embarqué par replit.com dans sa propre page — public
  par conception ; (3) `gallery-detail-journey-mapper.rendered.html` = valeur
  `"_key"` interne du CMS de la page (identifiant aléatoire, pas un
  credential). **Verdict : 3 faux positifs, aucun secret réel, aucun secret
  E-Code — pas d'incident, pas de rotation.** Snapshots des 17/18/19-07
  vérifiés : aucun motif présent.
- (assainissement) Valeurs caviardées dans les 3 snapshots ; sha256 recalculés
  dans `SOURCE_REGISTRY.yaml` (SRC-PRICING, SRC-GALLERY-DETAIL-JOURNEY-MAPPER,
  annotés « snapshot assaini ») et `baseline/snapshots/2026-07-16/manifest.json`.
- (prévention) `collect-baseline.mjs` caviarde AUTOMATIQUEMENT ces motifs
  publics (AIza…, dd-api-key=pub…) avant écriture et hash. Aucun motif de
  vrai secret n'est caviardé : un vrai secret doit faire échouer le scan.
- (note) Même contenu que le commit 9eab2990 de la PR #3 (hashes identiques) —
  porté sur main séparément pour débloquer le scan de toutes les PR ; le merge
  ultérieur de la PR #3 sera sans divergence sur ces fichiers.

## 2026-07-20 (merge origin/main dans la branche audit2)

- (réconciliation) origin/main mergé (a7b69ab7) : la PR #10 (assainissement,
  contenu identique) et le snapshot quotidien du 20/07 sont intégrés ; le
  CHANGELOG conserve les deux entrées d'assainissement (17/07 branche,
  19/07 main) — append-only, aucune supprimée.
- (fait, non encore prouvé dans les registres) D2 (rollback permanent,
  2f1fe1db) et D3 (Nix multi-zone, 0ea1211b) sont MERGÉS sur main avec
  artefacts (`docs/deploy-evidence/2026-07-17-rollback-permanent/`,
  `…-nix-multizone/COST_REPORT.md`) et la PR #6 sécurité est mergée.
  Les UNKNOWNs de gate (`UNK-ROLLBACK-FLAG-APPLIED`,
  `UNK-NIX-MULTIZONE-IMPL`) restent OUVERTS ici : leur clôture exige la
  vérification des preuves live par leurs sessions — un merge n'est pas une
  preuve.

## 2026-07-20 (réconciliation A2 — les 2 manquants réglés + arbitrage des 5 nuances)

- (manquant #1 — option a) `PARITY_STATUS.md` est désormais RÉELLEMENT
  générée : `scripts/parity/generate-parity-status.mjs` la produit depuis
  `APPROVAL_STATUS.json` + `CI_ATTESTATION.yaml`, la partie chantiers venant
  de `PARITY_STATUS_NOTES.md` (maintenue à la main, DÉCLARÉE comme telle,
  embarquée verbatim). Drift-check par le validateur : éditer la vue à la
  main casse le build. §1 du plan mis à jour en conséquence.
- (manquant #2) Attestation CI RÉELLE enregistrée (`CI_ATTESTATION.yaml`,
  embarquée dans `DOCUMENT_MANIFEST.yaml` à la place du renvoi) : workflow
  « Parity registries », run 29718207435, VERT, event pull_request, commit
  fed58e96, 2026-07-20T05:02:13Z. Le validateur exige présence + format +
  conclusion=success — les 2 points sont câblés dans le contrôle de
  complétude.
- (nuances assumées — arbitrage demandé par l'owner) :
  1. `statusGeneratorCommit` : ALIGNÉ à la lettre — champ ajouté au §0 (en
     plus de `statusCommit`, conservé).
  2. Univers des surfaces dans SURFACE_REGISTRY plutôt que PUBLIC_BASELINE :
     VARIANTE MAINTENUE — le baseline est le registre des CLAIMS Replit
     ancrées (URL+hash chacune) ; y verser 159 entrées internes non ancrées
     briserait la sémantique d'ancrage et gonflerait unanchoredClaims à tort.
     L'exigence de fond (ensemble exact, égalité vérifiée CI) est satisfaite.
  3. FAIL au lieu de UNVERIFIED sur les niveaux : VARIANTE MAINTENUE — plus
     STRICTE que la lettre : un booléen passed=false avec raisons nommées ne
     laisse aucun état intermédiaire réclamable ; l'échelle contiguë reste
     binaire et fail-closed.
  4. TRACEABILITY_MATRIX « amorcée » : VARIANTE MAINTENUE — une matrice
     complète affirmée d'un coup serait une fausse complétude ; l'état seed
     est déclaré, la complétion est tracée (P0-A2-02).
  5. Provenance = plan matérialisant (pas les 29 documents d'origine) :
     VARIANTE MAINTENUE — la donnée fichier/ligne d'origine n'a jamais été
     capturée ; l'inventer serait une falsification. Limite déclarée,
     P0-A2-12 OPEN, échéance 2026-08-15 (complétion ou ACCEPTED_RISK).

## 2026-07-20 (live scan Replit intégré — feu vert Avi)

- (source) REPLIT_LIVE_SCAN_2026-07-20.md (sha256 396b07e2…) + captures
  hashées livescan-2026-07-20/ ancrés (SRC-REPLIT-LIVESCAN-2026-07-20,
  claims RPL-27/28/29/30).
- (univers) +15 surfaces P160–P174 (nouveautés N1–N15 du scan), ensemble
  EXACT étendu 159→174 ; chacune UNSUPPORTED déclaré (observée chez Replit,
  pas construite chez nous) + 15 chantiers WI-LS-01…15 NON FAIT
  (canonicalWorkItemCount 99→114, garde CI EXPECTED_LIVESCAN_WI_IDS).
- (retraits) 6 retraits PROUVÉS (RPL-29) → HORS PÉRIMÈTRE : P141 Import
  GitLab reclassé NOT_APPLICABLE « Replit ne le fait plus ». Vérifié : GitLab
  n'était en « à faire » NULLE PART dans le backlog (les 2 mentions GLC
  concernent les identifiants OAuth de connexion git — autre sujet, conservées)
  et le plan §3.3 le disait déjà hors table d'import. Max mode / starter
  templates / Teams / Bounties / profils anonymes : absents du backlog en
  « à faire » — rien d'autre à reclasser. ACT-04/ACT-36 (starters→démos)
  restent alignés avec le retrait des starter templates.
- (faits) §3.12 : prix mesurés (Starter gratuit / Core $20 / Pro $100 /
  Enterprise ; Teams n'existe plus) + limites du gratuit (1 app, 30 jours,
  Lite seul). Note : la doc d'import téléchargée par le scan est OCTET POUR
  OCTET identique au snapshot RPL-24 du 17/07 (56b14555…) — les 12 entrées
  d'import tiennent, aucune correction.
- (inconnues) 28 points « sans trace » → UNK-LS-P004…P158 (owner, date,
  méthode = vrai compte Replit connecté D5) — ni présents ni absents.

## 2026-07-20 (plan corrigé expert appliqué + overlay code réel — exigences Avi A/B/C)

- (PROVENANCE HONNÊTE) Le fichier « plan corrigé de l'expert » n'a PAS été
  retrouvé sur la machine : les deux copies PLAN_PARITE_REPLIT_A_JOUR.md
  (uploads + outputs orchestrateur) sont octet pour octet NOTRE livraison
  (sha b264f24e…). Les corrections appliquées ici sont la liste A1–A11
  relayée par l'owner (vérifiée par lui), point par point — pas une copie
  d'un document introuvable.
- (CORRECTION DE NOTRE PASSE PRÉCÉDENTE) La passe livescan avait annoncé un
  §3.12 et un bloc §2.3 qui n'avaient JAMAIS été écrits (script avorté sur
  une ancre avant écriture — les registres, eux, étaient bien à jour).
  Réparé et réécrit dans la présente version (2026-07-20.4).
- (P0-LS-01) Les « 15 nouveautés » ne s'additionnent plus aux surfaces :
  P160–P174 et WI-LS-01…15 DÉMONTÉS → 15 observations
  OBS-DELTA-20260720-01…15 (PENDING, classifyInto) + 10 REGISTRES SÉPARÉS
  créés (ARTIFACT_KIND ×7 exacts, COMPONENT_KIND, CREATION_INTENT ×9,
  GENERATED_ASSET_KIND, CAPABILITY, DEPLOYMENT_TYPE ×4, IMPORT_PROVIDER ×12,
  CONNECTOR, OFFERING_ENTITLEMENT, EXTERNAL_ECOSYSTEM) — présence + taxonomie
  vérifiées par le validateur (SERVICE/JOB/STATIC_SITE interdits comme
  ArtifactKind ; GITLAB interdit comme tuile).
- (P0-LS-05) GitLab : « pas une tuile du hub courant » (confirmé — la table
  du jour est octet pour octet notre snapshot RPL-24) ; capacité d'import
  Git plus large = UNK-LS-GITLAB-GIT ; l'endpoint /import/gitlab EXISTE dans
  notre code (non exécuté) → P141 builtState=PARTIEL. JAMAIS « retiré ».
- (P0-LS-06…09) 4 faux SANS-TRACE reclassés 📘 DOC-JOUR après vérification
  DIRECTE du corpus hashé du 20/07 : Devtools (l.6116), Library (l.7580),
  Android Emulator (l.2833), Grouped Publish (l.7605/7634 — publication
  groupée confirmée, indépendante refusée). UNK-LS correspondants retirés
  (28→24) ; +UNK-LS-GITLAB-GIT = 25 ouverts pour la session authentifiée.
- (P0-LS-10) Prix = OBSERVATIONS contextualisées (OFFERING_ENTITLEMENT) :
  Core $20 (scan anonyme, hash) vs $25 (vérification expert) — divergence
  CONSERVÉE, jamais une constante ; RATE_CARD.json indépendant.
- (P0-LS-13/14/15) MCP Server = DOC_CURRENT_BETA, PublicApiStatus=UNKNOWN ;
  /@user : inférence limitée à la route testée ; Teams : offre retirée,
  capacités d'équipe conservées (CAP-TEAM-COLLAB). Claims RPL-27/29/30
  amendés en ce sens.
- (EXIGENCE AVI B — overlay code) 159/159 surfaces croisées avec le code
  réel + les 5 inventaires bolt par 6 agents d'exploration :
  **79 DEJA_CONSTRUIT · 43 PARTIEL · 37 NON_FAIT**, chaque entrée porte
  builtState + codeRefs + note dans SURFACE_REGISTRY. Règle appliquée :
  composant bolt présent mais non câblé/factice = PARTIEL (BD-01 sync no-op,
  BD-03 workflows morts, BD-05 pas de cloche, BD-11 devtools limités, BD-12
  métriques no-data, BD-20 PITR jamais prouvé… tous respectés). Le plan ne
  marque plus « à faire » ce qui est déjà construit — ni l'inverse.
- (EXIGENCE AVI C) Les 24 UNK-LS-P* + UNK-LS-GITLAB-GIT restent UNKNOWN ;
  verdicts attendus de la session « Scan Replit live » (Chrome connecté).
- (statut) Niveau 1 renommé documentReconciled ; 18 P0-LS ajoutés (15 PROVEN
  dont l'overlay, 3 OPEN : classification OBS-DELTA, scan authentifié,
  + P0-LS-16/17/18 selon état) ; EXPECTED_P0_IDS 35→53.

## 2026-07-20 (ADOPTION VERBATIM du plan corrigé de l'expert — 22 sections)

- (adoption) `PLAN_PARITE_REPLIT_FINAL_LIVRAISON.md` (sha256 8ab9a3ef…,
  1142 lignes) adopté comme plan canonique : les 22 sections reprises
  VERBATIM — aucun mot modifié à l'intérieur des sections 0–22.
- (écarts assumés, AUCUN silencieux) :
  1. Bandeau de tête : « CANDIDAT DE REMPLACEMENT » → bandeau canonique
     (le candidat EST adopté ; garder « candidat » aurait été faux).
  2. ANNEXE E-CODE : l'expert la laissait « EN COURS » — complétée (A.1
     overlay 79/43/37 ; A.2 recalcul réel du §17.4 ; A.3 registres). Rien
     inséré dans les sections 0–22 : tout le contenu E-Code vit en annexe.
  3. §17.4 (statut attendu, yaml statique) : conservé verbatim ; le recalcul
     RÉEL vit dans APPROVAL_STATUS.json (annexe A.2) — en cas d'écart, le
     JSON généré fait foi. Vérifié identique ce jour : NOT_APPROVED /
     documentReconciled / sourceBaseline & registryUniverse & contracts &
     implementation & userJourney & beta & public & parity = FAIL ;
     contractsPresent & verticalBackend = PASS chez nous (l'expert les
     marquait NOT_VERIFIED faute du dépôt — nous l'avons).
  4. Contenus E-Code préexistants conservés hors plan (claims RPL-17…30,
     GCP-11…15, décisions, registres) — l'expert ne les contredit pas.
- (P0-LS RENUMÉROTÉS selon l'expert §19 — ancienne numérotation E-Code du
  matin SUPERSÉDÉE, mapping sans perte) : ex-01→06/07 · ex-02/03/04→05 ·
  ex-05→04 · ex-06..09→08 · ex-10→13 · ex-11→16 · ex-12→17 · ex-13→09 ·
  ex-14→10 · ex-15→12 · ex-16→06 · ex-17→P0-B-01 · ex-18→P0-B-02.
  NOUVEAUX de l'expert appliqués : LS-01 visiteur anonyme (vs « nouveau
  compte ») ; LS-02 chiffres scan (21/20/19/16) ; LS-03 paquet d'evidence
  VALIDÉ PRÉSENT (69 fichiers + manifest 21 entrées) ; LS-08 étendu à
  Spotlight (l.5911) et Resources (l.5959), vérifiés corpus → UNK-LS-P004/
  P011 retirés (44 inconnues) ; LS-11 /bounties = EXTERNAL_REDIRECT vers
  Contra ; LS-14 no-model-selector borné au corpus ; LS-15 lien Parallel
  Agents=microVM RETIRÉ (isolationRuntimePerTask: UNKNOWN) ; LS-18 recalcul
  au commit mergé (OPEN par nature). GitLab (LS-04) : « capacité Git
  confirmée par la doc et le changelog, pas une tuile » (plus fort que notre
  « UNKNOWN » d'hier) — registre corrigé. Prix (LS-13) : observations expert
  Core $25/$20-annuel et Pro $100/$95-annuel AJOUTÉES à côté du scan
  ($20/$18, $100/$90) — divergences conservées.
- (structure) 3 registres exigés §2.2 créés par MIGRATION sans modification
  d'entrées : P1_REGISTRY (40 P1, ex-p1s), SERVICE_REGISTRY (56 services,
  ex-serviceUniverse), ROUTE_OBSERVATION_REGISTRY (20 routes du scan,
  hashes, authenticated:false). GENERATED_ASSET ×8 et COMPONENT ×7 alignés
  sur §5.2. EXPECTED_P0_IDS 53→55 (P0-B-01 overlay PROVEN, P0-B-02 scan
  authentifié OPEN).
- (gates durcis conformes §6.3) registryUniverseReady ÉCHOUE désormais tant
  que les OBS-DELTA ne sont pas CLASSIFIÉS (pas seulement présents) ;
  sourceBaselineReady ÉCHOUE sur la LISTE EXPLICITE des 21 claims hérités
  non ancrés (le plan adopté ne les cite plus entre crochets — le déficit
  d'ancrage ne disparaît pas avec la reformulation).

## 2026-07-20 (INSTALLATION du plan EXÉCUTABLE v2026-07-20.4 — schemaVersion 3)

- (installation, Phase 0 §20) INCOMING_PLAN_EXECUTABLE_20260720.md (sha256
  467608f5…, 1436 lignes, 26 sections 0→25 vérifiées par machine) INSTALLÉ
  au chemin canonique, remplacement atomique sur la branche dédiée. Il
  SUPERSÈDE la version « corrigée » du même jour (archivée :
  history/2026-07-20-PLAN_FINAL_LIVRAISON-superseded.md + diff expert
  history/2026-07-20-INCOMING_DIFF.patch). Écarts vs version précédente
  (aucun silencieux) : +§0 activation (canonique SEULEMENT après merge+CI),
  +règles de vérité 10-12, +§20 ordre contraignant en 5 phases, +§23 overlay
  généré (annexe manuelle SUPPRIMÉE), +§24 DoD, +§25 handoff, +10 P0-EX,
  +LEGACY_SOURCE_COVERAGE et IMPLEMENTATION_STATUS au §2.2, +IDENTITY/
  PROJECT_MANIFEST aux contrats §2.3, montants tarifaires RETIRÉS du plan.
- (copies interdites, Phase 0.2) racine PLAN_PARITE_REPLIT_FINAL_LIVRAISON.md
  SUPPRIMÉE de la racine (archivée en history/) ; INCOMING_* retirés du tree
  local après installation ; aucune autre copie _v6/_FINAL à la racine.
  PLAN_PARITE_REPLIT_LIVRAISON.md (copie de LECTURE gitignorée demandée par
  l'owner) rafraîchie = miroir exact de la tête, non normative.
- (P0-EX-02/§23) IMPLEMENTATION_STATUS.yaml GÉNÉRÉ (159 items SURFACE) :
  11 PROVEN (evidenceIds sur disque) · 68 CODED (code sur origin/main
  f69a4b31) · 43 PARTIAL · 37 NOT_STARTED · 0 INTEGRATED/BLOCKED. builtState
  RETIRÉ de SURFACE_REGISTRY (état unique, jamais dupliqué). Validateur :
  159 exigés, CODED⇒mergedToMain, PROVEN⇒evidence sur disque.
- (registres §2.2/2.3) créés : PRICE_OBSERVATION_REGISTRY (9 observations,
  divergences $20/$25 et $90/$95 conservées ; OFFERING nettoyé de tout
  montant — P0-EX-06) ; LEGACY_SOURCE_COVERAGE (32 sources confrontées,
  absorbedFindings=UNKNOWN par fichier — limite P0-A2-12 déclarée) ;
  IDENTITY_COLLABORATION_CONTRACT.md (P0-EX-07) ; PROJECT_MANIFEST_SCHEMA.json
  (P0-EX-08) ; DEPLOYMENT_TYPES_CONTRACT §4.1-4.4 par type (P0-EX-09).
- (P0) +10 P0-EX (7 PROVEN par cette installation, 3 OPEN : EX-04 contrat
  import à aligner, EX-10 activation au merge, + P0-LS-06/18 et P0-B-02
  toujours OPEN). EXPECTED_P0_IDS 55→65.

## 2026-07-20 (feux verts Avi — décisions inscrites + lot sans-Avi)

- (GALLERY OPTION B — TEXTE EXACT RETROUVÉ) La décision complète vivait dans
  le commit LOCAL d232a187 (17/07, jamais poussé — victime du split-brain
  D1) : « garder notre noyau prouvé + greffer la substance de l'autre
  session », avec rationale MESURÉ en 3 points (conversion des 6 démos non
  faite, vue liste cassée, rien de prouvé live côté passation vs noyau
  GalleryListing prouvé). Cité verbatim dans DEC-OWNER-GALLERY-OPTION-B →
  DECIDED ; exécution phase 1 déjà commitée (c35b686e, greffe TemplateGallery
  UI). UNK-GALLERY-OPTION-B-CONTENT RÉSOLU et retiré (44 inconnues).
- (RÈGLE 30 JOURS — ADOPTÉE) DEC-ECODE-FREE-APP-EXPIRY-30D (ECODE_DECISION,
  Avi 20/07) : 1 app gratuite publiée, expirée à 30 jours COMME REPLIT, avec
  la mécanique §16.12 obligatoire (tombstone → fenêtre de récupération →
  purge → preuve d'effacement, notification avant expiration, upgrade
  restaure sans perte). Implémentation tracée UNK-FREE-EXPIRY-IMPL.
- (P0-LS-06 PROVEN) Les 15 OBS-DELTA classifiées TRIAGED avec
  linkedRegistryIds (capacités ×4, connecteurs ×4, écosystème ×4 dont
  nouvelle entrée ECO-COMMUNITY-PROFILES, offres, intentions, imports).
  La déduplication de l'univers (canonicalSurfaceCount) reste ouverte.
- (P0-EX-04) IMPORT_REMIX_CONTRACT aligné sur la machine §9.2 (branchement
  clean→READY_TO_COMMIT, quarantaine réservée aux findings bloquants,
  3 tests négatifs exigés). NUANCE : le code suit encore l'ancienne machine
  — un contrat n'est pas une implémentation, work item ouvert.

## 2026-07-20 (décision facturation tranchée par Avi)

- (ECODE_DECISION) DEC-BILLING-LEGACY-VS-LEDGER → DECIDED : le NOUVEAU
  ledger double entrée est LA facturation E-Code ; l'ancien système de
  crédits (CreditWallet/checkpoints/packs/PAYG SHADOW) est ABANDONNÉ.
  AUCUNE migration de soldes — Avi confirme zéro utilisateur réel, données
  fictives → purge propre (tombstone + preuve d'effacement §16.12).
  RPD-01 (bascule wallet) → PÉRIMÉ avec preuve. UNK-BILLING-LEGACY-GOLIVE
  réécrit en suivi de purge (ID conservé pour les références du backlog).
  Reste côté owner : les 2 actions Stripe (produits/prix + clé).

## 2026-07-20 (paquet relecteur pour l'expert — décision n°6)

- REVIEWER_PACKET_EXPERT_20260720.md généré depuis les registres RÉELS :
  prompt de relecture prêt à envoyer, les 55 P0 PROVEN (ID + titre +
  evidenceId, chemins tous vérifiés présents sur disque au moment de la
  génération — aucun « preuve à fournir »), chaîne de reproduction complète
  (drift-checks + validateur + preuve négative) et les 12 preuves E2E avec
  leurs étapes réelles. Copie de partage : outputs/. La signature de
  l'expert (champ reviewer) fera passer les points en CLOSED et débloquera
  contractsValidated.

## 2026-07-20 (incident CI post-merge : dérive d'empreinte machine-dépendante — corrigé)

- (incident, 2 runs rouges sur main : 4c74d551 puis 852e4dfc) Le hasher de
  preuves incluait TOUT fichier présent sur disque : deux logs GITIGNORÉS
  traînant localement dans deploy-evidence/2026-07-15-phase-b/ sont entrés
  dans l'empreinte calculée localement mais absents du checkout CI → STALE.
  (Le commit d'activation 646e75ca passait : généré depuis un worktree
  propre.) CORRECTIF DE CLASSE : le hasher ne hashe plus que les fichiers
  SUIVIS PAR GIT (git ls-files, fallback fs sans .DS_Store) — le même commit
  produit désormais la même empreinte sur toute machine. Les 2 logs intrus
  déplacés hors du dépôt (préservés). Vues régénérées.

## 2026-07-20 (lot registres : ancrage des 21 claims + univers canonique)

- (P0-A2-15 PROVEN) Les 21 claims hérités du v5 ENFIN ancrés URL+snapshot+
  hash, chaque citation RE-VÉRIFIÉE le 20/07 : 9 nouvelles sources assainies
  (Defense in Depth blog — citation « every single customer gets their own
  GCP Project, even free-tier users » ; GKE Agent Sandbox gVisor/Kata ; Pod
  snapshots ; Image streaming ; Cloud Run ingress ; cycle de vie projet GCP
  30j ; quotas IAM ; limites Resource Manager 300/0,1 ; NixOS 26.05) +
  réutilisation des corpus déjà hashés (llms-full IDENTIQUE 16/07=20/07 sha
  a7d6f513 — RPL-01/03/04/05/09/10/16 cités ligne à ligne ; RPL-02→import
  providers ; RPL-13→Clerk ; RPL-14→llms.txt ; GCP-06→quotas Cloud Run ;
  GCP-10→AR attachments). LEGACY_CLAIM_IDS vidée ; unanchoredClaims = 0 ;
  UNK-CLAIMS-ANCHORING résolu et retiré (43 inconnues).
- (dédup passe 1 — §6.3) canonicalUniverse écrit dans SURFACE_REGISTRY (l'état
  vit au registre, règle 11 du plan) : canonicalSurfaceCount = 164 = 159
  candidats IDE + 4 surfaces hors-IDE déclarées + 1 candidate scan
  (CS-COMMUNITY-PROFILES). 6 alias résolus (SRF-IDE-FILE-HISTORY→P030,
  SKILLS→P044, PANES→P006, COMPOSER→P034, SCHEDULED→P115, RESERVED-VM→P096) ;
  1 fusion SUSPECTÉE documentée SANS être appliquée (P056→P125 — « probable »
  n'est pas une preuve, tranchée au scan authentifié). Cohérence vérifiée par
  le générateur (preuve négative : compte faussé ⇒ build cassé).
- (échelle) sourceBaselineReady PASS + registryUniverseReady PASS +
  contractsPresent PASS → highestPassedLevel = contractsPresent. Prochain
  verrou : contractsValidated (relecteurs humains — paquet expert envoyé).

## 2026-07-20 (suite — verdict du relecteur, lot 57febeab)

- (verdict OpenAI-Codex) 22 P0 SIGNÉS → CLOSED (reviewer + reviewCommit
  57febeab) ; 33 P0 REFUSÉS → rouverts OPEN avec reviewVerdict: REFUSED,
  refusalType (DESACCORD / PREUVE_INSUFFISANTE / NON_REPRODUCTIBLE /
  A_PRECISER) et la raison du refus comme critère de clôture. 11 raisons
  verbatim transmises (WIF 3 chemins, générateur IMPLEMENTATION_STATUS
  absent, code Import ≠ contrat, CI --check sans génération, ledger
  double-entrée manquant, prix sans contexte, claim « no model selector »
  trop fort, Gallery DECIDED, hashes Gallery obsolètes ×3) ; 22 refus SANS
  raison détaillée transmise → refusalType A_PRECISER, à compléter verbatim
  dès réception du rapport. 0/14 contrats signés → chacun annoté
  reviewVerdict REFUSED + critère de clôture. Les 4 PROVEN hors lot
  (A2-15, A2-16, V3-15, V4-4) inchangés. Compte : 22 CLOSED / 39 OPEN /
  4 PROVEN.
