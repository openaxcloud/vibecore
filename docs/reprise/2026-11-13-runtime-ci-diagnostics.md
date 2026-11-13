# Runtime client : échec réel et diagnostic du banc

## Observation du 13 novembre

Run `43365144712`, head `b381e94e9fe0afe9551153a52cf5836481a69318` :
le workflow E2E Runtime affiche success mais son job `131687681418` est en failure
(`continue-on-error: true`). Playwright exécute 18 scénarios : 17 failed,
1 did not run, délai global de 3 600 secondes atteint. Ce n'est pas une preuve
positive du parcours inscription → génération → exécution → sauvegarde → publication.

Le premier scénario, `critical-paths.spec.ts:48`, franchit inscription locale,
création projet et import ZIP (assertions HTTP), puis ne trouve jamais le bouton
Workspace: running. Les répétitions échouent au même endroit. Cela ne prouve pas
à lui seul un bug du manager : le workflow ne lance que PostgreSQL, Redis,
Mailpit, API, web et admin. Il ne démarre ni manager ni pod workspace.

Le bundle `playwright-report-runtime` (artefact `14012594170`, 587 929 913 octets)
est supérieur au plafond de téléchargement du connecteur (536 870 912 octets).
Les traces et journaux détaillés de ce run n'ont donc PAS été lus. Ne pas attribuer
un code HTTP précis aux échecs sans cette preuve. Les secrets fournisseur IA sont
référencés et masqués dans le job ; leur présence n'atteste ni validité ni quota.

## Correction de diagnostic

- Un préflight GET /health API + manager échoue avant le build navigateur coûteux
  si les services nécessaires sont absents. L'URL manager suit exactement
  `WORKSPACE_MANAGER_URL` ou le défaut API hors production `http://127.0.0.1:3010`.
  Ce banc accepte seulement HTTP loopback, sans credentials, query ou redirection.
- Son succès ne prouve ni provisioning, ni pod Ready, ni exécution/preview/publication.
  Les scénarios ne sont pas remplacés par des mocks et le job reste non bloquant.
- Un artefact léger séparé contient uniquement des codes fermés et des compteurs
  extraits du dernier Mio de chaque journal API/web/admin/manager/préflight.
  Aucun texte libre, URL, credential, corps HTTP ou contenu client n'est exporté
  par ce nouveau collecteur. Les journaux absents et la troncature sont explicites.
  L'artefact historique de traces reste inchangé ; son contenu n'est pas certifié
  exempt de secrets par ce lot. Les codes absents ne prouvent pas la santé.
- Tests déterministes, contrôle TypeScript strict et lint ciblé requis. Aucun test
  navigateur, manager réel ou parcours complet n'est revendiqué par ces contrats.

## Plus petit chemin réel déjà présent, non exécuté

`scripts/validate-runtime-api-kubernetes.ts` passe par l'API et le manager réels,
crée une identité/projet de recette, attend un pod et vérifie fichiers, commandes,
terminal, preview, snapshots, export/import et arrêt. Il ne prouve pas la génération
IA ni toute la publication. Il nécessite un contexte Kubernetes de TEST identifié,
un manager existant, gVisor, un nœud sandbox, stockage/PVC et image agent disponible.

Le banc audit historique est documenté dans `docs/audit/TEST_ENV_RUNBOOK.md` :
projet `vibecore-audit-test-20260807`, cluster `vibecore-audit-cluster`, zone
`europe-west9-a`, namespace `workspaces`. Sa disponibilité actuelle et les droits
ne sont PAS attestés ici. Aucun nouveau compte, clé, cluster ou ressource payante
n'a été créé. Ne pas remplacer le contexte test par la production.

Le workflow `staging-runtime-validation.yml` existe mais son script
`validate-remote-kubernetes-runtime.ts` insère un bridge pour start/stop/restart :
il prouve des opérations agent, pas l'intégralité API + manager. Il peut supprimer
les ressources portant son identifiant fixe ; ne pas le lancer aveuglément.

Dans cet exécuteur : Docker absent, WebKit absent, Chromium installé mais démarrage
refusé par socket EPERM, y compris après une tentative d'escalade. Aucun résultat
mobile/Safari actuel n'est déduit du canari iOS ciblé de la CI, ni des trois formats
Chromium de la recette du 21 octobre. Le prérequis pour la suite reste l'accès
opérateur déjà autorisé au banc isolé et à son manager, sans nouveaux frais/secrets.
