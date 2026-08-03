# DOSSIER_EXPERT_V7 — PRÉPARATION (lot re-soumission) — 2026-08-03

> BROUILLON de travail : matière vérifiée à la source pour le futur dossier V7.
> Règle : « prouvé en réel ou pas inclus ». Chaque point cite le motif de refus
> initial (verbatim du registre) + la preuve SUR MAIN qui y répond. RIEN n'est
> marqué CLOSED — tout attend signature expert. Base auditée : main `4427ae46`
> (Production CI run 30790992743 success ; Parity registries run 30790992634
> success).

## PRÊTS À RE-SOUMETTRE — 3 points

# 1. P0-V3-12 — grand livre de facturation double entrée

**Motif de refus initial (verbatim registre)** : « pas de double entrée
canonique, décimales/FX/cutoff, compensations ni rapprochement PSP/GCP »

**Preuve sur main** :
- Commit audité : merge PR #28 `790eef1786` (feat/billing-double-entry-ledger
  — la PR exigée nommément par la conditionDeCloture) ; migration
  `packages/database/prisma/migrations/0078_double_entry_ledger/migration.sql`
  (triggers d'immutabilité append-only).
- Code : `services/api/src/ledger-core.ts` — double entrée stricte
  (LEDGER_TOO_FEW_ENTRIES si <2 écritures), montants EXACTS en bigint minor
  units (jamais float), équilibre par devise (Σ débits == Σ crédits, I-LED-1),
  FX via compte de clearing avec taux enregistré + arrondi déterministe ;
  `ledger-reconciliation.ts` (rapprochement).
- Tests VERTS dans Production CI main run 30790992743 :
  `ledger-core.spec.ts` 18 tests ✓ ; `tests/ledger-store-db.spec.ts` 7 tests
  ✓ sur VRAI Postgres (dont « a posted entry CANNOT be mutated (append-only DB
  trigger) », détection d'écart réel au rapprochement, reversal ⇒ 0).
  https://github.com/openaxcloud/vibecore/actions/runs/30790992743
- Antécédent expert : le lot fix-forward PR #39 a été ACCEPTÉ à portée ciblée
  au reçu RR-20260723-CODEX-07 (sans signature de contrat).

**RÉSERVE dite telle quelle** : la PR #39 (fix-forward des 8 défauts
concurrence/atomicité relevés sur #27/#28, lot accepté par RR-07) n'est PAS
mergée — elle est CONFLICTING vs main (+3221/−384 sur 25 fichiers). Le contenu
accepté par l'expert n'est donc pas encore sur main. À réconcilier + merger
(feu vert Avi) avant ou avec la re-soumission.

# 2. P0-EX-04 — machine à états Import (propre/quarantaine)

**Motif de refus initial (verbatim registre)** : « code + 15 tests prouvent
encore l'ancienne machine (SCANNING→COMMITTING) »

**Preuve sur main** :
- Commit audité : merge PR #27 `c0fd65decb` (la PR exigée nommément par la
  conditionDeCloture : feat/import-state-machine-p0ex04).
- Code : `services/api/src/import-pipeline.ts` — machine du contrat en en-tête
  et implémentée : RECEIVED → STAGING_ISOLATED → SCANNING → (findings
  bloquants) QUARANTINED → AWAITING_USER_ACTION → RESCANNING →
  READY_TO_COMMIT → COMMITTING → COMMITTED ; états latéraux ROLLING_BACK ·
  CLEANUP_PENDING · EXPIRED · CANCELLED · FAILED ; consentement explicite
  obligatoire (jamais QUARANTINED→READY direct) ; RESCANNING re-vérifie la
  copie stagée consentie.
- Tests VERTS dans Production CI main run 30790992743 :
  `import-pipeline.spec.ts` 20 ✓ · `tests/import-state-machine-e2e.spec.ts`
  7 E2E ✓ (dont injection d'erreur « disk exploded » sur commit) ·
  `import-billing.spec.ts` 21 ✓ · `tests/import-routes.spec.ts` 9.
  https://github.com/openaxcloud/vibecore/actions/runs/30790992743

**RÉSERVE** : même dépendance partielle que V3-12 au fix-forward #39 non
mergé (volet sûreté billing de l'import).

# 3. P0-EX-02 — IMPLEMENTATION_STATUS généré (jamais à la main)

**Motif de refus initial (verbatim registre)** : « aucun générateur
d'IMPLEMENTATION_STATUS dans scripts/CI »

**Preuve sur main** :
- Commit audité : `9cdee152` (2026-07-20, PR #24 mergée — « générateur
  d'IMPLEMENTATION_STATUS (EX-02) + CI qui génère et publie le statut
  (EX-10) »).
- Code : `scripts/parity/generate-implementation-status.mjs` ; câblé dans
  `.github/workflows/parity-registries.yml` (génération l.64 + l.146, fichier
  publié l.101).
- Garde CI vivante : `validate-registries.mjs` échoue si le fichier ne
  correspond pas au recalcul — sortie du run VERT sur main (Parity registries
  run 30790992634) : « OK IMPLEMENTATION_STATUS.yaml is up to date (computed
  from IMPLEMENTATION_FACTS — P0-EX-02) » + « OK IMPLEMENTATION_STATUS (159
  items — règles §23 CODED/PROVEN vérifiées) ».
  https://github.com/openaxcloud/vibecore/actions/runs/30790992634
- Note : le même commit couvre le mécanisme exigé par P0-EX-10 (la CI GÉNÈRE
  le statut, pas seulement --check) — à faire vérifier par l'expert s'il veut
  statuer les deux.

## PAS PRÊTS — 2 points (trous constatés à la source)

# 4. P0-V3-01 — collecteur avec rendu JS — TROU RÉEL

Condition de clôture : « Run CI réel du collecteur avec rendu JS (chromium)
vert + Ramp for Agents trié dans OBSERVATION_REGISTRY ».
- Le collecteur QUOTIDIEN de main (job « Daily baseline snapshot », cron) est
  vert MAIS le vert ne prouve PAS le rendu : le run 30790323097 (2026-08-03)
  loggue `RENDER_UNAVAILABLE pricing/gallery/community http=0` — les 3 cibles
  JS-rendered ÉCHOUENT silencieusement (échec non fatal). Un run vert avec
  rendu raté ne satisfait pas la condition.
- « Ramp for Agents » : ni cible du collecteur, ni observation triée dans
  OBSERVATION_REGISTRY (grep = 0).
- La PR #14 (collecteur 5 familles, +2119/−181) est OPEN et CONFLICTING.
**À faire** : réparer le rendu chromium dans le job schedule (http=0 = binaire
ou réseau manquant dans le runner), OU réconcilier/merger #14 ; ajouter la
cible ramp-for-agents + trier l'observation sur capture réelle.

# 5. P0-B-01 — overlay code réel sur 159 surfaces — TROU RÉEL

Motif : « 159 candidats mais aucun builtState/codeRefs ; tous pending/unknown ».
- Sur main : AUCUN `builtState` dans SURFACE_REGISTRY (grep = 0).
- Tout le travail (overlay 79 built / 42 partial / 38 absent +
  resolve-code-refs.mjs + garde) vit dans la PR #49, OPEN et CONFLICTING
  (+1820/−702 sur 14 fichiers, dont validate-registries.mjs).
**À faire** : réconcilier #49 avec main (piège connu : régénérer les 5 vues
avant validate), CI verte, merge (feu vert Avi), preuve vivante post-merge.
