# Baseline de validation — Gate 1

## Résultat

Verdict de validation : **NOT_READY**. Le code audité possède une base de
tests importante, mais le SHA exact n'a aucune CI attachée, le validateur
infrastructure échoue, plusieurs suites locales ont été bloquées par la limite
de fichiers ouverts de l'hôte, et aucune preuve critique Kubernetes, GCS,
rollback, restauration, isolation ou concurrence n'a été exécutée en réel.
Un compteur vert ne change donc aucune ligne en `SIGNED_PROVEN`.

Baseline code : `8a93e995b37de513a142acaf41fed364787c5e4e`.

## Environnement de mesure

| Élément | Valeur |
| --- | --- |
| OS | macOS 26.4.1 arm64 |
| Node local | 24.10.0 |
| Node CI déclaré | 22 |
| pnpm | 9.14.4 |
| Docker | 29.4 |
| PostgreSQL de test | conteneur éphémère dédié `vibecore-gate1-pg-8a93e995` |
| Redis de test | conteneur éphémère dédié `vibecore-gate1-redis-8a93e995` |
| Helm | 4.1.4 |
| Terraform | 1.9.8 |
| kubectl | 1.33.9 |
| kind | 0.31.0 |
| Limite de fichiers | `kern.maxfiles=30720`, presque saturée par des processus de développement externes à l'audit |

Les processus et fichiers utilisateurs non liés n'ont pas été tués ou
modifiés. Les résultats `ENFILE` sont classés `BLOCKED_HOST_RESOURCE`, pas
comme régressions du code.

## Installation, génération et base de données

| Commande / scénario | Résultat observable | Statut |
| --- | --- | --- |
| installation pnpm propre avec lock figé | 36 projets, 2 052 paquets, 11,5 s | `PASS` |
| génération Prisma | client Prisma 7.8.0 généré, aucun diff code | `PASS` |
| migrations sur DB vierge | 85 migrations, 123 tables, extension vector 0.8.2, 0 migration échouée | `PASS` |
| second passage migrations | aucune migration en attente | `PASS_IDEMPOTENCE_LIMITED` |
| upgrade représentatif | ancienne baseline `1d5c1b48d2246e5562640f46f61299ccc737a687`, 84 migrations puis `0082`, données seed conservées, 0 échec | `PASS_LIMITED` |
| rollback migration / restauration DB | non exercés | `IMPLEMENTED_UNPROVEN` |

L'upgrade prouve uniquement ce chemin récent et ces fixtures. Il ne prouve ni
la compatibilité de toutes les anciennes versions, ni un rollback, ni une
restauration point-in-time, ni le cutover applicatif.

## TypeScript, lint, tests et build

| Commande | Résultat exact | Classement |
| --- | --- | --- |
| `pnpm typecheck` | succès | `PASS` |
| `pnpm lint` | succès avec 48 avertissements `no-empty-function`; le script racine ne couvre que `app` | `PASS_WITH_WARNINGS_AND_SCOPE_RESERVE` |
| `pnpm test` | 555 fichiers, 4 334 tests passés, 61,93 s | `PASS_UNIT_BASELINE` |
| tests API complets locaux | interrompus après plus de 11 min; workers résiduels du worktree nettoyés | `INCONCLUSIVE_HOST_RESOURCE` |
| worker | 6 fichiers, 37 tests | `PASS` |
| workspace-agent | 73 passés, 2 erreurs `ENFILE` | `BLOCKED_HOST_RESOURCE` |
| ai-gateway, connector-proxy, preview-proxy, screenshotter, workspace-manager | libuv/`ENFILE` ou abandon sans résultat fiable | `BLOCKED_HOST_RESOURCE` |
| build production exact-SHA | arrêt à 498 modules sur `ENFILE` | `BLOCKED_HOST_RESOURCE` |
| E2E Playwright exact-SHA | non exécuté : build/dev-server indisponible sur cet hôte et aucune identité de test dédiée | `BLOCKED` |

Le run CI du parent `d3081c34…` donne un signal secondaire, non transférable au
SHA audité : API 1 469 tests passés et 1 ignoré, workspace-manager 84,
workspace-agent 75, ai-gateway 106, worker 37, connector-proxy 21,
preview-proxy 91, screenshotter 7, puis builds web/admin/services réussis.
Le test `agent-memory-pgvector.integration.spec.ts` y est ignoré et le build
screenshotter signale l'absence de `services/screenshotter/tsconfig.json`.

## Infrastructure déclarative

| Validation | Résultat | Classement |
| --- | --- | --- |
| `node infra/scripts/validate.mjs` | échec : `infra/kubernetes/networkpolicies/workspaces-deny-default.yaml` absent; le script exige aussi `platform-deny-default.yaml` | `BROKEN` |
| `helm lint ... -f values-prod.yaml --set global.imageTag=sha-8a93e995` | 1 chart, 0 échec | `PASS_STATIC` |
| `helm template` prod | succès; 64 ressources rendues, hash `8d4fea5edb45475a89fdfaf6e89f3722f32a9ab5058fd364f95d85ef257daa82` | `PASS_STATIC` |
| `terraform fmt -check -recursive` | succès | `PASS_STATIC` |
| `terraform init -backend=false && terraform validate` staging | succès; ajoute seulement des hashes fournisseur arm64 au lock local | `PASS_STATIC_WITH_LOCAL_LOCK_DRIFT` |
| même validation prod | succès | `PASS_STATIC` |
| `terraform plan` | non exécuté sans identifiants ni backend de test dédié | `BLOCKED_EXTERNAL_RESOURCE` |
| application Helm / policy admission | non exécutée | `BLOCKED_EXTERNAL_RESOURCE` |

Le rendu Helm contient notamment 7 Deployments et 6 NetworkPolicies. Cela ne
prouve pas que les policies sont appliquées ni efficaces sur le cluster réel.

## Sécurité, dépendances et supply chain

| Contrôle | Résultat | Classement |
| --- | --- | --- |
| gitleaks 8.30.1 worktree avec `.gitleaks.toml` et redaction | exit 1, 12 candidats redacted dans des captures HTML d'evidence/parité et un bundle public; aucune valeur incluse dans le rapport | `BROKEN_NEEDS_SECRET_TRIAGE` |
| audit dépendances local exact-SHA | registre pnpm sans réponse exploitable; arrêté proprement, code 130 | `BLOCKED_NETWORK_OR_REGISTRY` |
| Security Analysis parent | succès de workflow, mais `pnpm audit` non bloquant rapporte 141 vulnérabilités, dont des avis high | `PASS_WORKFLOW_WITH_RESERVES_WRONG_SHA` |
| SBOM | workflow parent produit un artefact; aucun SBOM recalculé et hashé pour le SHA exact | `IMPLEMENTED_UNPROVEN` |
| CodeQL/SAST | vert sur le parent uniquement | `WRONG_SHA` |
| scan images / signature / provenance | aucune image du SHA exact construite ou scannée | `BLOCKED` |
| licences | licence racine MIT; inventaire transitif non validé au SHA exact | `UNKNOWN` |

Le workflow parent épingle gitleaks 8.21.2 et était vert, tandis que le binaire
local 8.30.1 détecte ces 12 candidats. Ce drift de version doit être résolu par
un scan reproduit avec une version unique; chaque candidat doit être démontré
faux positif ou retiré, et toute valeur réelle doit être révoquée/rotée. Le
présent rapport ne reproduit aucune valeur candidate.

## Preuves live non exécutées

Les éléments suivants restent explicitement non prouvés : cluster Kubernetes
de test et pannes injectées; isolation inter-tenant et sandbox négatif;
terminal PTY réel; preview HTTP/WS/SSE privé; deux navigateurs concurrents;
Postgres/CNPG backup-restore-cutover; GCS avec plus de 1 000 objets et purge;
facturation concurrente; Stripe webhook concurrent et reprise après crash;
publication, readiness, digest, rollback réel; restauration checkpoint; charge,
RTO/RPO; mobile/tablette/desktop à l'écran; accessibilité Axe; agents de fond
et revue PR.

## Règle de lecture

- `PASS` signifie que la commande indiquée a réussi dans son périmètre étroit.
- `BLOCKED` nomme la ressource manquante et ne vaut jamais preuve.
- Une preuve du parent est une information de tendance, pas une preuve du SHA.
- Aucun test mocké, rendu statique ou statut DB `READY` n'est assimilé à un
  parcours externe réel.
