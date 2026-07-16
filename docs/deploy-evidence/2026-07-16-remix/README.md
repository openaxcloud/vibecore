# REMIX — pipeline de fork sécurisé : preuve (2026-07-16)

Commit : bd4c334e. Machine à états NORMATIVE
SNAPSHOT_PINNED → CREDENTIALS_DETACHED → CLONING → DB_FORKING →
STORAGE_POLICY_APPLIED → SCANNING → INDEXING → COMPLETED.

## Invariant sécurité prouvé
Une VALEUR de secret n'entre jamais dans l'artefact de clone ; les secrets sont
des références (clés). CREDENTIALS_DETACHED précède CLONING (l'ordre inverse est
refusé, code REMIX_CLONE_BEFORE_DETACH).

## Preuve (test qui CHERCHE le secret et échoue à le trouver)
`services/api/src/tests/remix-routes.spec.ts` :
- crée un projet source avec un secret RÉEL : ProjectSecret chiffré (AES-GCM)
  + la MÊME valeur matérialisée dans un `.env` commité (PORT/STRIPE_KEY/DATABASE_URL),
- remixe via POST /projects/:id/remix (storagePolicy DETACH),
- puis CHERCHE activement les 2 valeurs dans les 3 surfaces du clone :
  (a) fichiers : `allFileText.not.toContain(SECRET_VALUE)` ET `not.toContain(ENV_VALUE)`
      — mais `.env` conserve `STRIPE_KEY=` / `DATABASE_URL=` (références, sans valeur) ;
  (b) base : `listProjectSecrets(clone) == []` ET `listProjectEnvVars(clone) == []` ;
  (c) job RemixJob : state COMPLETED, dbForked=false, `JSON.stringify(job)` sans valeur.
- 2 lignes-valeurs scrubbées (scrubbedValueLines >= 2).

## Résultat brut
14 tests verts (11 module pur remix-pipeline + 3 endpoint) :

  ✓ src/remix-pipeline.spec.ts (11 tests)
  ✓ src/tests/remix-routes.spec.ts (3 tests)
    - remixes a project WITH a secret and the secret value is NOWHERE in the clone
    - BLOCKS the remix (409, quarantine) if a secret value somehow survives (SCANNING gate)
    - exposes the remix job state via GET /projects/:id/remix/:remixJobId

Build strict services/api (tsc from src/server.ts) : exit 0.
GitHub push protection a d'abord bloqué le push (fixture `sk_live_…` = motif
Stripe) → fixtures neutralisées (le scanner a fait son travail), re-test 14/14.

## Honnêteté
- DB_FORKING : isolation (dbForked=false), PAS un fork physique CNPG — le fork
  logique de DB n'existe pas encore côté infra (RMX-4 impl. isolation, pas fork).
- STORAGE_POLICY_APPLIED : les 3 modes sont modélisés+validés ; la copie/partage
  réelle d'objets (CLONE/SHARE_WITH_CONSENT) est un reconcile Object Storage
  (flag-gated) — l'intent est enregistré, l'exécution physique est un follow-up.
- INDEXING : marqueur de complétion honnête (l'index du code projet n'existe pas).
