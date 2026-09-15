# Baseline Git — Gate 1

## Décision de gel

L'audit Gate 1 porte exclusivement sur le commit complet
`8a93e995b37de513a142acaf41fed364787c5e4e` de
`openaxcloud/vibecore`. Ce commit était la tête réelle de `origin/main` au
début de l'audit. Le SHA fourni dans la demande,
`6c1589229fb9131adb15f4ec1416629ebb8ac596`, en est un ancêtre situé neuf
commits en arrière.

La tête distante a continué d'avancer pendant l'audit. À
`2026-08-07T10:00:27Z`, `origin/main` pointait sur
`65f52894ebb3b2d763c5241355bafb89e034675c`, soit 24 commits après la
baseline. Ces résultats ne doivent donc pas être attribués à cette nouvelle
tête sans rejeu complet.

| Élément | Valeur figée |
| --- | --- |
| Dépôt | `https://github.com/openaxcloud/vibecore.git` |
| Branche principale | `main` |
| SHA code audité | `8a93e995b37de513a142acaf41fed364787c5e4e` |
| Parent | `d3081c344d7089addb05fa4d3cc29517bfb45550` |
| Date du commit | `2026-08-07T09:16:16Z` |
| Sujet | `chore(parity): attestation roulée automatiquement (run 31165120246 @ d3081c34) — LS-16` |
| Worktree d'audit | `/private/tmp/vibecore-gate1.6gpjnH/repo` |
| État initial | détaché sur le SHA exact, propre |
| Sous-modules | aucun fichier `.gitmodules`, sortie `git submodule status` vide |
| Tag au SHA | aucun |
| Remote correct | `origin` → `openaxcloud/vibecore` |
| Remote à ne pas utiliser | `upstream` → `stackblitz-labs/bolt.diy` |

Le checkout de travail habituel était déjà modifié sur
`fix/ide-save-conflict-and-packages-status`; il n'a pas servi de source de
preuve et ses changements n'ont pas été touchés. Les documents de cet audit
sont des artefacts Gate 1 ajoutés hors du SHA de code et ne doivent jamais
être confondus avec lui.

## Commandes reproductibles

```bash
git clone https://github.com/openaxcloud/vibecore.git
cd vibecore
git fetch --all --tags --prune
git checkout --detach 8a93e995b37de513a142acaf41fed364787c5e4e
git rev-parse HEAD
git status --porcelain=v1
git remote -v
git submodule status
git tag --points-at HEAD
git merge-base --is-ancestor 6c1589229fb9131adb15f4ec1416629ebb8ac596 HEAD
git rev-list --count 6c1589229fb9131adb15f4ec1416629ebb8ac596..HEAD
gh pr list -R openaxcloud/vibecore --state open --limit 500
git ls-remote --heads origin
```

Résultat initial observable : `HEAD=8a93e995…`, arbre propre, dépôt et branche
corrects, 195 branches distantes. Le nombre de PR ouvertes a évolué pendant
la collecte (52 au premier relevé, 49 au relevé final), ce qui confirme que
les métadonnées GitHub sont temporelles et ne font pas partie du gel du code.
Le hash SHA-256 de la liste finale des branches est
`288de9dd5c1068b8bf378091ebc5c3e579330db0c065ecc8d47cf4ae9fe8ff94`;
celui de la liste finale normalisée des PR est
`17bb06234738ec8e1540273236e7078dc28d1c1cd11fcb064e5fc9c3c275d0d9`.

## CI attachée au bon SHA

Le SHA audité ne possède ni check-run, ni statut, ni run GitHub Actions. Son
parent `d3081c34…` possède des runs verts de test, qualité et sécurité, mais
ils ne valent pas CI du SHA exact. Le workflow de déploiement du parent a été
annulé. La seule action qui produit `8a93e995…` est une attestation de registre,
pas une validation complète.

| Run | SHA | Résultat | Hash SHA-256 des logs |
| --- | --- | --- | --- |
| Production CI `31165120287` | `d3081c34…` | succès | `d23d21ee7f89143750d8a323cbad887afcf2a8459b573af1a2ab2e4f11056483` |
| Security Analysis `31165120337` | `d3081c34…` | succès avec audit dépendances non bloquant | `0afaf75ac6cc533028886a6bf1544c4eb228dce44a82cad178e96a958d5a111d` |
| Parity registry `31165120246` | `d3081c34…` → crée `8a93e995…` | succès | `898280559c2db0f7ee5f59af994632a9e88aa7b5d6df4e738431df7235f43718` |
| Deploy `31165120211` | `d3081c34…` | annulé, aucun log | hash vide `e3b0c442…` |

## Branches et PR concurrentes

Les écarts ci-dessous sont calculés contre le SHA audité, jamais contre la
tête mouvante de `main`.

| PR / tête exacte | Zone | Derrière | Devant | Conclusion Gate 1 |
| --- | --- | ---: | ---: | --- |
| #94 `b0690bfe1a137912fa39cc1c21ba6c50740acdb3` | rollback / manifeste | 66 | 3 | non incluse dans la baseline |
| #107 `2cabebf0ad574de0ad0d747a943e72efb4450c83` | password protect | 71 | 3 | non incluse |
| #81 `ef13a9794aabcea4493182fbe7a4956d8fa259d2` | supply chain / cosign | 139 | 7 | non incluse |
| #89 `022f23fc44ea9bd025abab77db55a05fb003076e` | parsing IBAN | 63 | 6 | non incluse |
| #105 `65e426cbb30416314003d217c10e5facaad5fb45` | i18n site | 54 | 13 | non incluse |
| #106 `9efd247b98ab381b87dfe4ec2cc86597b8fa7151` | i18n enterprise | 54 | 17 | non incluse |
| #121 `bc923466e1dcfd1435cef8d9ae27eddae2f89889` | sauvegarde IDE | 270 | 1 | non incluse |
| #124 `bc46afc5386148aecee4f183b6c282459f2c04a9` | framing preview | 19 | 1 | non incluse |

Les têtes `fix/cluster-b-ide-panels`, `fix/cluster-c-launch-readiness`,
`fix/cluster-d-ide-panels`, `fix/devserver-never-starts`,
`fix/devserver-unify-launcher` et
`fix/preview-injection-runtime-resilience` sont déjà ancêtres du SHA audité.
Leur simple présence distante ne représente donc pas un gap non fusionné.

## Sources de suivi réutilisées

L'audit référence, sans les remplacer :
`DESIGN_PROGRAM_MASTER.md`, `DESIGN_AUDIT_LIVE.md`,
`BUG_INVENTORY_LIVE.md`, `PLAN_REMAINING_UNIFIED.md`,
`REPLIT_PARITY.md` et `docs/DEPLOY_RUNBOOK.md`.
Le chemin racine `IMPLEMENTATION_STATUS.yaml` cité dans la demande est absent.
Le dépôt contient en revanche `docs/parity/IMPLEMENTATION_STATUS.yaml`, généré
depuis `d3081c34…` juste avant le commit d'attestation. Il a été réutilisé comme
registre dérivé, sans éditer ses statuts. Les statuts historiques n'ont pas été
promus : aucune preuve live n'a été rejouée sur le SHA exact, et plusieurs
lignes des suivis sont contradictoires ou périmées.
