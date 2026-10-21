# Runtime : dépendances précises — 21 octobre 2026

Diagnostic sur la base `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`, sans modification de serveur, workflow, credential, configuration de sécurité ou ressource cloud.

## Ce que signifie le 502 local

1. `GET http://127.0.0.1:3010/health` échoue à se connecter (curl code 7, HTTP 000). Aucun manager n'est lancé dans la pile locale.
2. Lancement réel de `tsx services/workspace-manager/src/server.ts`, sans inventer de secret : arrêt explicite `WORKSPACE_AGENT_TOKEN_SECRET is required` à la ligne 8.
3. Aucune variable manager/agent/Kubernetes n'est fournie ; `kubectl`, `kind`, `k3d`, `minikube` sont absents du PATH, aucun kubeconfig standard ni jeton de service-account monté. Docker ne possède que son contexte local et les conteneurs PostgreSQL/Redis/Mailpit de la recette, aucun cluster local.
4. `services/api/src/app.ts`, fonctions `workspaceManagerUrl` et `managerRequest` : hors production, le manager par défaut est `http://127.0.0.1:3010`. Une exception réseau devient `502 WORKSPACE_MANAGER_UNAVAILABLE`. Un manager joignable qui répond 401/403 produirait le code distinct `WORKSPACE_MANAGER_REQUEST_FAILED`.

**Conclusion : le 502 mesuré est expliqué par le service absent et la configuration manquante, pas par un défaut démontré du gestionnaire de pods.** Ajouter seulement l'URL ne créerait pas le service. Ajouter seulement un secret ne fournirait ni cluster, ni gVisor, ni stockage, ni image agent. Aucune de ces barrières n'a été désactivée.

La pile `docker-compose.dev.yml` ne lance que PostgreSQL, Redis, Mailpit. `dev:all` lance web/API. Le workflow `.github/workflows/e2e-runtime.yml` reconnaît lui-même l'absence de runtime provisionné : son résultat n'est pas un substitut à la preuve physique.

## Cibles existantes retrouvées, disponibilité non attestée

- Banc historique : projet GCP `vibecore-audit-test-20260807`, cluster `vibecore-audit-cluster`, zone `europe-west9-a`, namespace runtime `workspaces`. Références : `docs/audit/TEST_ENV_RUNBOOK.md`, `docs/reprise/2026-10-20-moyens-recette-existants.md`.
- GET `/health` vers `https://wsm.34.163.208.161.sslip.io` et `https://api.34.163.208.161.sslip.io` : **CONNECT 403 du proxy**, HTTP origine 000. L'origine n'a pas été atteinte. Aucun essai de contournement, aucune conclusion de disparition du cluster.
- Environnement GitHub `staging` : lecture des métadonnées variables/secrets via les accès GitHub existants refusée **403 Resource not accessible by integration**. Aucune valeur secrète lue ; aucun nouvel essai après refus.
- Seul ancien run trouvé de `staging-runtime-validation.yml` : `26521328804`, 27 mai 2026, échec, SHA `939b789e4d396a9fd32d70bbe52c6ed9335e9e07`. Journaux expirés (410). Cela ne prouve pas l'état actuel du staging.
- La session Git CLI est ensuite devenue invalide (401). Le connecteur GitHub déjà autorisé permet toujours la lecture de la PR et de ses workflows ; il ne donne pas un accès Kubernetes.

Les variables staging à résoudre sont précisément `STAGING_WORKSPACE_CLUSTER`, `GCP_PROJECT_ID`, `GCP_REGION`, plus les accès existants référencés `GCP_WORKLOAD_IDENTITY_PROVIDER`/`GCP_DEPLOY_SERVICE_ACCOUNT`. Aucun compte, secret ou projet supplémentaire n'est demandé ou créé.

## Plus petit chemin réel

Le chemin le plus court réutilise **l'API et le manager déjà déployés dans le banc isolé**, si leur présence actuelle est confirmée, plutôt que reconstruire un cluster local :

1. Depuis un exécuteur déjà autorisé à joindre les deux hôtes audit, obtenir des `/health` réels et vérifier le contexte exact `gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster`. La dépendance immédiate est l'accès réseau à ces hôtes et le contexte opérateur déjà autorisé, absents ici. Ne pas prendre le contexte de production par défaut.
2. Lire l'état du manager existant et des ressources `workspaces` : RuntimeClass `gvisor`, nœud portant `vibecore.ai/node-pool=sandbox`, capacité disponible, StorageClass/PVC et image workspace-agent taguée réellement téléchargeable. `packages/k8s-client/src/index.ts::workspacePod` impose cette isolation ; un kind standard seul n'est pas suffisant.
3. Réutiliser les secrets déjà montés côté manager : `WORKSPACE_AGENT_TOKEN_SECRET` et `WORKSPACE_MANAGER_SHARED_SECRET` partagé avec l'API. Ne pas les exporter dans le chat, ne pas en fabriquer. Le chart audit indique `WORKSPACE_MANAGER_URL=http://vibecore-vibecore-platform-workspace-manager.vibecore.svc:3010`, namespace `workspaces`, stockage `standard-rwo`. Son image `REQUIRED_OVERRIDE_AT_DEPLOY` est une exigence d'entrée, pas une image validée actuelle.
4. Pour la recette existante, utiliser `scripts/validate-runtime-api-kubernetes.ts` avec `RUNTIME_API_E2E_API_URL`, `RUNTIME_API_E2E_WORKSPACE_MANAGER_URL` ciblant ce banc et `RUNTIME_API_E2E_NAMESPACE=workspaces`. Ce script inscrit son compte jetable, crée son projet, démarre réellement via l'API, attend le pod Ready, puis vérifie fichiers/commande/terminal/preview/snapshot/export/import/arrêt. Il requiert aussi `kubectl` et le droit de lecture/wait/port-forward sur le pod/service du workspace de test. Lire son périmètre avant lancement : il crée les seules données et ressources de sa recette.
5. La publication complète demande en plus le worker réel consommant la file BullMQ, le chemin de build fonctionnel et une URL réellement servie. `QUEUED` reste une non-livraison.

**Non exécutable depuis l'environnement actuel** : réseau audit refusé, contexte Kubernetes absent, secrets manager non fournis. Aucun lancement du runbook de création GCP, aucun `terraform apply`, aucun `mint-secrets.sh`, aucun changement de pool ou de sécurité.

## Ce qui ne ferait pas cette preuve

`scripts/validate-remote-kubernetes-runtime.ts` provisionne un vrai pod, mais insère ensuite `startRuntimeBridge` : ses routes `/workspaces`, `/stop` et `/restart` renvoient une session/204 sans traverser l'API et le manager du produit. Il peut tester des opérations de l'agent ; il ne valide pas le démarrage du parcours complet. Le workflow staging appelle ce script, avec un identifiant fixe, et le script supprime au préalable pod/service/PVC/secret correspondants : il n'a pas été lancé sur une cible dont les données actuelles sont inconnues.

Chemins transmis au chantier serveur, **non modifiés** :

- `services/api/src/app.ts` : résolution URL manager et traduction des erreurs réseau.
- `services/workspace-manager/src/server.ts` : secret agent obligatoire, store, client Kubernetes et écoute 3010.
- `services/workspace-manager/src/manager.ts` : provisioning, PVC et secret du workspace.
- `packages/k8s-client/src/index.ts` : kubeconfig, gVisor, nœud sandbox, agent.
- `scripts/validate-runtime-api-kubernetes.ts` : recette API réelle.
- `scripts/validate-remote-kubernetes-runtime.ts` et `.github/workflows/staging-runtime-validation.yml` : périmètre plus limité du relais de validation.

Aucun défaut serveur n'est établi par ce seul 502 local ; aucun correctif serveur n'est proposé sans nouvelle preuve.
