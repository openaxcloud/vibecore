# Gate 1 — Audit, architecture et parité réelle d'E-Code

## Décision

**NOT_READY** sur la baseline
`8a93e995b37de513a142acaf41fed364787c5e4e`.

E-Code possède une base IDE/runtime/deploy substantielle et des seams utiles,
mais la parité comportementale Replit + Cursor n'est pas démontrée. Trois
constats initiaux P0 de finance/release, rejoints par trois violations P0 de
frontières produit/sécurité lors de la consolidation, interdisent un lancement
ou une signature de parité. Les chemins de panne, concurrence, restauration,
isolation et intégrité externe ne disposent pas des preuves réelles exigées.

Le Gate 1 s'arrête ici. Aucun code produit, tracker, secret ou environnement de
production n'a été modifié. Aucun commit ni push n'a été effectué : pousser sur
`main` déclencherait le déploiement réel décrit dans `docs/DEPLOY_RUNBOOK.md`,
ce qui est explicitement hors périmètre de ce gate. Gate 2 requiert une
validation explicite.

## 1. Référence exacte

- Dépôt : `openaxcloud/vibecore`, branche principale `main`.
- SHA fourni : `6c1589229fb9131adb15f4ec1416629ebb8ac596`.
- SHA réel de `main` au démarrage et SHA audité :
  `8a93e995b37de513a142acaf41fed364787c5e4e`, neuf commits plus récent.
- Worktree détaché propre : `/private/tmp/vibecore-gate1.6gpjnH/repo`.
- `origin/main` a encore avancé de 24 commits pendant l'audit, jusqu'à
  `65f52894ebb3b2d763c5241355bafb89e034675c`; ce rapport ne s'y applique pas.
- Le SHA audité n'a aucun check-run/status/run CI. Les runs verts appartiennent
  au parent `d3081c34…`; le déploiement de ce parent a été annulé.

Les commandes, PR concurrentes, hashes et distinctions SHA code/document sont
dans [REPOSITORY_BASELINE.md](./REPOSITORY_BASELINE.md) et
[EVIDENCE_MANIFEST.yaml](./EVIDENCE_MANIFEST.yaml).

## 2. Baseline concurrentielle datée

Consultation : **2026-08-07**, sources officielles uniquement.

Le périmètre Replit est figé par sa documentation officielle sur le
[Project Editor](https://docs.replit.com/learn/projects-and-artifacts/project-editor),
les [imports](https://docs.replit.com/build/import-from-providers), le
[version control](https://docs.replit.com/learn/projects-and-artifacts/version-control),
les [checkpoints](https://docs.replit.com/references/version-control/checkpoints-and-rollbacks),
la [publication](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments),
les [secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets),
le [stockage objet](https://docs.replit.com/references/data-and-storage/object-storage)
et les [workspaces](https://docs.replit.com/references/collaboration/workspaces).

Le périmètre Cursor est figé par ses documentations officielles sur les
[modes Agent](https://docs.cursor.com/en/agent/modes),
[Background Agents](https://docs.cursor.com/background-agent),
[Inline Edit](https://docs.cursor.com/en/inline-edit/overview), les
[outils](https://docs.cursor.com/en/agent/tools), les
[rules](https://docs.cursor.com/context/rules),
[MCP](https://docs.cursor.com/context/model-context-protocol), la
[confidentialité/indexation](https://docs.cursor.com/account/privacy) et
[Bugbot](https://docs.cursor.com/bugbot).

Ces sources définissent un comportement public à comparer; aucune architecture
interne concurrente n'a été déduite.

## 3. Commandes et résultats reproductibles

| Domaine | Résultat Gate 1 |
| --- | --- |
| clone/fetch/checkout | SHA exact, worktree initial propre |
| installation | 36 projets, 2 052 paquets, succès |
| Prisma | génération réussie |
| DB vierge | 85 migrations, 123 tables, vector 0.8.2, succès |
| upgrade représentatif | 84→85 migrations, seed conservé; portée limitée |
| typecheck | succès |
| lint | succès avec 48 warnings; couverture racine limitée à `app` |
| tests racine | 555 fichiers, 4 334 tests passés |
| services/build exact-SHA | partiellement bloqués par `ENFILE`; worker 37/37 |
| infra validator | **échec déterministe** sur NetworkPolicy absente |
| Helm lint/template | succès statique, 64 ressources, manifeste hashé |
| Terraform fmt/init/validate | succès statique staging/prod, aucun plan/apply |
| gitleaks | exit 1, 12 candidats redacted; drift 8.30.1 local vs 8.21.2 CI à trier |
| Playwright live | non exécuté, environnement/identités manquants |
| cluster/GCS/rollback/restore | non exécutés |

Le détail, y compris les skips, faux transferts de preuve depuis le parent et
blocages hôte, est dans
[BASELINE_TEST_REPORT.md](./BASELINE_TEST_REPORT.md). Les rouges et violations
préexistantes sont séparées dans
[PRE_EXISTING_FAILURES.yaml](./PRE_EXISTING_FAILURES.yaml).

## 4. Architecture constatée

Le dépôt contient 5 674 fichiers suivis et 36 projets pnpm. Les zones majeures
sont `app` (1 685 fichiers), `docs` (1 502), `public` (1 445), `services`
(350), `packages` (239), `apps` (114) et `infra` (105).

L'architecture actuelle est un contrôle-plane API très large entouré de
services spécialisés :

- `services/api/src/app.ts` : 34 212 lignes, environ 470 routes HTTP et 6 WS;
- workspace manager et workspace agent pour Kubernetes/fichiers/PTY;
- preview proxy, AI gateway, worker, connector proxy et screenshotter;
- `ApiStore`/Prisma partagés; schéma de 122 modèles et 85 migrations;
- plusieurs services écrivent la même base sans propriété exclusive;
- 371 identifiants d'environnement statiquement recensés et aucun registre de
  configuration typé réellement implémenté (`packages/config` est vide);
- Helm, Terraform, Cloud Build et GitHub Actions ne décrivent pas exactement le
  même ensemble de workloads ni la même topologie workspace.

Le seam à préserver est `RuntimeAdapter` avec `runtime-webcontainer` et
`runtime-remote`; l'IDE Bolt existant ne doit pas être remplacé.

Voir [REPOSITORY_MAP.md](./REPOSITORY_MAP.md),
[DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md),
[DATA_OWNERSHIP_MATRIX.yaml](./DATA_OWNERSHIP_MATRIX.yaml) et
[CONFIGURATION_REGISTRY.yaml](./CONFIGURATION_REGISTRY.yaml).

## 5. Parité comportementale

La matrice contient 23 lignes : 13 Replit et 10 Cursor. Distribution :
13 `PARTIAL`, 1 `IMPLEMENTED_UNPROVEN`, 5 `BROKEN`, 3 `ABSENT`, 1 `STUB`.
Aucune ligne n'est `PROVEN_REVIEW_PENDING` ou `SIGNED_PROVEN`.

### Replit

- Création/import : GitHub, Bitbucket, ZIP et vide sont câblés, mais un échec
  laisse potentiellement un projet cible partiel; idempotence process-local.
- Éditeur : surface riche Monaco/CodeMirror, mais aucun LSP réel; index local
  plafonné, grands dépôts et reconnexion non prouvés.
- Terminal/runtime : implémentation PTY/Kubernetes sérieuse, sans preuve live
  ANSI/signaux/isolation; suppression workspace peut marquer `DELETED` malgré
  des ressources K8s restantes.
- Preview : HTTP/WS/ports existent, mais contrôle privé/tenant désactivé et
  lookup fail-open.
- Collaboration : présence/commentaires existent; édition documentaire et
  curseurs annoncés ne sont pas câblés. Modèle actuel = document entier +
  version optimiste, ni CRDT ni OT.
- Secrets : chiffrement partiel, mais variables/secrets peuvent revenir au
  navigateur et les usages ne sont pas séparés.
- Données/storage : provisionnement présent; restauration DB sans cutover,
  stockage limité à 1 000 objets par purge, disparition non prouvée.
- Publication : static/server/queue/readiness/rollback existent; domaines/TLS
  privé et artefact reproductible lié à HEAD ne sont pas démontrés.

### Cursor

- complétion IA inline : absente; les suggestions observées sont lexicales;
- Ask : lecture seule non imposée par une frontière d'exécution;
- contexte : pas d'index dépôt durable/incrémental lié à branche/HEAD;
- boucle autonome : pas de boucle robuste observation→diagnostic→correction;
- diff : fichier/hunk présents, mais review désactivée par défaut et conflits
  même fichier last-write-wins;
- agents de fond : absents; agents parallèles = lanes JSON synchrones, pas des
  worktrees/branches/commits;
- rules/skills/MCP : partiels, permissions/intégrité/timeout/audit incomplets;
- revue PR automatisée : absente.

La source détaillée, chaque UI/API/symbole/test et les références officielles
sont dans [PARITY_MATRIX.yaml](./PARITY_MATRIX.yaml). `REPLIT_PARITY.md` reste
la source de suivi existante pour son sous-périmètre Gallery/import/remix; ses
preuves historiques n'ont pas été promues.

## 6. Gaps et risques bloquants

Le registre consolidé contient 30 gaps (6 P0, 23 P1, 1 P2) et 24 risques
(6 P0, 18 P1). Il classe les violations par invariant et non par simple
présence de code. Les P0 sont :

1. réservation/settlement ledger non atomique sous concurrence/crash;
2. grant Stripe duplicable après panne partielle/rejeu;
3. rollback statique pouvant servir des octets destination non vérifiés avec
   le digest source;
4. preview privée/inter-tenant fail-open;
5. mode Ask pouvant exécuter une mutation fichier/shell;
6. valeurs secrètes exposables au navigateur ou stockées sans frontière de
   secret adaptée.

Les P1 majeurs couvrent metering, quotas, secrets manquants fail-open, SSRF
DNS-rebinding, export sensible, isolation live absente, admission Kyverno,
purges compte/projet/workspace, GCS, collaboration Redis/reconnect,
observabilité, capacité, restauration réelle, supply chain, restauration DB,
import, publication reproductible et scan de secrets reproductible.

Voir [GAP_REGISTER.yaml](./GAP_REGISTER.yaml),
[RISK_REGISTER.yaml](./RISK_REGISTER.yaml) et
[SECURITY_THREAT_MODEL.md](./SECURITY_THREAT_MODEL.md).

## 7. Données, fiabilité, capacité et exploitation

- Aucun RTO/RPO mesuré au SHA exact.
- Le backup dry-run du dépôt n'est pas une restauration Postgres/PVC/GCS.
- `/ready` vérifie DB/Redis, mais un endpoint synthétique est constant et les
  métriques sont principalement process-local.
- Les alert rules ne sont pas démontrées comme déployées; des valeurs Terraform
  restent placeholders.
- Aucun SLO existant n'est adopté comme fait. Le plan propose des cibles à
  valider seulement après mesure.
- Les pannes Redis/Postgres/GCS/nœud/zone/fournisseur IA, retry storms, poison
  jobs et saturation n'ont pas été exercés.

Voir [SLO_AND_CAPACITY_PLAN.md](./SLO_AND_CAPACITY_PLAN.md) et
[DISASTER_RECOVERY_REPORT.md](./DISASTER_RECOVERY_REPORT.md).

## 8. Accessibilité et qualité produit

Playwright déclare desktop/tablette/mobile et les surfaces ont de nombreux
états de chargement/récupération, mais aucun audit Axe complet exact-SHA n'a été
trouvé. L'i18n reste partielle et des branches EN/FR sont concurrentes. Aucun
point design, bug ou parité n'est passé en `✅ Testé live` par cet audit : les
preuves écran web/tablette/mobile n'ont pas été rejouées.

## 9. Architecture cible proposée

Décision proposée : modulariser d'abord le monolithe, sans big bang ni split
microservices prématuré.

1. préserver Bolt, Workbench et `RuntimeAdapter`;
2. définir les contextes identity/access, organizations/RBAC,
   projects/imports/git, IDE/collab, workspaces/runtime, agent/AI,
   connectors/secrets, database/storage, deployments/releases,
   billing/ledger et admin/audit/observability;
3. assigner chaque table à un seul propriétaire tout en gardant initialement un
   Postgres physique partagé;
4. contracter HTTP, WS et queues (OpenAPI/JSON Schema/AsyncAPI), erreurs,
   idempotence et compatibilité;
5. introduire outbox transactionnelle et consommateurs idempotents;
6. typer la configuration par service et réduire secrets/identités/network;
7. réconcilier la topologie cluster et couvrir chaque workload dans CI/CD.

Dépendances interdites : UI→DB, écritures directes dans les tables d'un autre
domaine, mutation K8s hors manager, provider IA hors gateway, credentials
durables dans le navigateur, statut `READY` sans ressource vérifiée, migrations
concurrentes et contrats centraux édités par plusieurs lots.

Voir [ARCHITECTURE_DECISION.md](./ARCHITECTURE_DECISION.md) et
[CONTRACT_REGISTRY.yaml](./CONTRACT_REGISTRY.yaml).

## 10. Plan incrémental et rollback

Le DAG proposé va de M0 (baseline) à M10 (canary/contre-audit) : gouvernance et
contrats, façades, modules, propriété/outbox, runtime, agent/connecteurs,
secrets/policies, CI/supply-chain, éventuelle séparation physique, puis preuves
live. Chaque étape garde un rollback, des flags et des tests de frontière.

Voir [MIGRATION_DAG.md](./MIGRATION_DAG.md) et
[ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md).

## 11. Découpage exact des agents

Douze lots committables sont proposés : gouvernance/contrats,
config/secrets, modularisation API, propriété des données, runtime, IDE,
Agent/IA, connecteurs, deployment/storage, billing, infra/CI et
QA/contre-audit. Chaque lot fixe SHA de base, fichiers autorisés/interdits,
contrats, migrations, tests, preuves, dépendances, propriétaire et reviewer.

Les fichiers centraux `services/api/src/app.ts`, schéma/migrations Prisma,
contrats générés, manifests Helm, workflows et registres ne peuvent jamais être
édités en parallèle sans propriétaire unique.

Voir [AGENT_WORK_PACKAGES.yaml](./AGENT_WORK_PACKAGES.yaml).

## 12. Preuves manquantes pour sortir de NOT_READY

Gate 2 doit d'abord établir les contrats et garde-fous. Gate 3 devra ensuite
fermer les invariants P0 avec tests déterministes. Les dépendances de preuve à
préparer, sans utiliser la production, sont :

- Postgres/CNPG éphémère avec concurrence, fault injection, PITR, cutover et
  rollback;
- cluster Kubernetes de test, gVisor/policies, perte pod/nœud/manager,
  suppression et GC;
- bucket GCS éphémère, plus de 1 000 objets, échec partiel, purge concurrente
  et constat de disparition avant teardown;
- ingress-nginx/reverse proxy réel, previews HTTP/WS/SSE multi-tenant et
  autorisation indisponible fail-closed;
- navigateurs Playwright multi-utilisateurs, desktop/tablette/mobile,
  collaboration concurrente, a11y, diff/reject et mode Ask hostile;
- Stripe/test identities pour double livraison et panne partielle;
- build exact-SHA, SBOM, scan, signature/provenance, admission par digest,
  endpoint, logs, readiness et rollback réel;
- charge contrôlée, traces end-to-end, alertes et drills RTO/RPO;
- contre-audit indépendant repartant du SHA de résultat.

## 13. Index des livrables

| Livrable demandé | Artefact |
| --- | --- |
| baseline Git / commandes | [REPOSITORY_BASELINE.md](./REPOSITORY_BASELINE.md) |
| manifeste de preuves | [EVIDENCE_MANIFEST.yaml](./EVIDENCE_MANIFEST.yaml) |
| cartographie physique/logique | [REPOSITORY_MAP.md](./REPOSITORY_MAP.md) |
| graphe de dépendances | [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) |
| propriété des données | [DATA_OWNERSHIP_MATRIX.yaml](./DATA_OWNERSHIP_MATRIX.yaml) |
| configuration | [CONFIGURATION_REGISTRY.yaml](./CONFIGURATION_REGISTRY.yaml) |
| baseline tests | [BASELINE_TEST_REPORT.md](./BASELINE_TEST_REPORT.md) |
| échecs préexistants | [PRE_EXISTING_FAILURES.yaml](./PRE_EXISTING_FAILURES.yaml) |
| parité Replit + Cursor | [PARITY_MATRIX.yaml](./PARITY_MATRIX.yaml) |
| gaps / risques | [GAP_REGISTER.yaml](./GAP_REGISTER.yaml), [RISK_REGISTER.yaml](./RISK_REGISTER.yaml) |
| contrats / architecture cible | [CONTRACT_REGISTRY.yaml](./CONTRACT_REGISTRY.yaml), [ARCHITECTURE_DECISION.md](./ARCHITECTURE_DECISION.md) |
| sécurité | [SECURITY_THREAT_MODEL.md](./SECURITY_THREAT_MODEL.md) |
| SLO / capacité / coûts | [SLO_AND_CAPACITY_PLAN.md](./SLO_AND_CAPACITY_PLAN.md) |
| DR | [DISASTER_RECOVERY_REPORT.md](./DISASTER_RECOVERY_REPORT.md) |
| migration / rollback | [MIGRATION_DAG.md](./MIGRATION_DAG.md), [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) |
| lots agents / fichiers / tests | [AGENT_WORK_PACKAGES.yaml](./AGENT_WORK_PACKAGES.yaml) |

## 14. Gate suivant

Décision finale Gate 1 : **NOT_READY**.

Si ce Gate 1 est validé, le seul passage autorisé est **Gate 2 — contrats et
garde-fous**. Il ne doit pas inclure de refonte ni de déploiement production.
Les P0 restent bloquants jusqu'à correction, preuve externe sur SHA exact et
contre-audit indépendant.
