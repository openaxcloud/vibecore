# Runtime CI — diagnostic du 8 novembre 2026

## Résultat

Correction locale du faux succès du workflow, pas réparation complète du runtime.
Base exacte af0ea860e8e7ca3c5cc6231143cec927f855ec97 ; branche isolée
fix/e2e-runtime-stack-20261108. #891/#892 et leurs préparations sont intactes.
Aucune publication, CI distante relancée, mutation GCP, clé créée ou IA appelée.

## Preuve distante existante

https://github.com/openaxcloud/vibecore/actions/runs/42446502089
Job128626431509 :18failed, audit IDE sauté, workflow success. Logs lus par le
connecteur GitHub ; aucune archive téléchargée. Le premier échec attend30s le
bouton /Workspace:\s*running/i et ne le trouve pas. Cela ne prouve pas à lui seul
que le serveur runtime est la cause de chaque échec.

## Trois causes distinctes

1. Stack absente : e2e-runtime.yml démarre postgres/redis/mailpit, API, web et
   admin, mais ni workspace-manager, ni workspace-agent, ni cluster local.
   services/workspace-manager/src/server.ts instancie KubectlWorkspaceK8sClient.
   services/api/src/app.ts:18553 demande réellement /v2/workspaces/start ; un
   manager absent est une erreur502, pas un runtime local de remplacement.
2. Fallback insuffisant : app.ts:19532 refuse le fallback pour background=true.
   Il ne peut pas servir le processus persistant de preview. La variable
   WORKSPACE_DEFAULT_RUNTIME_MODE (unique usage app.ts:17223) concerne les tâches
   planifiées, pas le démarrage IDE. Le script existant
   scripts/validate-runtime-api-kubernetes.ts exige un cluster accessible et
   forwarde un seul agent ; il ne provisionne pas la pile multi-workspaces CI.
3. Contrat UI ancien : BaseChat.tsx:11258 expose workspaceStatusTitle ; le catalogue
   base-chat-ast.ts:263 vaut « {status} workspace ». Les attentes « Workspace:
   running » sont incompatibles. Elles n'ont pas été relâchées/remplacées sans
   reproduction navigateur. Le scénario preview-runtime.spec.ts:226 lance une
   création IA : il nécessite une décision explicite sur son exécution sans
   dépense ou un budget ; aucun fournisseur réel n'a été appelé.

## Correctif local limité

- Supprimer continue-on-error au niveau job : rouge reste rouge, sans changer
  les gates de production ou supprimer la suite.
- Tenter l'audit IDE après une suite démarrée, même échouée ; respecter annulation
  et absence de démarrage. Ses assertions et son validateur restent inchangés.
- Retirer quatre injections de secrets fournisseurs de la nightly. Pas de faux
  fournisseur ni de réponse simulée ajoutés au produit.

Trois contre-tests échouent sur HEAD puis passent avec le correctif ; six tests
index passent. ESLint, Prettier et typage ciblé du contrat passent. L'inventaire
est régénéré depuis618fiches. Playwright --list confirme18tests/5fichiers ; cette
commande n'exécute AUCUN scénario. Logs before.log, after.log, runtime-list.log.
Le node_modules existant est réutilisé en lecture via symlink pour ces seules
validations ; aucune installation ou génération Prisma partagée n'a été lancée.

## Blocage environnement établi

Docker28.4.0 opérationnel via socket local ; aucun conteneur/volume existant.
Images disponibles : PostgreSQL17 et pgvectorPG16, plus anciennes preuves cache.
Redis, Mailpit et image workspace-agent non présents. Aucun kubectl/k3s existant.
Disque32Go, environ369Mo libres après récupération minimale du code.
Le checkout complet a réellement échoué ENOSPC dans docs/parity/baseline/snapshots ;
Git l'a supprimé automatiquement. Le checkout sparse conservé exclut seulement
les gros artefacts documentaires (sources, tests, fiches bugs conservés).
Aucune suppression d'anciens travaux, dépendances, images ou preuves effectuée.

Il faut d'abord fournir de l'espace disque pour image agent/cluster local,
services jetables et build web. Budget de préparation conseillé : plusieurs Go
(4Go au moins à confirmer avec les tailles réelles), pas une mesure de besoin
exact. Le nettoyage doit être ciblé et approuvé ; les images Docker totalisent
seulement742,6Mo et comprennent les bases utiles, donc un prune aveugle n'est pas
une solution. Aucun refus d'autorisation nouveau : capacité disque insuffisante.

## Suite concrète non exécutée

1. Rendre cet espace disponible sans perdre les worktrees/préparations existants.
2. Installer la pile Kubernetes locale isolée + vrai workspace-agent/manager et
   routage preview, PostgreSQL/Redis/Mailpit ; aucun contexte GCP. Réutiliser les
   contrats API du script runtime:validate:api-kubernetes, sans faux statut running.
3. Reproduire un import statique puis un vrai projet Vite ; confronter les
   sélecteurs au navigateur réel avant correction. Exécuter ensuite17parcours
   sansIA, traiter explicitement le18e, puis audit IDE et build/typage complets.
4. Publier seulement après bilan validé et coordination. Le présent commit ne
   doit pas être annoncé comme une suite runtime réparée ou une livraison.

Non exécutés :18scénarios navigateur, audit IDE réel, build web complet,
provisionnement runtime, tests production. Aucun succès production revendiqué.

## Reprise isolée dans /tmp (8 novembre)

Aucune suppression, installation, image téléchargée, modification Docker ou
ressource distante. /tmp est un tmpfs distinct : 9 415 495 680 octets disponibles
après validation, contre 386 383 872 sur le stockage overlay partagé avec Docker.
Mémoire cgroup environ 3,25 Go utilisés sur 17 179 869 184 octets ; pas de swap.
Sources et commit 9f7a2bfb conservés. Les alias de validation ciblent les packages
de ce checkout, pas leurs anciennes sources via les liens node_modules partagés.

Preuve nouvelle : 22 tests réels réussis, zéro omission, en 29,23 s :
preview-service-lifecycle (10) et debugger-process (12). Serveurs HTTP, WebSocket
authentifiés et vrais enfants Node sont utilisés avec dossiers temporaires ;
aucun fournisseur IA. Bundle agent esbuild ESM généré dans /tmp (122,7 ko + map).
Typage strict conforme au script agent (lib ES2022) réussi. ESLint lancé sur les
deux tests échoue : 59 erreurs de style préexistantes dans debugger-process.spec.ts
(imports, commentaires, espacements, accolades, nom WebSocket). Ces fichiers
produit/tests sont inchangés ; aucun --fix global ni règle désactivée. Une première configuration de typage incluait implicitement DOM
et échouait sur ReadableStream ; correction du harness pour reprendre exactement
la bibliothèque ES2022 du package, aucun changement de type produit.
Reçus et configurations : isolated-agent-20261108/.

Toujours non exécutés : 18 parcours Playwright runtime, audit IDE, build web
complet, provisioning Kubernetes, recette production. Le manager existant exige
KubectlWorkspaceK8sClient ; aucun kubectl/cluster local disponible. /tmp permet
les sorties de build mais ne déplace pas le stockage du daemon Docker. Avec
369 Mio libres, aucune construction agent/cluster n'est engagée sans budget
disque établi ; pas de simulation Kubernetes pour afficher un faux runtime prêt.
Le besoin minimal d'espace des images et couches n'a pas été mesuré, donc aucun
chiffre de nettoyage n'est garanti suffisant. Les deux anciens bundles identifiés
ne libéreraient qu'environ 170 Mo ; aucune suppression n'est exécutée.

Le correctif workflow reste partiel et local, aucune publication. Ces 22 tests
ne remplacent aucun des 18 scénarios navigateur et ne valident pas la pile IDE.
