# RUNTIME_NIX_CONTRACT — contrat runtime Nix v2

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
reviewCloseCriterion: durcir le contenu puis obtenir la signature du relecteur ; raison détaillée du refus à consigner verbatim dès transmission du rapport
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
