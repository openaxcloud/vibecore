# REVIEWER_PACKET_CONSOLIDATED_20260721 — dossier UNIQUE pour le relecteur (OpenAI-Codex)

Commit de référence : `653be79c` (main — état FINAL après merges #29 et #30).
Reçus de revue : `docs/parity/REVIEW_RECEIPT_REGISTRY.yaml` (RR-…-01 INCOMPLET,
RR-…-02 COMPLET). Règle maîtresse : un point/contrat ne passe CLOSED/SIGNED que
via un reçu COMPLET (réponse brute fournie et hashée) — c'est machine-enforcé.

## SOMMAIRE — ce qu'on te demande

| Lot | Combien | Demande |
|---|---|---|
| A. Points re-corrigés après TON second refus (lot B) | **6** | rejouer les repros, signer ou re-refuser avec réserve précise |
| B. Points acceptés au reçu -01 INCOMPLET | **22** | re-confirmer sous un reçu COMPLET (ou fournir la réponse brute du lot -01 pour compléter le reçu d'origine) |
| C. Contrats durcis v2 | **11/14** | relire la structure (préconditions/invariants/tests négatifs/compatibilité), signer ou refuser par contrat |
| D. Contrats NON soumis (bloqués sur chantier) | **3/14** | information seulement — ils ne sont PAS soumis |

Validation à rejouer d'abord :
```
node scripts/parity/validate-registries.mjs        # all registries valid
node scripts/parity/check-plan-completeness.mjs    # 336 CERTIFIÉ
```

---

## A. LES 6 POINTS RE-CORRIGÉS (après ton reçu RR-20260720-CODEX-02)

### P0-V4-1 — Collecteur aveugle : ajouter routes produit (rendu JS) + canal de lancement
- **Ton refus v2** : « Le chemin canonique evidenceId reste …collector-gallery/ : son README annonce encore fad9ec75…, Views 20,650, 82 Results ; sa seule capture ne montre que le footer ; l'entrée P0 n'a pas été repointée. »
- **Correction** : le README porte une section CORRECTION 2026-07-21 : le hash a changé PAR L'ASSAINISSEMENT (caviardage CMS, fad9→1f5f, mêmes 1 499 556 octets) ; artefacts canoniques repointés (HTML complets, hashes rejoués) ; capture footer déclarée supplantée ; métriques réelles inscrites.
- **Repro** : `grep -n 'CORRECTION 2026-07-21' docs/deploy-evidence/2026-07-16-collector-gallery/README.md` ; `shasum -a 256 docs/parity/baseline/snapshots/2026-07-16/gallery.rendered.html` → 1f5f27bc…
- **evidenceId** : docs/deploy-evidence/2026-07-16-collector-gallery/
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### P0-V4-2 — Gallery : requalifier la table (mesures réelles, archive rendue)
- **Ton refus v2** : « Le README canonique conserve 20,650 et 82 Results ; le contrat conserve aussi 82 Results et cite SRC-GALLERY-DETAIL, ID absent du registre. »
- **Correction** : README corrigé (cf. V4-1) ; contrat : « 82 Results » requalifié (absent du rendu conservé, non revendiqué) ; ID corrigé → `SRC-GALLERY-DETAIL-JOURNEY-MAPPER`.
- **Repro** : `grep -c '82 Results' docs/parity/GALLERY_COMMUNITY_CONTRACT.md` → seule l'occurrence « n'apparaît plus » ; `grep -n 'SRC-GALLERY-DETAIL-JOURNEY-MAPPER' docs/parity/GALLERY_COMMUNITY_CONTRACT.md`
- **evidenceId** : docs/deploy-evidence/2026-07-16-collector-gallery/
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### P0-V3-02 — Table Gallery factuellement dépassée
- **Ton refus v2** : « le report propre à une app n'est pas prouvé : l'artefact montre seulement le lien générique de footer Report abuse. »
- **Correction** : la ligne du contrat est REQUALIFIÉE : lien générique footer, report par app NON prouvé — plus aucune revendication au-delà de l'artefact.
- **Repro** : `grep -n 'Report abuse' docs/parity/GALLERY_COMMUNITY_CONTRACT.md`
- **evidenceId** : docs/deploy-evidence/2026-07-16-collector-gallery/
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### P0-LS-14 — Limiter « no model selector » au corpus observé
- **Ton refus v2** : « le claim affirme encore que Lite/Economy ne sont jamais nommés dans 83 changelogs — contredit par RPL-2026-002 et le snapshot 2026-04-17 ; et la commande annoncée comme vide retourne …:325 (“nulle part”). »
- **Correction** : l'affirmation fausse est RETIRÉE ; RPL-2026-004 distingue désormais sélecteur de MODÈLE BRUT (non observé, borné) vs sélecteur de MODE Lite/Economy/Power (EXISTE, documenté par RPL-2026-002) ; la ligne 325 du scan reformulée (« ne couvre pas encore »).
- **Repro** : `grep -rn 'nulle part' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml docs/parity/REPLIT_LIVE_SCAN_2026-07-20.md` → vide ; `grep -n 'MODÈLE BRUT' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml`
- **evidenceId** : docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### P0-LS-13 — Contextualiser les prix et mesurer les divergences
- **Ton refus v2** : « 3 observations expert gardent locale/géo/cookies UNKNOWN sans hash ni artifactPath ; 4/13 seulement ont une géo connue ; recheck manuel sans capture ni preuve géo-IP ; le test négatif ne valide pas la complétude par observation. »
- **Correction** : plus de sur-revendication — TAXONOMIE explicite par observation : COMPLÈTE / `nonReplayable` justifié (3 lignes texte-relecteur, conservées pour l'historique) / `contextIncomplete` déclaré avec raison (scan 05:43, supplanté) ; **garde validateur PAR OBSERVATION** (incomplète sans justification → build rouge) ; preuve géo-IP commitée (`livescan-2026-07-20/geoip-proof-20260721.json`, sortie ipinfo complète, hash b325e31e…).
- **Repro** : `node scripts/parity/validate-registries.mjs` (garde LS-13 listée) ; retirer une raison → build rouge ; `shasum -a 256 docs/parity/livescan-2026-07-20/geoip-proof-20260721.json`
- **evidenceId** : docs/parity/OFFERING_ENTITLEMENT_REGISTRY.yaml
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### P0-LS-16 — Corriger generatedAt et recalculer après merge
- **Ton refus v2** : « le workflow ne roule pas CI_ATTESTATION et ne génère/publie pas après chaque merge ; le commit est manuel ; le validateur accepte des valeurs fictives. »
- **Correction** : job **`roll-attestation`** dans parity-registries.yml — à CHAQUE push sur main : écrit SON PROPRE run id/commit/timestamp (variables GitHub réelles), régénère TOUTES les vues (approval/parity/implementation/counter/manifest), valide, commit bot. Plus aucun commit manuel requis. **Anti-fictif** : le validateur exige que runCommit/mergedCommit EXISTENT dans l'historique git (`git cat-file -e`).
- **Repro** : lire le job dans `.github/workflows/parity-registries.yml` ; falsifier mergedCommit avec un sha inexistant → validateur rouge ; la PREUVE VIVANTE sera le premier commit bot après merge de cette PR.
- **evidenceId** : docs/parity/DOCUMENT_MANIFEST.yaml
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex


---

## B. LES 22 POINTS ACCEPTÉS AU REÇU -01 (INCOMPLET)

Tu les as ACCEPTÉS au lot 57febeab, mais ce reçu est INCOMPLET (réponse brute
non fournie → responseHash UNKNOWN) : la règle maîtresse les maintient en
PROVEN_REVIEW_PENDING. Deux façons de les clore : (a) re-confirmer les 22 ici
sous un reçu COMPLET ; (b) fournir le texte brut de ta réponse d'origine.
Chaque point garde sa preuve d'origine (champ proof + evidenceId du registre) :

- **P0-A2-02** — Univers des surfaces incomplet (10 vs 159) · evidenceId: `docs/parity/SURFACE_REGISTRY.yaml` · preuve : Univers importé : 159 surfaces P001–P159 + 56 services S01–S56 (source Plan_IDE docx sha256 0b232212…) en ensemble EXACT verrouillé CI (EXPECTED_SURFACE_UNIVERSE_IDS). Évaluation par surface = PENDING (honnête) : parityB…
- **P0-A2-04** — Types de déploiement non contractualisés · evidenceId: `docs/parity/DEPLOYMENT_TYPES_CONTRACT.md` · preuve : DEPLOYMENT_TYPES_CONTRACT.md créé : Autoscale/Static/Reserved VM/Scheduled — lifecycle, config, port, secrets, coûts, observabilité, changement de type sans recréer, preuve exigée par type.…
- **P0-A2-06** — verticalReady = faux positif UI · evidenceId: `docs/parity/APPROVAL_STATUS.json` · preuve : Scindé : verticalBackendReady (7/7 backend) + verticalUserJourneyReady (ÉCHOUE tant que uiGaps non vide — publish, rollback aujourd'hui).…
- **P0-A2-08** — Erreur Auth (migration + MFA/orgs) · evidenceId: `docs/parity/baseline/sources/2026-07-20-replit-clerk-auth.md` · preuve : §3.9 REMPLACÉ, ancré RPL-25/RPL-26 (snapshots hashés) : deux produits confirmés ; migration custom-auth→Clerk documentée ; guide Replit Auth→Clerk « coming soon » = INCONNU ; MFA/SMS/orgs « What's not supported » ⇒ exten…
- **P0-A2-11** — Compteurs contradictoires · evidenceId: `docs/parity/APPROVAL_STATUS.json` · preuve : Source unique = registres : boltDebt=29 (BOLT_DEBT_REGISTRY), prodReadiness=50 (PRODUCTION_READINESS_REGISTRY), sourceFindingCount=336, canonicalWorkItemCount=99 (calculé). Les « 26 » et « 48 » manuels du §13 sont suppri…
- **P0-EX-01** — Retirer le statut d audit et l overlay incomplet du plan normatif · evidenceId: `docs/parity/PLAN_PARITE_REPLIT.md` · preuve : Plan v2026-07-20.4 installé : stateEmbeddedInPlan=false, annexe manuelle SUPPRIMÉE — l état vit dans IMPLEMENTATION_STATUS.yaml.…
- **P0-EX-03** — Reclasser la persistance du layout en UNKNOWN Replit + exigence E-Code · evidenceId: `docs/parity/PLAN_PARITE_REPLIT.md` · preuve : Adopté via le plan §6.1 (verbatim installé) ; aucune assertion de persistance non sourcée.…
- **P0-EX-06** — Retirer les montants tarifaires du plan durable · evidenceId: `docs/parity/PRICE_OBSERVATION_REGISTRY.yaml` · preuve : Plan sans montants ; PRICE_OBSERVATION_REGISTRY.yaml créé (9 observations contextualisées, divergences $20/$25 et $90/$95 conservées) ; OFFERING nettoyé.…
- **P0-EX-09** — Contractualiser séparément Autoscale, Static, Reserved et Scheduled · evidenceId: `docs/parity/DEPLOYMENT_TYPES_CONTRACT.md` · preuve : DEPLOYMENT_TYPES_CONTRACT §4.1–4.4 : contrat dédié par type avec lifecycle/config/coûts/preuve ; Reserved = NOT_STARTED déclaré.…
- **P0-LS-01** — Corriger « nouveau compte » en visiteur anonyme · evidenceId: `docs/parity/ROUTE_OBSERVATION_REGISTRY.yaml` · preuve : Adopté verbatim §3.3 (« le sujet observé est un visiteur anonyme ») ; ROUTE_OBSERVATION authenticated:false.…
- **P0-LS-02** — Corriger 21 tentatives / 20 routes / 19 HTTP 200 / 16 hashes distincts · evidenceId: `docs/parity/ROUTE_OBSERVATION_REGISTRY.yaml` · preuve : Chiffres verbatim §3.3 adoptés + ROUTE_OBSERVATION_REGISTRY (20 routes, signup ×2).…
- **P0-LS-05** — Corriger la taxonomie Artifact/Asset/Component/Deployment · evidenceId: `docs/parity/ARTIFACT_KIND_REGISTRY.yaml` · preuve : §5.2 verbatim adopté ; ARTIFACT_KIND ×7 verrouillé validateur ; GENERATED_ASSET ×8 et COMPONENT ×7 alignés sur l expert.…
- **P0-LS-07** — Supprimer l addition automatique 159+15=174 · evidenceId: `docs/parity/SURFACE_REGISTRY.yaml` · preuve : P160–P174 et WI-LS-* démontés ; EXPECTED univers = 159 candidats historiques ; §6.3 canonicalSurfaceCount:null adopté.…
- **P0-LS-08** — Reclasser Spotlight, Resources, Preview DevTools, Library, Android Emulator, Grouped Publish · evidenceId: `docs/parity/baseline/snapshots/2026-07-20/llms-full.txt` · preuve : Les 6 vérifiés DOC_CURRENT dans le corpus hashé du 20/07 : Spotlight l.5911, Resources panel l.5959, Devtools l.6116, Library l.7580, Android Emulator l.2833, Grouped Publish l.7605/7634. UNK-LS correspondants retirés.…
- **P0-LS-09** — Corriger MCP ≠ preuve de remplacement d API · evidenceId: `docs/parity/CAPABILITY_REGISTRY.yaml` · preuve : §10.4 verbatim (PublicApiStatus UNKNOWN, McpServerStatus DOC_CURRENT_BETA) + claim RPL-30 amendé + CAP-MCP-SERVER.…
- **P0-LS-10** — Limiter l inférence sur /@user · evidenceId: `docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml` · preuve : §8.3 verbatim + claim RPL-29 amendé (une route testée ne prouve pas la disparition de toutes).…
- **P0-LS-11** — Reclasser /bounties comme redirect Expert Network (Contra) · evidenceId: `docs/parity/EXTERNAL_ECOSYSTEM_REGISTRY.yaml` · preuve : §8.4 verbatim adopté ; ECO-EXPERTS : provider Contra, behavior EXTERNAL_REDIRECT, legacyDataOrBackendState UNKNOWN.…
- **P0-LS-12** — Distinguer plan Teams retiré et capacités d équipe · evidenceId: `docs/parity/OFFERING_ENTITLEMENT_REGISTRY.yaml` · preuve : §11.1 verbatim + OFF-TEAMS-RETIRED + CAP-TEAM-COLLAB + claims amendés.…
- **P0-LS-15** — Retirer le lien non prouvé Parallel Agents = microVM par tâche · evidenceId: `docs/parity/CAPABILITY_REGISTRY.yaml` · preuve : §7.2 verbatim ; CAP-PARALLEL-AGENTS corrigé : isolation runtime par tâche = UNKNOWN.…
- **P0-LS-17** — Réconcilier les compteurs (174/159, 114/99, surfaces 10) · evidenceId: `docs/parity/APPROVAL_STATUS.json` · preuve : Source unique = JSON généré : univers 159 candidats, 99 work items, 10 surfaces déclarées, deltas=observations.…
- **P0-LS-18** — Recalculer APPROVAL_STATUS sur le commit mergé · evidenceId: `docs/parity/CI_ATTESTATION.yaml` · preuve : FAIT : PR #15 mergée (d3925b16) ; run CI Parity registries 29733640863 VERT au commit mergé ; APPROVAL_STATUS/PARITY_STATUS/DOCUMENT_MANIFEST régénérés à ce commit ; attestation datée dans CI_ATTESTATION.yaml.…
- **P0-V3-14** — Paquet documentaire et calcul d'approbation absents · evidenceId: `docs/parity/APPROVAL_STATUS.json` · preuve : Registres + schémas + validateur (exit 0/1 prouvé, test négatif 3 violations) + CI parity-registries verte + APPROVAL_STATUS généré avec drift-check (édition manuelle = build cassé).…


---

## C. LES 11 CONTRATS DURCIS v2 (à signer ou refuser PAR CONTRAT)

Chaque fichier porte : contractId, contractVersion 2, préconditions, invariants
nommés, tests négatifs, compatibilité, résultat de signature. Le registre
machine : `docs/parity/CONTRACT_REGISTRY.yaml` (garde CI : durci ⇒ le fichier
porte l'ID + v2 ; SIGNED ⇒ reçu COMPLET).

### CTR-BILLING-LEDGER (v2) — `docs/parity/BILLING_LEDGER_CONTRACT.md`
- **Ton refus v1** : « shadow wallet pas ledger double-entrée »
- **Durcissement/ancrage** : PR #28 NON MERGÉE (mig 0078, triggers immutabilité, 39 tests dont 7 Postgres réels, I-LED-1..5)
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-IMPORT-REMIX (v2) — `docs/parity/IMPORT_REMIX_CONTRACT.md`
- **Ton refus v1** : « 2 machines contradictoires ; le code + 15 tests prouvent encore l'ancienne »
- **Durcissement/ancrage** : PR #27 NON MERGÉE (UNE machine 14 états, e2e machine dédié, billing de sûreté idempotent) ; remix mergé prod
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-GALLERY-COMMUNITY (v2) — `docs/parity/GALLERY_COMMUNITY_CONTRACT.md`
- **Ton refus v1** : « hash obsolète + décision ouverte »
- **Durcissement/ancrage** : les 2 motifs levés ET signés (P0-LS-04/P0-A2-10 CLOSED, reçu RR-20260720-CODEX-02) ; fail-closed en prod (7e001f3d)
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-DEPLOYMENT-TYPES (v2) — `docs/parity/DEPLOYMENT_TYPES_CONTRACT.md`
- **Ton refus v1** : « preuve Static absente / Reserved non commencé / Scheduled hors E2E »
- **Durcissement/ancrage** : Autoscale+Scheduled prouvés live ; Static/Reserved déclarés honnêtement (E2E à produire / non commencé) · dépendances ouvertes DÉCLARÉES : Static : preuve E2E dédiée ; Reserved VM : chantier ACT-31
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-RELEASE-PUBLISH (v2) — `docs/parity/RELEASE_PUBLISH_CONTRACT.md`
- **Ton refus v1** : « pas de ReleaseCatalog/Manifest persistant ni UI live »
- **Durcissement/ancrage** : pipeline publish + rollback digest prouvés live ; machine PROMOTION_* · dépendances ouvertes DÉCLARÉES : ReleaseCatalog persistant + UI live (chantier)
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-PROJECT-MANIFEST-SCHEMA (v2) — `docs/parity/PROJECT_MANIFEST_SCHEMA.json`
- **Ton refus v1** : « accepte contre-exemples + PENDING_COMMIT »
- **Durcissement/ancrage** : schéma v3 durci : additionalProperties false, allOf EXÉCUTABLE (≤1 MOBILE_APP), minLength/minItems, PENDING_COMMIT purgé (x-repoCommit était littéralement cette chaîne)
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-DOMAIN-MODEL (v2) — `docs/parity/DOMAIN_MODEL.md`
- **Ton refus v1** : « modèle Import ancien + CloudTenant incomplet + Checkpoint/Release faibles »
- **Durcissement/ancrage** : §2 Import aligné sur LA machine (PR #27) ; remix/licence en prod · dépendances ouvertes DÉCLARÉES : CloudTenant complet (CT-10/11) ; Checkpoint câblage réel
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-RUNTIME-NIX (v2) — `docs/parity/RUNTIME_NIX_CONTRACT.md`
- **Ton refus v1** : « format lock incompatible + rotation inconnue »
- **Durcissement/ancrage** : store RO gVisor prouvé (preuve négative), gen v2, réveil 14,5s · dépendances ouvertes DÉCLARÉES : format ecode.lock + rotation des générations (chantier)
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-IAM-POLICY-BASELINE (v2) — `docs/parity/IAM_POLICY_BASELINE.md`
- **Ton refus v1** : « inventaire non exhaustif sans tests négatifs »
- **Durcissement/ancrage** : 2 tests négatifs réels prouvés (revoke→deny 215s ; exec CI interdit) · dépendances ouvertes DÉCLARÉES : inventaire exhaustif + négatif PAR identité + WIF 3 chemins (chantier D)
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-CHECKPOINT (v2) — `docs/parity/CHECKPOINT_CONTRACT.md`
- **Ton refus v1** : « tests unitaires mais aucun câblage réel »
- **Durcissement/ancrage** : CÂBLÉ (PR #32, NON MERGÉE) : endpoints réels + barrière 423/dégel garanti + restore vérifié en projet jetable — 18 tests · dépendances ouvertes DÉCLARÉES : snapshot DB physique CNPG dormant (DB_ROLLBACK_ENABLED) + preuve PITR live (PR-DR)
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex

### CTR-SECURITY-PRIVACY (v2) — `docs/parity/SECURITY_PRIVACY_COMPLIANCE.md`
- **Ton refus v1** : « threat model/rétention incomplets »
- **Durcissement/ancrage** : acquis prouvés ancrés : masquage PII prod, fail-closed licence, gitleaks bloquant, gVisor/NetworkPolicy · dépendances ouvertes DÉCLARÉES : threat model formel + rétention/effacement (chantier)
- **Statut** : PROVEN_REVIEW_PENDING · **Reviewer attendu** : OpenAI-Codex


---

## D. LES 3 CONTRATS NON SOUMIS (bloqués sur chantier — information)

- **CTR-IDENTITY-COLLABORATION** (`IDENTITY_COLLABORATION_CONTRACT.md`) — refus v1 : « Group/Guest/AccessGrant non implémentés » · **bloqué par** : implémentation Group/Guest/AccessGrant (P0-EX-07 : P124 réel = PARTIAL, sans entité Guest) — sera re-soumis quand le chantier aura une preuve réelle.
- **CTR-PROJECT-FACTORY** (`PROJECT_FACTORY_CONTRACT.md`) — refus v1 : « couvre pod/PVC pas la factory tenant GCP » · **bloqué par** : chantier CloudTenant/Factory GCP (CT-10/CT-11 restants ; preuves LIVE partielles zone/cloud-tenant-factory-iam) — sera re-soumis quand le chantier aura une preuve réelle.
- **CTR-OPERATIONS-DR** (`OPERATIONS_DR.md`) — refus v1 : « SLO/astreinte/chaos/RTO-RPO non prouvés » · **bloqué par** : exercices réels DR/restauration (PR-DR-01/02/03, WI-0051) — un plan non testé n'est pas un plan — sera re-soumis quand le chantier aura une preuve réelle.


---

## CE QUE TU RENDS

- par point du lot A : SIGNÉ / RE-REFUSÉ + réserve précise ;
- lot B : confirmation (ou la réponse brute d'origine) ;
- par contrat du lot C : SIGNÉ / REFUSÉ + réserve ;
- le tout en réponse BRUTE réutilisable (elle sera hashée dans un nouveau
  ReviewReceipt — c'est la condition de tout CLOSED).

INTERDITS : signer sans rejouer ; signer en bloc ; ignorer une dépendance
ouverte déclarée (elles sont là pour être jugées TELLES QUELLES).
