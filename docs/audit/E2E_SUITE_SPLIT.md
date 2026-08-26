# Découpage de la suite E2E — `Production E2E` vs `E2E Runtime`

**Date :** 2026-08-17
**Contexte :** `Production E2E` (`.github/workflows/e2e.yml`) n'avait **jamais été vert**.
Mesure sur l'historique complet du workflow :

```
gh api repos/openaxcloud/vibecore/actions/workflows/e2e.yml/runs --paginate
→ failure 288 | cancelled 117 | success 0     (405 runs depuis le 2026-05-17)
```

Le run de référence sur `main` @ `b2ee7c88` ([31676668326]) donnait **57 failed /
177 passed / 24 skipped**. Les 57 échecs étaient intégralement **hérités** : ils
apparaissaient à l'identique sur les PR en cours, qui n'en ajoutaient qu'**un
seul** supplémentaire.

[31676668326]: https://github.com/openaxcloud/vibecore/actions/runs/31676668326

## Pourquoi un découpage

Le stack monté par `e2e.yml` est : postgres + redis + mailpit (docker compose),
l'API en dev, l'app web buildée servie par `start:node`, l'app admin en dev.

Il n'y a **aucun runtime de workspace** : pas de pod, pas de dev server de
projet, pas d'iframe de preview servie. Constaté en montant le même stack en
local — l'IDE affiche :

```
"Error workspace | The project service is temporarily unavailable"
"Crashed runtime" · "Restart workspace"
```

Les tests qui exigent un workspace **running** ne peuvent donc pas passer dans ce
workflow, par construction. Les y laisser revenait à garder un rouge permanent
dans un gate bloquant — ce qui est exactement la raison pour laquelle le gate
n'a jamais pu servir.

## Mécanisme

Tag Playwright `@runtime` sur les tests concernés, et non un déplacement de
fichiers : les specs partagent leurs helpers, et un tag garde la couverture
lisible au même endroit.

| Workflow                          | Commande                                                              | Rôle                                               |
| --------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `Production E2E` (`e2e.yml`)      | `playwright test tests/e2e --project=chromium --grep-invert @runtime` | **bloquant**                                       |
| `E2E Runtime` (`e2e-runtime.yml`) | `scripts/run-e2e-runtime-playwright.sh` (`--grep @runtime`)           | **bloquant** sur PR/push `main`, manuel et nightly |

## Tests tagués `@runtime` (17)

| Spec                           | Tests                      | Dépendance                                                                                                                              |
| ------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `critical-paths.spec.ts`       | 1                          | workspace running + iframe de preview                                                                                                   |
| `preview-runtime.spec.ts`      | 4                          | workspace running + dev server booté                                                                                                    |
| `mobile-device-matrix.spec.ts` | 5 (« nonblank preview »)   | preview non blanche                                                                                                                     |
| `responsive-ide.spec.ts`       | 3 (desktop Run / terminal) | bouton Run + panneau terminal issus du workspace                                                                                        |
| `dashboard.spec.ts`            | 4                          | template -> workspace running, panneaux IDE et état persisté                                                                            |
| étape `IDE panel live audit`   | —                          | audite les panneaux contre de vraies données projet (« The requested panel data was not found. » sur 16 panneaux dans le stack du gate) |

Ce qui **reste dans le gate** pour ces mêmes specs : toute la couverture
responsive/layout (les 7 profils `adapts to …` de la matrice mobile, les
assertions de shell compacte, la palette d'outils), c'est-à-dire ce que
`Production E2E` peut réellement vérifier.

## Infrastructure réelle du gate runtime

Le workflow crée un cluster **kind éphémère par run**, construit l'image
`workspace-agent` taguée avec le SHA Git complet, la charge dans kind puis lance
le workspace-manager, l'API et le preview-proxy réels. Un bridge CI limité au
contexte kind ouvre des `kubectl port-forward` vers les Services des workspaces ;
HTTP et WebSocket traversent donc les mêmes API runtime que le navigateur.

Avant Playwright, `runtime:validate:api-kubernetes` prouve sur un pod réel :
création projet/workspace, fichiers, patch, commande, terminal WebSocket, port
utilisateur, preview proxifiée, snapshot, export/import ZIP et arrêt. Les specs
sont ensuite exécutées emplacement Playwright par emplacement Playwright ; les
ressources workspace sont purgées entre emplacements distincts pour borner la
pression pod/PVC et le dernier workspace reste observable pour le manifeste de
preuve.

Le job ne reçoit aucun secret cloud ou fournisseur IA. Tous les appels
`kubectl` et port-forward sont liés au kubeconfig et au contexte kind exacts.
Les services Docker utilisent un nom de projet Compose propre au run. Le
teardown s'exécute avec `if: always()`, supprime le cluster par son nom exact,
vérifie son absence, puis détruit les volumes Docker éphémères. Les logs, les
ressources Kubernetes, l'imageID, les PVC et la preuve de disparition sont
conservés 14 jours.

Limite explicitement hors preuve : kind est lancé sans gVisor
(`WORKSPACE_DISABLE_SANDBOX_SCHEDULING=1`). Ce gate prouve le contrat
UI/API/manager/agent/Kubernetes et le cycle de vie éphémère ; l'isolation gVisor
reste une preuve cluster dédiée distincte.

## Ce que ce découpage n'est PAS

Ce n'est pas un waiver : aucun test runtime n'est ignoré ni supprimé. Les 17
tests sont dans un gate réellement provisionné et bloquant. Un test qui dépend
d'un fournisseur IA externe n'est pas classé `@runtime` : il appartient à une
suite fournisseur avec ses propres credentials et n'est pas simulé ici.

## Critère de signature

Le câblage et les tests unitaires ne suffisent pas. Le lot reste
`IMPLEMENTED_UNPROVEN` tant qu'un run du workflow exact-SHA n'a pas terminé avec
les 17 tests verts, un manifeste kind contenant au moins un pod workspace
`Running/Ready` sur l'image attendue et une preuve de disparition du cluster.
