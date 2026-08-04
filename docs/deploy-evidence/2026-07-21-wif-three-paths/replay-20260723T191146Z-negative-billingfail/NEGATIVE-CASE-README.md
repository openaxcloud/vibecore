# Cas négatif — la liaison billing échoue APRÈS `gcloud projects create`

Refus expert **RR-20260723-CODEX-07** (P0-A2-09) : dans `repro.sh`, le `trap teardown`
était armé *après* `gcloud projects create` + `gcloud billing projects link`. Si le
`billing projects link` échouait sous `set -Eeuo pipefail`, le script sortait AVANT
l'armement du trap → **projet laissé actif** (ressource facturable orpheline).

## Correctif prouvé ici
Le `trap teardown EXIT` est désormais armé **AVANT** `gcloud projects create` et
`gcloud billing projects link`. Le teardown est idempotent ET sûr si le projet n'existe
pas encore (garde `gcloud projects describe`).

## Reproduction exacte de ce cas négatif (exécutable, non commenté)
```bash
export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.12
WIF_BILLING="000000-000000-000000" \
  WIF_OUT="$PWD/replay-<ts>-negative-billingfail" \
  bash ./repro.sh
```
Un compte de facturation **invalide** force l'échec réel de `gcloud billing projects link`
(ligne 94), qui suit immédiatement `gcloud projects create` (ligne 93).

## Faits observés (live, 2026-07-23)
- `run.log` :
  - `trap teardown ARMÉ AVANT create/billing (projet ecode-wif-proof-833908)`
  - `crée ecode-wif-proof-833908 sous folder 780512954993`
  - **(le log s'arrête ici : la commande SUIVANTE — `gcloud billing projects link` — a
    échoué `IAM_PERMISSION_DENIED` sous `set -e`, déclenchant le `trap EXIT`)**
- Code de sortie du script : **1** (non-zéro — échec propagé par pipefail).
- `teardown-trace.txt` : le teardown entre dans la branche « projet existe », tente le
  nettoyage des sous-ressources (inexistantes → `|| true`), puis
  `gcloud projects delete ecode-wif-proof-833908` → **`PROJECT_STATE=DELETE_REQUESTED`**.
- Vérification indépendante post-run :
  `gcloud projects describe ecode-wif-proof-833908` → `DELETE_REQUESTED`.
  `gcloud projects list --filter="projectId:ecode-wif-proof-* AND lifecycleState:ACTIVE"`
  → **aucun** (0 projet actif résiduel).

## Conclusion
Le projet créé juste avant l'échec de la liaison billing est **bien nettoyé par le trap**.
Avec l'ancien ordre (trap après create/billing), ce même échec aurait laissé
`ecode-wif-proof-833908` **ACTIF**. Le défaut RR-20260723-CODEX-07 est corrigé et prouvé.
