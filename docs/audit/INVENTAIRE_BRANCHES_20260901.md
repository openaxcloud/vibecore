# Inventaire des branches locales — 2026-09-01

**Aucune suppression, aucun push effectué.** Ce document est un état des lieux
destiné à préparer une décision, pas à l'exécuter.

## Compteurs

| | branches |
|---|---|
| **total local** | **894** |
| contenu déjà dans `main` (« fusionnée ») | 373 |
| contenu absent de `main` (« travail unique ») | 521 |

Croisé avec la présence sur `origin` :

| classe | sur `origin` | local seulement |
|---|---|---|
| fusionnée | 105 | 268 |
| travail unique | 205 | **316** |

## Le seul groupe à risque : 316 branches

Travail absent de `main` **et** absent d'`origin`. Si cette machine est perdue,
ce travail l'est aussi. Par ancienneté du dernier commit :

| | branches |
|---|---|
| < 7 j | 150 |
| 7–30 j | 78 |
| 30–90 j | 86 |
| > 90 j | 2 |

**150 ont moins de 7 jours** — c'est du travail vivant, pas de
l'archéologie.

## Méthode, et ses limites

Classement par `git diff --quiet origin/main...<branche>` : la branche est dite
« fusionnée » quand elle n'apporte **aucune différence** depuis sa base commune
avec `main`. Ce test résiste au **squash-merge**, contrairement à
`git branch --merged` qui ne verrait pas qu'un squash a intégré le contenu.

⚠️ **« Travail unique » surestime.** Une branche ancienne dont les changements
ont été supplantés autrement apparaît comme unique sans rien valoir. Le chiffre
de 521 est donc un **majorant**, pas un décompte de travail
précieux. C'est pourquoi la colonne d'ancienneté existe : elle sépare le vivant
du sédiment.

⚠️ Ce classement ne dit **rien** du travail **non commité** : 92 worktrees
sur 214 en portent, et il n'apparaît dans aucune branche.

## Les plus consistantes du groupe à risque (< 7 jours)

| branche | commits | dernier |
|---|---|---|
| `codex/cicd-provenance-hardening-20260831` | 156 | 2026-08-31 |
| `codex/provider-rollback-recovery-20260831` | 156 | 2026-08-31 |
| `codex/final-integration-20260828` | 155 | 2026-08-31 |
| `codex/provider-deploy-hook-saga-20260831` | 155 | 2026-08-31 |
| `codex/database-provisioning-generation-fence-20260831` | 153 | 2026-08-31 |
| `codex/publish-production-workspace-fence-20260831` | 153 | 2026-08-31 |
| `codex/deployment-release-fence-sweep-20260831` | 151 | 2026-08-31 |
| `codex/publish-migration-release-fence-20260831` | 151 | 2026-08-31 |
| `codex/static-rollback-physical-fence-20260828` | 150 | 2026-08-31 |
| `codex/publish-database-release-fence-20260828` | 142 | 2026-08-28 |
| `codex/tenant-release-fixtures-20260828` | 142 | 2026-08-28 |
| `codex/partial-target-authority-fix` | 138 | 2026-08-28 |
| `codex/permanent-delete-proof-fixtures-20260828` | 138 | 2026-08-28 |
| `codex/release-fence-regressions-20260828` | 138 | 2026-08-28 |
| `codex/checkpoint-423-fix-20260828` | 127 | 2026-08-28 |
| `codex/account-purge-project-receipts-20260828` | 120 | 2026-08-28 |
| `codex/cnpg-hardening-20260828` | 120 | 2026-08-28 |
| `codex/registry-build-integration-20260828` | 120 | 2026-08-28 |
| `codex/volume-runtime-integration-20260828` | 117 | 2026-08-28 |
| `codex/cnpg-runtime-integration-20260828` | 116 | 2026-08-28 |

## Ce qui reste à décider — et qui ne m'appartient pas

1. Les **branches fusionnées** sont supprimables sans perte : leur contenu est
   dans `main`, par construction du test ci-dessus.
2. Les branches à **travail unique non poussé** doivent être triées **par leur
   auteur**. Les pousser à sa place produirait des PR orphelines que personne ne
   revendique ; les supprimer détruirait du travail.
3. Toute suppression doit passer par une **corbeille** — une branche
   `corbeille/<nom>` poussée sur `origin` avant retrait local — jamais par un
   `git branch -D` définitif.

Le fichier brut du classement, une ligne par branche, est reproductible avec le
script décrit en tête de ce document.
