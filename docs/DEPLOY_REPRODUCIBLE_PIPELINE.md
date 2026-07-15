# Pipeline de publication reproductible (server deploy, Phase B)

Statut : **DÉCIDÉ** (2026-07-15) — en cours d'implémentation. Successeur du prototype Phase A
(« Publish = snapshot du pod vivant », prouvé live le 15/07 mais **non rejouable** — acté par
`d013e5fd` : le prototype n'est pas la source de vérité de prod).

## Pourquoi le snapshot du pod vivant ne peut pas rester

`server-deploy-transfer.ts` (chemin A3) tar-ise le workspace **vivant, deps incluses**
(`tar czf … .` avec pour seules exclusions `.git` et les tarballs de deploy). Conséquences :

- **Non rejouable** : caches, artefacts de build intermédiaires, état non reproductible, fichiers
  temporaires — tout ce qui traînait dans le pod part dans l'image. Deux Publish du même code ne
  donnent pas deux images identiques.
- **Rollback illusoire** : re-déployer une vieille image marche, mais on ne peut pas RE-construire
  cette image ; si elle est perdue (rétention AR), la révision est irrécupérable.
- **Sécurité** : des secrets présents dans le pod (fichiers .env écrits par l'utilisateur, tokens
  de session d'outils) peuvent fuiter dans l'image.
- **Le pod de dev n'est JAMAIS la source de vérité.**

## La chaîne cible

```
1. RÉVISION      snapshot SOURCE du workspace (deps exclues), content-addressed,
                 persisté GCS + revisionId sur la ligne deployment
2. LOCK          ecode.lock.json (toolchain, cf. docs/NIX_V2_DECISION.md §4)
                 + lockfiles langage (deps applicatives)
3. GATES         policy/sécurité (taille, scan secrets) — bloquants
4. BUILD ISOLÉ   Job K8s jetable (gVisor, /nix RO, éphémère, AUCUN accès au pod
                 workspace) : install deps + build → artefact complet
5. IMAGE         Cloud Build COPY générique (app-image-build.ts, inchangé) → AR
                 vibecore-prod-apps, tag immuable p-<projectId>:<deploymentId>
6. RUN           serverAppDeployment (+ /nix RO), mécanisme Phase A inchangé
```

Rejouabilité : (révision, lock, lockfiles) ⇒ le même artefact. Rollback réel : re-déployer
l'image OU la reconstruire depuis la révision.

## Réutilisation Phase A (rien n'est jeté)

| Maillon | Phase A (prouvé) | Phase B |
|---|---|---|
| Snapshot pod → GCS PUT signé | A3 | même mécanisme, mais **source seule** (exclusions node_modules/.venv/caches) = la révision |
| Dockerfile générique + Cloud Build + AR | A4 | inchangé |
| `.ecode/deploy.json` {run,build} | A6 | inchangé (le Job de build exécute `build`, l'image exécute `run`) |
| serverAppDeployment + /nix RO | A1/A2/A5 | inchangé |
| Flag-gating | `SERVER_DEPLOY_SNAPSHOT_IMAGE` | `SERVER_DEPLOY_BUILD_FROM_REVISION` (flag absent = chemin A octet pour octet) |

## Maillon manquant identifié : project-storage désynchronisé

`project-storage` (`PROJECT_STORAGE_DIR`, arbre durable côté API, lu par le panneau Git) est
alimenté au scaffold/import/restore mais **pas synchronisé en continu avec le workspace**. Tant
que c'est vrai, la révision doit être capturée **depuis le workspace au moment du Publish**
(étape 1 ci-dessus) — pas depuis project-storage. La convergence project-storage ⇄ workspace est
un chantier séparé ; le pipeline n'en dépend pas.

## Étapes d'implémentation

| # | Étape | État |
|---|---|---|
| B1 | Snapshot-révision (source seule, content-addressed, persisté) au Publish | 💻 en cours |
| B2 | Job de build isolé (gVisor, /nix RO) : `npm ci`/install + build → artefact → GCS | 💻 en cours |
| B3 | Câblage flag-gated `SERVER_DEPLOY_BUILD_FROM_REVISION` dans le chemin Publish | ⬜ |
| B4 | Preuve live Node : Publish réel → URL 200, artefact ≡ rejouable | ⬜ |
| B5 | Preuve live Python via store v2 (26.05) + bundle d'activation | ⬜ (dépend Nix v2 §7) |
| B6 | Gates policy/scan secrets | ⬜ |
| B7 | Signature d'images (cosign) + promotion | ⬜ |
