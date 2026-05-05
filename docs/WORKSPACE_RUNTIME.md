# Workspace Runtime Kubernetes

Ce document décrit le runtime Kubernetes ajouté autour de l'IDE Bolt existant. L'objectif est de lancer chaque workspace utilisateur dans un Pod isolé, piloté par `services/workspace-manager`, avec `services/workspace-agent` dans le Pod.

## Composants

- `services/workspace-manager`: control plane applicatif. Il crée les records workspace, génère les manifests Kubernetes, démarre/arrête/redémarre/supprime les workspaces, stream les logs et publie des événements de cycle de vie.
- `services/workspace-agent`: API interne exécutée dans chaque Pod workspace. Elle force le working directory à `/workspace` et expose fichiers, commandes, terminal WebSocket, processus, ports, snapshots et métriques.
- `packages/k8s-client`: construction testable des objets Kubernetes workspace: PVC, Secret, Pod, Service, RuntimeClass, ResourceQuota, LimitRange et NetworkPolicies.
- `packages/workspace-sdk`: types partagés et token signé court terme pour authentifier les appels manager/proxy vers l'agent.
- `infra/helm/workspaces-runtime`: chart Helm du namespace runtime.
- `infra/kubernetes/workspaces-runtime`: manifests statiques équivalents pour review ou bootstrap.

## Cycle de vie

1. L'API SaaS demande au `workspace-manager` de démarrer un workspace pour `orgId`, `projectId`, `workspaceId`.
2. Le manager crée un record workspace dans son `WorkspaceStore`. L'implémentation actuelle fournit `InMemoryWorkspaceStore`; en production, elle doit être remplacée par un store Prisma branché sur `Workspace` / `WorkspaceSession`.
3. Le manager crée un PVC par projet (`pvc-${projectId}`).
4. Le manager crée un Secret contenant le secret de vérification agent et uniquement les secrets explicitement autorisés.
5. Le manager crée un Pod `workspace-${workspaceId}` avec labels complets `orgId`, `projectId`, `workspaceId`.
6. Le Pod lance `workspace-agent`, monte le PVC sur `/workspace`, utilise `runtimeClassName: gvisor`, et applique les requests/limits selon le plan.
7. Le manager crée un Service interne par workspace.
8. Le manager attend la readiness puis publie `workspace.running`.
9. Stop/restart/delete/GC/auto-sleep sont gérés par le manager.

## Politiques par plan

Les ressources par défaut sont définies dans `packages/k8s-client/src/index.ts`:

- `free`: 250m/512Mi request, 1 CPU/1Gi limit.
- `pro`: 500m/1Gi request, 2 CPU/4Gi limit.
- `enterprise`: 1 CPU/2Gi request, 4 CPU/8Gi limit.

## Points d'intégration production

- Remplacer `InMemoryWorkspaceStore` par un store Prisma dans `services/workspace-manager`.
- Remplacer `MockWorkspaceK8sClient` par un client Kubernetes réel utilisant l'API Kubernetes du cluster.
- Brancher les événements `InMemoryEventBus` vers Redis/BullMQ ou un bus durable.
- Brancher `preview-proxy` sur les Services workspace et sur `getPreviewUrl` du RuntimeAdapter remote.
- Brancher `RemoteKubernetesRuntimeAdapter` sur `workspace-manager` + `workspace-agent`.

## Non-régression Bolt

Ce runtime est ajouté en périphérie. Il ne supprime aucun composant Bolt IDE, ne remplace pas l'éditeur, le terminal, le preview, le chat IA, ni WebContainer. L'intégration finale doit rester derrière `RuntimeAdapter`.
