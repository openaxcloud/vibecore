# RUNTIME_NIX_CONTRACT — contrat runtime Nix v2

contractId: CTR-RUNTIME-NIX
contractVersion: 2
schemaVersion: 2
repoCommit: 1692f981
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v1 REFUSED : « format lock incompatible + rotation inconnue » — v2 structuré + ancré, re-soumission requise
implementationAnchor: "Store Nix v2 partagé RO PROUVÉ live sous gVisor (mutation RO échoue — preuve négative) ; gen-1 12GB/6552 paths ; builds reproductibles Phase B (Node 62s, Python 3.12.13 store v2) ; format ecode.lock + politique de rotation = CHANTIER OUVERT (refus v1, déclaré)"
Décisions détaillées: `docs/NIX_V2_DECISION.md` + `docs/DEPLOY_REPRODUCIBLE_PIPELINE.md`
(preuves live: docs/deploy-evidence/2026-07-15-phase-b/).

## Contrat

- Store partagé **lecture seule** (gVisor-prouvé), génération v2: nixpkgs 26.05
  rev `8eeec934ae0d`, Nix 2.34.8; chemins **signés** (store 1,9 Go / 2 012
  chemins signés au 15/07).
- Catalogue signé: seuls les chemins du store signé sont activables; un bundle
  d'activation par langage/toolchain (prouvé: python 3.12.13, node).
- `ecode.lock.json`: lockfile d'environnement par projet — pin des bundles
  activés; reproductibilité = même lock ⇒ même environnement.
- Build: pod isolé in-cluster (gVisor, emptyDir, /nix RO optionnel, label
  egress dédié, AUCUNE PVC workspace montée) — dissout « Cloud Build n'a pas
  /nix » par design.
- Kill-switch: montage /nix gated par allowlist projet (WORKSPACE_NIX_PROJECTS)
  et clé chart; unset = comportement pré-Nix octet pour octet.

## Schéma du lockfile

Voir `docs/parity/schemas/ecode.lock.schema.json`.

## Non tranché (UNKNOWN)

- Politique de rotation des générations de store (rétention N-1 ? durée ?): UNKNOWN.
- Signature: rotation de la clé de signature du store: UNKNOWN.

## Préconditions
- P-NIX-1 : le store est monté LECTURE SEULE dans tout pod utilisateur ; kill-switch de montage existant (9a21f56f).
- P-NIX-2 : toute génération de store est versionnée (gen-N) et publiée atomiquement.

## Invariants
- I-NIX-1 : une écriture dans le store depuis un workspace ÉCHOUE (prouvé gVisor — preuve négative rejouée).
- I-NIX-2 : un build reproductible référence la génération de store utilisée.

## Tests négatifs
- mutation du store RO → échec (prouvé) ; build contre une génération absente → échec propre, jamais un fallback silencieux.

## Compatibilité
- pd-ssd RO multi-reader ; pool pd-standard 200Go (quota SSD) ; réveil 14,5s mesuré.

## Résultat de signature
- v1 : REFUSED (« format lock incompatible + rotation inconnue »). v2 : PENDING_REVIEW — le store et les builds sont prouvés ; **le format ecode.lock (compatibilité) et la politique de rotation des générations restent un CHANTIER OUVERT, dit tel quel**.
