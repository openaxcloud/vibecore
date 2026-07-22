# P0-B-01 — énumération canonique des 159 surfaces + overlay code vérifiable

Refus expert levé : « 159 candidats mais aucun builtState/codeRefs ; tous pending/unknown ».

## Ce qui manquait vs ce qui est livré

| Reproche | Correction |
|---|---|
| Aucun builtState par surface | Chaque surface P001–P159 porte un `builtState` (built/partial/absent) projeté depuis l'overlay `IMPLEMENTATION_STATUS` — **plus aucun `evaluation: PENDING` / `availability: UNKNOWN`** dans `surfaceUniverse` (0/159). |
| Aucun codeRef | Chaque état built/partial porte des `codeRefs` **résolues vers des fichiers suivis par git** (`resolve-code-refs.mjs`) ; `missingCodeRefTotal = 0`. |
| Rien de vérifiable / verrouillé | Garde CI cassante (`validate-registries.mjs §16`) : l'ensemble EXACT des 159 ids est verrouillé, un builtState construit sans code réel casse le build, une dérive registre↔overlay casse le build. |

## Nombre canonique de surfaces

- **159 candidats IDE** : `P001` … `P159` (`EXPECTED_SURFACE_IDS`, verrou d'ensemble exact).
- **164 univers canonique** = 159 candidats + 5 surfaces déclarées hors-IDE (`additionalCanonical` : SRF-LANDING, SRF-PROJECT-CREATE, SRF-ADMIN-AGENT-ROUTING, SRF-GALLERY-STARTER-DEMOS, CS-COMMUNITY-PROFILES candidate). Cohérence `canonicalSurfaceCount` vérifiée par la garde.

## Overlay code — chiffres mesurés (missingCodeRefTotal = 0)

| builtState | nb | définition | codeRefs |
|---|---|---|---|
| **built** | **79** | 11 PROVEN (evidence sur disque) + 68 CODED (mergé main + code) | tous résolus vers fichiers suivis par git |
| **partial** | **42** | code présent mais incomplet / bolt non câblé | ≥1 codeRef résolu (la partie construite) |
| **absent** | **38** | NOT_STARTED | codeRefs: [] |

Total **159**. (La garde a reclassé **P016** « Symbols / Outline » de PARTIAL→NOT_STARTED : son unique codeRef `services/api/src/editor` ne résout vers aucun fichier suivi — un partiel-sans-code-réel est refusé.)

## Architecture de vérité

- **Source éditable** : `IMPLEMENTATION_FACTS.yaml` (codeRefs / evidenceIds / mergedToMain / partialReason).
- **Dérivé** : `IMPLEMENTATION_STATUS.yaml` (status + `resolvedCodeRefs` machine) — régénéré par `generate-implementation-status.mjs`, drift-check CI.
- **Résolveur** : `resolve-code-refs.mjs` — un codeRef résout UNIQUEMENT s'il correspond à un fichier `git ls-files` (chemin exact, `schema.prisma` canonique, répertoire suivi, basename unique, raccourci Remix `$projectId`) ; annotations de route `(…)` / `/route` ignorées (pas des fichiers).
- **Enumération canonique** : `SURFACE_REGISTRY.yaml > surfaceUniverse` — builtState + codeRefs projetés, vérifiés non-dérivants par la garde.

## Preuve négative rejouable

`scripts/parity/prove-surface-overlay-guard.sh` — 3 mutations, chacune doit casser :

```
NEG-1 retirer une surface canonique (P080)      → génération refuse (univers rétréci)
NEG-2 codeRef fantôme sur un CODED (P002)        → génération refuse (état non justifié)
NEG-3 builtState divergent surfaceUniverse (P001)→ validateur refuse (dérive)
CONTRÔLE restauration                            → génération + validateur VERTS
RÉSULTAT: 4 OK / 0 KO
```

Log brut : `neg-proof.txt`.

## Rejouer

```bash
PARITY_DEPS=<deps> node scripts/parity/generate-implementation-status.mjs   # régénère l'overlay (échoue si un état construit cite du code fantôme)
PARITY_DEPS=<deps> node scripts/parity/validate-registries.mjs              # garde §16 (verrou ids + overlay justifié + non-dérive)
PARITY_DEPS=<deps> bash scripts/parity/prove-surface-overlay-guard.sh       # 4 OK / 0 KO
```

Statut : **PROVEN_REVIEW_PENDING** — pas de merge sans feu vert.
