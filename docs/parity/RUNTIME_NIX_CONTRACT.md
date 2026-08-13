# RUNTIME_NIX_CONTRACT — contrat runtime Nix v2

contractId: CTR-RUNTIME-NIX
contractVersion: 4
schemaVersion: 4
repoCommit: 179d7242
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v3 REFUSED (REPONSE_EXPERT_V3_20260722 §B) : « lock pas prouvé immuable + enforcement incomplet » — v4 = les 4 corrections exigées IMPLÉMENTÉES + testées négativement, pas réécrites
implementationAnchor: "v4 : pin de génération OBLIGATOIRE (assertLockPublishable — alias mutable refusé) ; validation EXHAUSTIVE bundles/store paths/hashes contre le catalogue signé (ECODE_LOCK_BUNDLE_TAMPERED/UNKNOWN) ; pin persisté+réutilisé dans release ET rollback (RetainedRelease.storeGeneration → nixGenerationRef, rollback évalué contre la génération de SA release) ; négatif live révocation = prêt à jouer (mini-merge)"
Décisions: `docs/NIX_V2_DECISION.md` + `docs/DEPLOY_REPRODUCIBLE_PIPELINE.md`
(preuves live antérieures: docs/deploy-evidence/2026-07-15-phase-b/ — store RO gVisor
prouvé par preuve négative, builds reproductibles Node 62 s / Python 3.12.13).

## Contrat (inchangé sur le socle prouvé)

- Store partagé **lecture seule** (gVisor-prouvé), génération v2: nixpkgs 26.05
  rev `8eeec934ae0d`, Nix 2.34.8; chemins **signés** (1,9 Go / 2 012 chemins).
- Catalogue signé: seuls les chemins du store signé sont activables; un bundle
  d'activation par toolchain (prouvé: python 3.12.13, node 22.23.1, go 1.26.4).
- Build: pod isolé in-cluster (gVisor, emptyDir, /nix RO optionnel, label
  egress dédié, AUCUNE PVC workspace) — dissout « Cloud Build n'a pas /nix ».
- Kill-switch: montage /nix gated par allowlist projet + clé chart; unset =
  comportement pré-Nix octet pour octet.

## Levée du refus v2 — ce que la v3 IMPLÉMENTE

### 1. Format `ecode.lock.json`

- **Code**: `packages/k8s-client/src/ecode-lock.ts` — parse STRICT (miroir
  champ-à-champ de `docs/parity/schemas/ecode.lock.schema.json`, propriétés
  inconnues rejetées), composition depuis le registre (`buildEcodeLock`),
  **sérialisation canonique** (bundles triés, ordre de clés stable, newline
  final): même environnement ⇒ mêmes octets ⇒ même sha256 de révision dans le
  pipeline reproductible.
- **Écrivain unique**: `POST /projects/:id/nix-lock` (services/api) — compose
  depuis la génération ACTIVE (ou une génération explicitement utilisable),
  passe LA MÊME porte de validation que la lecture, écrit les octets canoniques
  dans le workspace ET le project-storage, audité (`runtime.nix-lock.write`).
- **Enforcement à la lecture** (Publish, chemin révision): lock présent ⇒
  parse + validation registre; contenu invalide, génération inconnue/révoquée,
  pin nixpkgs dérivé ⇒ **publish ÉCHOUÉ typé** avec la raison exacte — jamais
  de repli silencieux. La génération pinnée suit de bout en bout
  (`nixGenerationRef` → pod de build isolé ET pod d'app) et est tracée dans
  `metadata.serverDeploy.image.storeGeneration`.

### 2. Rotation / révocation des générations

- **Registre déclaratif versionné**: `platformEnv.runtime.nixGenerations`
  (values-prod.yaml, JSON compact, revu en PR) → configmap
  `NIX_STORE_GENERATIONS` → `packages/k8s-client/src/nix-generations.ts`.
  L'entrée gen-2 est peuplée depuis le store LIVE (catalog.json et manifests
  hashés le 2026-07-22; hash `sha256:3029b581…` identique au configmap prod).
- **Rotation** = une édition de document (gen-N `ACTIVE`, gen-N-1 `RETIRED`) →
  un `helm upgrade` atomique (checksum de configmap = rollout des
  consommateurs). Le parse valide TOUT le document ou rien.
- **Rétention**: `RETIRED` reste résolvable — un `ecode.lock` existant continue
  de monter SA génération (ses zones, son hash). Une entrée n'est retirée du
  document que quand ses disques n'existent plus.
- **Révocation** = statut `REVOKED` + `revokedAt`/`revokedReason` OBLIGATOIRES:
  refus typé `NIX_GENERATION_REVOKED` sur TOUTES les voies (résolution par id,
  par hash de dérive, lock pinné, placement manager), même si un lock la pinne.
- **Compat legacy**: registre absent ⇒ trio d'envs legacy octet pour octet;
  PVC explicite hors registre ⇒ passthrough non gouverné, jamais réécrit.

## Levée du refus v3 — les 4 corrections exigées par l'expert

**1. Pin de génération OBLIGATOIRE (immutabilité du lock).**
`assertLockPublishable(lock)` (ecode-lock.ts) refuse tout lock dont
`storeGeneration` n'est pas un pin CONCRET (`gen-N` ou `sha256:…`). Les alias
mutables (`active`/`latest`/`current`/`head`/`stable`/`default`/`*`/vide), qui
pourraient re-résoudre vers une autre génération sans éditer le fichier, sont
rejetés (`ECODE_LOCK_UNPINNED`). Appelé à l'écriture (`POST /projects/:id/nix-lock`)
ET à la lecture au Publish. Un lock n'est plus « publiable » sans pin immuable.

**2. Pin persisté ET réutilisé dans release ET rollback.**
`RetainedRelease.storeGeneration` + `RollbackPlan.storeGeneration` transportent
la génération de la release ORIGINALE. Le rollback par digest lit
`metadata.serverDeploy.image.storeGeneration` de la release cible et la réinjecte
comme `nixGenerationRef` — le rollback est évalué contre la génération de SA
release, jamais l'active courante. Elle est re-persistée dans le metadata du
rollback (un rollback-de-rollback la porte aussi). Si cette génération a été
REVOKED entre-temps, le placement manager la refuse (jamais de repli vers active).

**3. Validation EXHAUSTIVE contre le catalogue signé.**
`assertLockAgainstRegistry` lie désormais chaque bundle du lock au catalogue
signé de la génération : nom présent (`ECODE_LOCK_BUNDLE_UNKNOWN`), store path ET
sha256 identiques (`ECODE_LOCK_BUNDLE_TAMPERED`). Un chemin/hash falsifié, un
bundle inconnu ou retiré du catalogue échoue le Publish — impossible de résoudre
vers quelque chose que le catalogue n'a pas signé. Le sous-ensemble légitime de
bundles reste autorisé.

**4. Négatif live « Publish avec lock révoqué → refus ».**
Prêt à jouer via mini-merge dédié (l'api/manager prod n'interprètent pas encore
`NIX_STORE_GENERATIONS`). Séquence : déployer le tier runtime+api → `POST
/projects/:id/nix-lock` (écrit un lock pinné gen-2) → publish OK → `helm --set`
génération gen-2 = REVOKED → re-publish → **refus typé** attendu à l'URL. Feu vert
Avi requis pour le mini-merge.

## Préconditions
- P-NIX-1 : store monté LECTURE SEULE dans tout pod utilisateur ; kill-switch (9a21f56f) intact.
- P-NIX-2 : toute génération est versionnée (gen-N) et publiée **atomiquement** (le parse rejette tout document à activation non unique).
- P-NIX-3 : `ecode.lock.json` n'est écrit QUE par la plateforme, depuis le registre, en octets canoniques.

## Invariants
- I-NIX-1 : une écriture dans le store depuis un workspace ÉCHOUE (prouvé gVisor, preuve négative 15/07).
- I-NIX-2 : un build reproductible référence la génération utilisée (métadonnée `storeGeneration` + garde init-container par hash de catalogue).
- I-NIX-3 : au plus UNE génération ACTIVE ; double activation = document rejeté EN ENTIER.
- I-NIX-4 : une génération REVOKED est refusée partout, avec raison tracée ; AUCUN chemin de repli silencieux.
- I-NIX-5 : même lock ⇒ mêmes octets (canonique) ⇒ même sha256 de révision.
- I-NIX-6 : un lock publiable pin une génération CONCRETE ; un alias mutable est refusé (`ECODE_LOCK_UNPINNED`).
- I-NIX-7 : chaque bundle du lock est lié exhaustivement au catalogue signé (nom+store path+sha256) ; toute dérive échoue le Publish.
- I-NIX-8 : un rollback est évalué contre la génération de SA release (persistée), jamais l'active courante ; une génération révoquée entre-temps est refusée.

## Tests négatifs rejouables
`pnpm --filter @vibecore/k8s-client test` (118 tests) :
- `nix-generations.spec.ts` — double ACTIVE rejeté ; REVOKED sans raison rejeté ; hash malformé rejeté ; REVOKED refusé par id ET par hash ; génération inconnue refusée ; env registre invalide = échec bruyant (jamais silencieux).
- `ecode-lock.spec.ts` — propriété inconnue rejetée (racine et bundle) ; storePath hors `/nix/store/` rejeté ; bundle dupliqué rejeté ; lock sur génération révoquée/inconnue refusé typé ; pin nixpkgs dérivé refusé ; **(v4)** alias mutable refusé (`ECODE_LOCK_UNPINNED`) ; store path/sha256 falsifié refusé (`ECODE_LOCK_BUNDLE_TAMPERED`) ; bundle inconnu du catalogue refusé (`ECODE_LOCK_BUNDLE_UNKNOWN`) ; sous-ensemble légitime accepté.
- `nix-generation-lifecycle.spec.ts` — **cycle complet rejoué sur le document de prod réel** : publication gen-3 → rotation (activation atomique) → rétention du lock gen-2 → révocation gen-2 → refus sur toutes les voies avec raison ; **(v4)** pin concret du lock gen-2 réel prouvé publiable, alias refusé ; validation exhaustive : bundle falsifié/inconnu refusé contre le vrai gen-2.

`pnpm --filter @vibecore/api test -- release-rollback` (12 tests, dont **v4**) — `retainRelease → RetainedRelease.storeGeneration → RollbackPlan.storeGeneration` : le rollback re-pin la génération de SA release ; une release sans lock ⇒ rollback non gouverné (comme l'original).

`pnpm --filter @vibecore/workspace-manager test` (76 tests, dont `nix-placement.spec.ts`) — placement registre : la rotation pilote zones+hash (trio legacy ignoré) ; pin RETIRED résolu (rétention) ; pin REVOKED jeté typé ; registre sans ACTIVE = store coupé (PVC explicite = passthrough non gouverné).

## Compatibilité
- Registre absent ⇒ comportement legacy octet pour octet (testé).
- D3 multi-zones (clones par zone, garde de dérive, pin de zone data-disk) inchangé sous registre.
- pd-ssd/pd-standard RO multi-reader ; réveil 14,5 s mesuré (15/07).

## BLOQUÉ — dépendance nommée (non gonflée)
- **Preuve E2E live** (Publish réel → URL publique → refus typé d'un lock révoqué, à travers UI → control plane → runtime → réseau) : **BLOCKED sur le déploiement de cette PR** — l'api/manager en prod n'interprètent pas encore `NIX_STORE_GENERATIONS` ni `ecode.lock.json`. Séquence de rejeu prête (mêmes étapes que `nix-generation-lifecycle.spec.ts`, via `POST /projects/:id/nix-lock` + publish + `--set platformEnv.runtime.nixGenerations` pour la révocation), à dérouler au premier CD après merge.

## Non tranché (UNKNOWN, hors périmètre du refus v2)
- Rotation de la clé de signature du store (`ecode-nix-1`) : UNKNOWN — chantier distinct.

## Résultat de signature
- v1 : REFUSED (« format lock incompatible + rotation inconnue »).
- v2 : REFUSED (RR-20260721-CODEX-04 — dépendances ouvertes).
- v3 : REFUSED (REPONSE_EXPERT_V3_20260722 §B — lock pas prouvé immuable + enforcement incomplet : pin optionnel, rollback sans pin, validation partielle du catalogue, négatif live bloqué).
- v4 : PENDING_REVIEW — les 4 corrections exigées sont implémentées et testées négativement (pin obligatoire, pin persisté+réutilisé dans release ET rollback, validation exhaustive contre le catalogue signé) ; seul le négatif live de révocation reste à jouer, prêt via mini-merge dédié (feu vert Avi).
