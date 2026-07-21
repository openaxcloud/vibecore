# DOSSIER_EXPERT_CONSOLIDE_20260721 — dossier UNIQUE pour le relecteur (OpenAI-Codex)

État RÉEL du dépôt : les PR #27/#28/#29/#30 SONT mergées sur main (décision
owner, option 2) — leur statut reste PROVEN_REVIEW_PENDING : RIEN n'est
CLOSED/SIGNED sans ton reçu COMPLET (garde machine). Reçus :
REVIEW_RECEIPT_REGISTRY.yaml (RR-…-01 INCOMPLET, RR-…-02 COMPLET, RR-…-03
COMPLET = ta revue B).

## SOMMAIRE — ce qu'on te demande

| Lot | Combien | Demande |
|---|---|---|
| 0. P0-LS-14 | 1 | RIEN — signé par toi (reçu -03), CLOSED. Information. |
| A. Les 5 refusés de ta revue B, CORRIGÉS v3 | 5 | rejouer, signer ou refuser avec réserve |
| B. Points acceptés au reçu -01 INCOMPLET | 22 | re-confirmer sous reçu complet (ou fournir ta réponse brute d'origine) |
| C. Contrats durcis v2 | 11/14 | première revue : signer/refuser PAR contrat |
| D. Facturation mergée (#27 import, #28 ledger) | 2 | première revue du CODE + preuves |
| E. Contrats bloqués sur chantier | 3/14 | information seulement |

Avant tout : `node scripts/parity/validate-registries.mjs` → all registries valid ;
`node scripts/parity/check-plan-completeness.mjs` → 336 CERTIFIÉ.

---

## A. LES 5 CORRIGÉS v3 (réponses à TES réserves de la revue B)

### P0-V4-1 — Collecteur aveugle : ajouter routes produit (rendu JS) + canal de lancement
- **Ta réserve (revue B, verbatim)** : « evidenceId pointe toujours le dossier historique 2026-07-16-collector-gallery avec ancien hash fad9…, Views 20,650, 82 Results, capture footer-only — le paquet n'est ni régénéré ni repointé »
- **Correction v3** : CORRIGÉ v3 (21/07) : PAQUET RÉGÉNÉRÉ par capture fraîche live (DOM sha256 a5f6e4f9… calculé en page, innerText complet archivé) — evidenceId REPOINTÉ vers ce paquet ; l'ancien dossier reste en historique avec sa section CORRECTION. PRÊT À RE-SOUMETTRE.
- **evidenceId** : `docs/deploy-evidence/2026-07-21-gallery-pricing-v3/`
- **Statut** : PROVEN_REVIEW_PENDING · reviewer attendu : OpenAI-Codex

### P0-V4-2 — Gallery : requalifier la table (mesures réelles, archive rendue)
- **Ta réserve (revue B, verbatim)** : « gallery.rendered.html contient TOUJOURS « 82 Results » (DOM « 82 Result s ») et Views 20,653 — la correction est contredite par l'artefact ; anciennes valeurs encore dans le README »
- **Correction v3** : CORRIGÉ v3 (21/07) : la v2 était FAUSSE — « 82 Results » EXISTE (compteur réel, éclaté en nœuds DOM, vérifié live) et Views est un compteur VIVANT (20,650→20,653→20,768) : le claim v3 RÉTABLIT le compteur et date chaque valeur PAR CAPTURE. La preuve primaire est désormais cohérente avec le claim. PRÊT À RE-SOUMETTRE.
- **evidenceId** : `docs/deploy-evidence/2026-07-21-gallery-pricing-v3/`
- **Statut** : PROVEN_REVIEW_PENDING · reviewer attendu : OpenAI-Codex

### P0-V3-02 — Table Gallery factuellement dépassée
- **Ta réserve (revue B, verbatim)** : « la condition exige une preuve de report au niveau app ; l'archive ne montre que le footer générique — requalifier ≠ prouver »
- **Correction v3** : CORRIGÉ v3 (21/07) : vérification LIVE par scan des <a> de la page — le report AU NIVEAU APP est ABSENT du rendu public (seul « Report abuse » footer → docs.replit.com/legal-and-security-info/abuse-report). Condition de clôture requalifiée de façon RÉALISTE : documenter l'affordance générique + UNK-GALLERY-REPORT-FLOW pour le niveau app (nécessite compte/UI interne) — à faire VALIDER par le relecteur. PRÊT À RE-SOUMETTRE.
- **evidenceId** : `docs/deploy-evidence/2026-07-21-gallery-pricing-v3/`
- **Statut** : PROVEN_REVIEW_PENDING · reviewer attendu : OpenAI-Codex

### P0-LS-13 — Contextualiser les prix et mesurer les divergences
- **Ta réserve (revue B, verbatim)** : « 4/13 obs complètes seulement ; recheck 14:45 = texte à heure approximative, pas une capture liant prix+locale+cookies+géo ; la garde ne recalcule pas le SHA-256 des artefacts »
- **Correction v3** : CORRIGÉ v3 (21/07) : UNE observation LIÉE — prix ($25/$20, $100/$95) + locale fr-FR + cookies NOMMÉS (gating_id=cohorte, _dd_s) + géo-IP (IL/Netanya) + horodatage précis + hash DOM, dans le MÊME instant (metadata.json, artifactSha256) ; la garde RECALCULE désormais le SHA-256 de chaque artefact vs registre (preuve négative rejouée : artefact modifié → build rouge). PRÊT À RE-SOUMETTRE.
- **evidenceId** : `docs/deploy-evidence/2026-07-21-gallery-pricing-v3/metadata.json`
- **Statut** : PROVEN_REVIEW_PENDING · reviewer attendu : OpenAI-Codex

### P0-LS-16 — Corriger generatedAt et recalculer après merge
- **Ta réserve (revue B, verbatim)** : « job roll-attestation skippé sur la PR, aucun commit bot post-merge (au moment de la revue) ; le filtre push.paths exclut les push code-only ; le contrôle anti-fictif ne lie pas runId/URL/date/conclusion à une vraie exécution GitHub Actions »
- **Correction v3** : CORRIGÉ v3 (21/07) : filtre push.paths RETIRÉ (le job part à CHAQUE push main, y compris code-only) ; NOUVEAU verify-attestation-run.mjs en CI : authentifie runId/head_sha/conclusion/url/date contre l'API GitHub Actions (skip local dit explicitement) ; exécutions VIVANTES déjà produites : commits bot 6d9ca8b5, a1926a72, 075eaa99 (attestation auto post-merge, dont un merge CODE 790eef17). PRÊT À RE-SOUMETTRE.
- **evidenceId** : `docs/parity/CI_ATTESTATION.yaml`
- **Statut** : PROVEN_REVIEW_PENDING · reviewer attendu : OpenAI-Codex


Repro clés du lot A :
```
shasum -a 256 docs/deploy-evidence/2026-07-21-gallery-pricing-v3/*   # paquet v3
grep -n '82 Results' docs/deploy-evidence/2026-07-21-gallery-pricing-v3/gallery-capture.txt
node scripts/parity/validate-registries.mjs   # garde LS-13 sha-RECALCULÉ listée
git log --author=parity-attestation-bot --oneline   # 6d9ca8b5, a1926a72, 075eaa99
cat scripts/parity/verify-attestation-run.mjs   # authentification API GitHub (tourne en CI)
```

---

## B. LES POINTS ACCEPTÉS AU REÇU -01 (INCOMPLET) — à re-confirmer

- **P0-A2-02** — Univers des surfaces incomplet (10 vs 159) · evidenceId `docs/parity/SURFACE_REGISTRY.yaml` · Univers importé : 159 surfaces P001–P159 + 56 services S01–S56 (source Plan_IDE docx sha256 0b232212…) en ensemble EXACT verrouillé CI (EXPECTED_SURFACE_UNIVERSE_IDS). Évaluation p…
- **P0-A2-04** — Types de déploiement non contractualisés · evidenceId `docs/parity/DEPLOYMENT_TYPES_CONTRACT.md` · DEPLOYMENT_TYPES_CONTRACT.md créé : Autoscale/Static/Reserved VM/Scheduled — lifecycle, config, port, secrets, coûts, observabilité, changement de type sans recréer, preuve exigée …
- **P0-A2-06** — verticalReady = faux positif UI · evidenceId `docs/parity/APPROVAL_STATUS.json` · Scindé : verticalBackendReady (7/7 backend) + verticalUserJourneyReady (ÉCHOUE tant que uiGaps non vide — publish, rollback aujourd'hui).…
- **P0-A2-08** — Erreur Auth (migration + MFA/orgs) · evidenceId `docs/parity/baseline/sources/2026-07-20-replit-clerk-auth.md` · §3.9 REMPLACÉ, ancré RPL-25/RPL-26 (snapshots hashés) : deux produits confirmés ; migration custom-auth→Clerk documentée ; guide Replit Auth→Clerk « coming soon » = INCONNU ; MFA/S…
- **P0-A2-11** — Compteurs contradictoires · evidenceId `docs/parity/APPROVAL_STATUS.json` · Source unique = registres : boltDebt=29 (BOLT_DEBT_REGISTRY), prodReadiness=50 (PRODUCTION_READINESS_REGISTRY), sourceFindingCount=336, canonicalWorkItemCount=99 (calculé). Les « 2…
- **P0-EX-01** — Retirer le statut d audit et l overlay incomplet du plan normatif · evidenceId `docs/parity/PLAN_PARITE_REPLIT.md` · Plan v2026-07-20.4 installé : stateEmbeddedInPlan=false, annexe manuelle SUPPRIMÉE — l état vit dans IMPLEMENTATION_STATUS.yaml.…
- **P0-EX-03** — Reclasser la persistance du layout en UNKNOWN Replit + exigence E-Code · evidenceId `docs/parity/PLAN_PARITE_REPLIT.md` · Adopté via le plan §6.1 (verbatim installé) ; aucune assertion de persistance non sourcée.…
- **P0-EX-06** — Retirer les montants tarifaires du plan durable · evidenceId `docs/parity/PRICE_OBSERVATION_REGISTRY.yaml` · Plan sans montants ; PRICE_OBSERVATION_REGISTRY.yaml créé (9 observations contextualisées, divergences $20/$25 et $90/$95 conservées) ; OFFERING nettoyé.…
- **P0-EX-09** — Contractualiser séparément Autoscale, Static, Reserved et Scheduled · evidenceId `docs/parity/DEPLOYMENT_TYPES_CONTRACT.md` · DEPLOYMENT_TYPES_CONTRACT §4.1–4.4 : contrat dédié par type avec lifecycle/config/coûts/preuve ; Reserved = NOT_STARTED déclaré.…
- **P0-LS-01** — Corriger « nouveau compte » en visiteur anonyme · evidenceId `docs/parity/ROUTE_OBSERVATION_REGISTRY.yaml` · Adopté verbatim §3.3 (« le sujet observé est un visiteur anonyme ») ; ROUTE_OBSERVATION authenticated:false.…
- **P0-LS-02** — Corriger 21 tentatives / 20 routes / 19 HTTP 200 / 16 hashes distincts · evidenceId `docs/parity/ROUTE_OBSERVATION_REGISTRY.yaml` · Chiffres verbatim §3.3 adoptés + ROUTE_OBSERVATION_REGISTRY (20 routes, signup ×2).…
- **P0-LS-05** — Corriger la taxonomie Artifact/Asset/Component/Deployment · evidenceId `docs/parity/ARTIFACT_KIND_REGISTRY.yaml` · §5.2 verbatim adopté ; ARTIFACT_KIND ×7 verrouillé validateur ; GENERATED_ASSET ×8 et COMPONENT ×7 alignés sur l expert.…
- **P0-LS-07** — Supprimer l addition automatique 159+15=174 · evidenceId `docs/parity/SURFACE_REGISTRY.yaml` · P160–P174 et WI-LS-* démontés ; EXPECTED univers = 159 candidats historiques ; §6.3 canonicalSurfaceCount:null adopté.…
- **P0-LS-08** — Reclasser Spotlight, Resources, Preview DevTools, Library, Android Emulator, Grouped Publish · evidenceId `docs/parity/baseline/snapshots/2026-07-20/llms-full.txt` · Les 6 vérifiés DOC_CURRENT dans le corpus hashé du 20/07 : Spotlight l.5911, Resources panel l.5959, Devtools l.6116, Library l.7580, Android Emulator l.2833, Grouped Publish l.760…
- **P0-LS-09** — Corriger MCP ≠ preuve de remplacement d API · evidenceId `docs/parity/CAPABILITY_REGISTRY.yaml` · §10.4 verbatim (PublicApiStatus UNKNOWN, McpServerStatus DOC_CURRENT_BETA) + claim RPL-30 amendé + CAP-MCP-SERVER.…
- **P0-LS-10** — Limiter l inférence sur /@user · evidenceId `docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml` · §8.3 verbatim + claim RPL-29 amendé (une route testée ne prouve pas la disparition de toutes).…
- **P0-LS-11** — Reclasser /bounties comme redirect Expert Network (Contra) · evidenceId `docs/parity/EXTERNAL_ECOSYSTEM_REGISTRY.yaml` · §8.4 verbatim adopté ; ECO-EXPERTS : provider Contra, behavior EXTERNAL_REDIRECT, legacyDataOrBackendState UNKNOWN.…
- **P0-LS-12** — Distinguer plan Teams retiré et capacités d équipe · evidenceId `docs/parity/OFFERING_ENTITLEMENT_REGISTRY.yaml` · §11.1 verbatim + OFF-TEAMS-RETIRED + CAP-TEAM-COLLAB + claims amendés.…
- **P0-LS-15** — Retirer le lien non prouvé Parallel Agents = microVM par tâche · evidenceId `docs/parity/CAPABILITY_REGISTRY.yaml` · §7.2 verbatim ; CAP-PARALLEL-AGENTS corrigé : isolation runtime par tâche = UNKNOWN.…
- **P0-LS-17** — Réconcilier les compteurs (174/159, 114/99, surfaces 10) · evidenceId `docs/parity/APPROVAL_STATUS.json` · Source unique = JSON généré : univers 159 candidats, 99 work items, 10 surfaces déclarées, deltas=observations.…
- **P0-LS-18** — Recalculer APPROVAL_STATUS sur le commit mergé · evidenceId `docs/parity/CI_ATTESTATION.yaml` · FAIT : PR #15 mergée (d3925b16) ; run CI Parity registries 29733640863 VERT au commit mergé ; APPROVAL_STATUS/PARITY_STATUS/DOCUMENT_MANIFEST régénérés à ce commit ; attestation da…
- **P0-V3-14** — Paquet documentaire et calcul d'approbation absents · evidenceId `docs/parity/APPROVAL_STATUS.json` · Registres + schémas + validateur (exit 0/1 prouvé, test négatif 3 violations) + CI parity-registries verte + APPROVAL_STATUS généré avec drift-check (édition manuelle = build cassé…


---

## C. LES CONTRATS DURCIS v2 (première revue)

### CTR-BILLING-LEDGER (v2) — `docs/parity/BILLING_LEDGER_CONTRACT.md`
- refus v1 : « shadow wallet pas ledger double-entrée » · durcissement : PR #28 NON MERGÉE (mig 0078, triggers immutabilité, 39 tests dont 7 Postgres réels, I-LED-1..5)
- statut : PROVEN_REVIEW_PENDING

### CTR-IMPORT-REMIX (v2) — `docs/parity/IMPORT_REMIX_CONTRACT.md`
- refus v1 : « 2 machines contradictoires ; le code + 15 tests prouvent encore l'ancienne » · durcissement : PR #27 NON MERGÉE (UNE machine 14 états, e2e machine dédié, billing de sûreté idempotent) ; remix mergé prod
- statut : PROVEN_REVIEW_PENDING

### CTR-GALLERY-COMMUNITY (v2) — `docs/parity/GALLERY_COMMUNITY_CONTRACT.md`
- refus v1 : « hash obsolète + décision ouverte » · durcissement : les 2 motifs levés ET signés (P0-LS-04/P0-A2-10 CLOSED, reçu RR-20260720-CODEX-02) ; fail-closed en prod (7e001f3d)
- statut : PROVEN_REVIEW_PENDING

### CTR-DEPLOYMENT-TYPES (v2) — `docs/parity/DEPLOYMENT_TYPES_CONTRACT.md`
- refus v1 : « preuve Static absente / Reserved non commencé / Scheduled hors E2E » · durcissement : Autoscale+Scheduled prouvés live ; Static/Reserved déclarés honnêtement (E2E à produire / non commencé) · dépendances ouvertes DÉCLARÉES : Static : preuve E2E dédiée ; Reserved VM : chantier ACT-31
- statut : PROVEN_REVIEW_PENDING

### CTR-RELEASE-PUBLISH (v2) — `docs/parity/RELEASE_PUBLISH_CONTRACT.md`
- refus v1 : « pas de ReleaseCatalog/Manifest persistant ni UI live » · durcissement : pipeline publish + rollback digest prouvés live ; machine PROMOTION_* · dépendances ouvertes DÉCLARÉES : ReleaseCatalog persistant + UI live (chantier)
- statut : PROVEN_REVIEW_PENDING

### CTR-PROJECT-MANIFEST-SCHEMA (v2) — `docs/parity/PROJECT_MANIFEST_SCHEMA.json`
- refus v1 : « accepte contre-exemples + PENDING_COMMIT » · durcissement : schéma v3 durci : additionalProperties false, allOf EXÉCUTABLE (≤1 MOBILE_APP), minLength/minItems, PENDING_COMMIT purgé (x-repoCommit était littéralement cette chaîne)
- statut : PROVEN_REVIEW_PENDING

### CTR-DOMAIN-MODEL (v2) — `docs/parity/DOMAIN_MODEL.md`
- refus v1 : « modèle Import ancien + CloudTenant incomplet + Checkpoint/Release faibles » · durcissement : §2 Import aligné sur LA machine (PR #27) ; remix/licence en prod · dépendances ouvertes DÉCLARÉES : CloudTenant complet (CT-10/11) ; Checkpoint câblage réel
- statut : PROVEN_REVIEW_PENDING

### CTR-RUNTIME-NIX (v2) — `docs/parity/RUNTIME_NIX_CONTRACT.md`
- refus v1 : « format lock incompatible + rotation inconnue » · durcissement : store RO gVisor prouvé (preuve négative), gen v2, réveil 14,5s · dépendances ouvertes DÉCLARÉES : format ecode.lock + rotation des générations (chantier)
- statut : PROVEN_REVIEW_PENDING

### CTR-IAM-POLICY-BASELINE (v2) — `docs/parity/IAM_POLICY_BASELINE.md`
- refus v1 : « inventaire non exhaustif sans tests négatifs » · durcissement : 2 tests négatifs réels prouvés (revoke→deny 215s ; exec CI interdit) · dépendances ouvertes DÉCLARÉES : inventaire exhaustif + négatif PAR identité + WIF 3 chemins (chantier D)
- statut : PROVEN_REVIEW_PENDING

### CTR-CHECKPOINT (v2) — `docs/parity/CHECKPOINT_CONTRACT.md`
- refus v1 : « tests unitaires mais aucun câblage réel » · durcissement : CÂBLÉ (PR #32, NON MERGÉE) : endpoints réels + barrière 423/dégel garanti + restore vérifié en projet jetable — 18 tests · dépendances ouvertes DÉCLARÉES : snapshot DB physique CNPG dormant (DB_ROLLBACK_ENABLED) + preuve PITR live (PR-DR)
- statut : PROVEN_REVIEW_PENDING

### CTR-SECURITY-PRIVACY (v2) — `docs/parity/SECURITY_PRIVACY_COMPLIANCE.md`
- refus v1 : « threat model/rétention incomplets » · durcissement : acquis prouvés ancrés : masquage PII prod, fail-closed licence, gitleaks bloquant, gVisor/NetworkPolicy · dépendances ouvertes DÉCLARÉES : threat model formel + rétention/effacement (chantier)
- statut : PROVEN_REVIEW_PENDING


---

## D. FACTURATION MERGÉE — première revue du code + preuves

### #27 — machine d'états Import + billing de sûreté (mergée c0fd65de)
- UNE machine (14 états) : RECEIVED→STAGING_ISOLATED→SCANNING→{clean→READY_TO_COMMIT | findings→QUARANTINED→AWAITING_USER_ACTION→RESCANNING→READY_TO_COMMIT}→COMMITTING→COMMITTED ; latéraux ROLLING_BACK/CLEANUP_PENDING/EXPIRED/CANCELLED/FAILED.
- Billing de sûreté : réservation IDEMPOTENTE avant travail payant (clé=importJobId), compensation à la fin, aucun débit final sans commit (import-billing.ts).
- Preuves : services/api/src/import-pipeline.spec.ts + tests/import-state-machine-e2e.spec.ts (256 lignes) + tests/import-routes.spec.ts.
- Repro : `cd services/api && npx vitest run src/import-pipeline.spec.ts src/tests/import-state-machine-e2e.spec.ts`
- Contrat : CTR-IMPORT-REMIX v2. Statut : PROVEN_REVIEW_PENDING.

### #28 — grand livre canonique double-entrée (mergée 790eef17)
- ledger-core.ts (moteur pur, bigint+devise), ledger-store.ts (durable), ledger-reservation.ts, ledger-reconciliation.ts ; invariants I-LED-1..5.
- Migration 0078 NETTOYÉE avant merge : la version prisma-migrate-diff embarquait des artefacts de drift (suppression de l'index vectoriel AgentMemory_embedding_hnsw + 2 index + 2 FK + 18 ALTER) — PURGÉE en purement additive (4 enums, 6 tables Ledger*, 10 index, 3 FK internes, 4 triggers d'immutabilité). Déploiement prod VERT + santé 200×3.
- Preuves : 39 tests dont 7 contre VRAI Postgres (triggers d'immutabilité).
- Repro : `cd services/api && npx vitest run src/ledger-core.spec.ts src/ledger-reservation.spec.ts src/ledger-reconciliation.spec.ts` (+ tests/ledger-store-db.spec.ts avec DATABASE_URL)
- Contrat : CTR-BILLING-LEDGER v2. Statut : PROVEN_REVIEW_PENDING.

---

## E. CONTRATS BLOQUÉS SUR CHANTIER (information — non soumis)

- **CTR-IDENTITY-COLLABORATION** — refus v1 : « Group/Guest/AccessGrant non implémentés » · bloqué par : implémentation Group/Guest/AccessGrant (P0-EX-07 : P124 réel = PARTIAL, sans entité Guest)
- **CTR-PROJECT-FACTORY** — refus v1 : « couvre pod/PVC pas la factory tenant GCP » · bloqué par : chantier CloudTenant/Factory GCP (CT-10/CT-11 restants ; preuves LIVE partielles zone/cloud-tenant-factory-iam)
- **CTR-OPERATIONS-DR** — refus v1 : « SLO/astreinte/chaos/RTO-RPO non prouvés » · bloqué par : exercices réels DR/restauration (PR-DR-01/02/03, WI-0051) — un plan non testé n'est pas un plan


---

## CE QUE TU RENDS
Par ID/contrat : SIGNÉ ou REFUSÉ + réserve précise, en réponse BRUTE (elle sera
hashée dans un nouveau ReviewReceipt — condition de tout CLOSED/SIGNED).
INTERDITS : signer sans rejouer ; signer en bloc.
