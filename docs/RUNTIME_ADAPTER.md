# RuntimeAdapter

## Objectif

`RuntimeAdapter` isole l'IDE Bolt du runtime d'execution. L'IDE conserve son UX, son editeur, son file explorer, son terminal, sa preview et le chat IA, mais le runtime peut etre WebContainer en local/dev/fallback ou un runtime distant Kubernetes en production SaaS.

## Packages

- `packages/runtime-contract` definit le contrat stable: `RuntimeAdapter`, `WorkspaceSession`, `FileNode`, `FileChange`, `CommandRequest`, `CommandEvent`, `TerminalSession`, `WorkspacePort`, `PreviewRoute`, `Snapshot`, `RuntimeError`, `RuntimeCapability`.
- `packages/runtime-webcontainer` encapsule l'API WebContainer existante derriere `WebContainerRuntimeAdapter`. Il expose aussi le bootstrap navigateur, le module connect historique et les types structurels (`WebContainerLike`, `WebContainerProcessLike`) pour retirer les imports directs a `@webcontainer/api` de l'app Bolt.
- `packages/runtime-remote` ajoute `RemoteKubernetesRuntimeAdapter`, qui appelle l'API backend et utilise des WebSockets pour terminal, logs et file watch.

## Mode runtime

Le flag supporte:

```bash
RUNTIME_MODE=webcontainer
RUNTIME_MODE=remote-kubernetes
VITE_RUNTIME_MODE=webcontainer
VITE_RUNTIME_MODE=remote-kubernetes
```

Regles:

- local/dev garde `webcontainer` par defaut pour preserver le comportement actuel de bolt.diy;
- production commerciale doit definir `RUNTIME_MODE=remote-kubernetes`;
- WebContainer reste disponible pour local/dev/fallback licencie;
- `VITE_SAAS_COMMERCIAL=true` en production choisit `remote-kubernetes` si `RUNTIME_MODE` n'est pas defini explicitement.

## Integration app web

Le point d'entree cote app est `app/lib/runtime/RuntimeAdapterProvider.tsx`.

- `RuntimeAdapterProvider` expose l'adapter via React context.
- `useRuntimeAdapter()` donne acces au contrat.
- `createRuntimeAdapter()` choisit `WebContainerRuntimeAdapter` ou `RemoteKubernetesRuntimeAdapter`.
- `runtimeAdapter` fournit une instance partagee pour les points d'integration non React.

La facade historique `app/lib/webcontainer/index.ts` reste en place pour ne pas casser les composants Bolt existants. L'import reel de `@webcontainer/api` est centralise dans `packages/runtime-webcontainer`; l'app ne l'importe plus directement.

En mode `remote-kubernetes`, l'adapter recupere automatiquement le token runtime via `app/routes/api.runtime-token.ts` quand aucun token explicite n'est present dans `localStorage`. Cela permet au frontend de consommer `/api/runtime` avec la session SaaS existante.

## Deuxieme passe d'integration

Les points suivants consomment maintenant `RuntimeAdapter` directement, sans importer la facade WebContainer:

- `app/lib/stores/files.ts`: operations fichiers, creation de dossiers, suppression, watch files.
- `app/lib/stores/terminal.ts` et `app/utils/shell.ts`: terminal interactif via `openTerminal`, resize et kill session.
- `app/lib/stores/previews.ts`: ports et preview URLs via `watchPorts`, `listPorts`, `getPreviewUrl`.
- `app/lib/runtime/action-runner.ts`: actions IA fichier/shell/build via `RuntimeAdapter`.
- `app/components/workbench/Search.tsx`: recherche via `searchFiles`.
- `app/lib/hooks/useGit.ts`: filesystem isomorphic-git backed par `RuntimeAdapter`.
- `app/components/deploy/*Deploy.client.tsx`: collecte des fichiers deployables via `RuntimeAdapter`.
- `app/lib/persistence/useChatHistory.ts`: restore snapshot via `RuntimeAdapter`.

Les dependances WebContainer restantes dans l'app sont volontairement limitees a des façades et routes de compatibilite, sans import direct de `@webcontainer/api`:

- `app/lib/webcontainer/index.ts`: facade de boot qui appelle `packages/runtime-webcontainer`.
- `app/lib/webcontainer/auth.client.ts`: shim d'auth WebContainer historique qui appelle `packages/runtime-webcontainer`.
- `app/routes/webcontainer.*`: routes de compatibilite preview/connect conservees pour l'UX Bolt existante.
- `app/components/workbench/Preview.tsx`: ouvre directement les URLs remote et n'utilise `/webcontainer/preview/*` que pour les URLs WebContainer historiques.

## API backend attendue pour remote-kubernetes

`RemoteKubernetesRuntimeAdapter` attend les endpoints suivants sous `RUNTIME_API_BASE_URL` ou `VITE_RUNTIME_API_BASE_URL`:

- `POST /runtime/boot`
- `POST /workspaces`
- `GET /workspaces/:id/status`
- `POST /workspaces/:id/stop`
- `POST /workspaces/:id/restart`
- `GET /workspaces/:id/files?path=...`
- `GET /workspaces/:id/files/read?path=...`
- `POST /workspaces/:id/files`
- `POST /workspaces/:id/directories`
- `PUT /workspaces/:id/files/write`
- `DELETE /workspaces/:id/files?path=...`
- `POST /workspaces/:id/files/move`
- `POST /workspaces/:id/files/search`
- `POST /workspaces/:id/patch`
- `POST /workspaces/:id/commands`
- `GET /workspaces/:id/processes`
- `POST /workspaces/:id/processes/:processId/kill`
- `GET /workspaces/:id/ports`
- `GET /workspaces/:id/preview/:port`
- `POST /workspaces/:id/snapshots`
- `POST /workspaces/:id/snapshots/:snapshotId/restore`
- `GET /workspaces/:id/export?path=...`
- `POST /workspaces/:id/import?targetPath=...`

WebSockets:

- `/workspaces/:id/terminal`
- `/workspaces/:id/commands/stream`
- `/workspaces/:id/files/watch`
- `/workspaces/:id/ports/watch`
- `/workspaces/:id/logs`

L'authentification passe par `Authorization: Bearer <token>` pour HTTP et `?token=<token>` pour WebSocket.

## Validation reelle Kubernetes

La validation non simulee se lance avec:

```bash
KUBECONFIG=/tmp/vibecore-runtime-api-k3s.yaml \
RUNTIME_API_E2E_NAMESPACE=workspaces \
RUNTIME_API_E2E_AGENT_PORT=18081 \
pnpm run runtime:validate:api-kubernetes
```

Ce script passe par `services/api`, cree un utilisateur et un projet persistants, demarre le workspace via `services/workspace-manager`, attend le Pod Kubernetes, port-forward le service du `workspace-agent`, puis valide fichiers, patch, commande, terminal WebSocket, preview, snapshot et zip import/export via `RemoteKubernetesRuntimeAdapter`.

## IDE Bolt a conserver absolument

- Editeur CodeMirror et panneaux `app/components/workbench/*`
- File explorer `FileTree`, `FileBreadcrumb`, `Search`
- Terminal `Terminal`, `TerminalManager`, `TerminalTabs`
- Preview `Preview`, `PreviewsStore`, routes `webcontainer.preview.*`
- Chat IA et stores `app/lib/stores/chat.ts`, streaming, parser d'actions
- Actions IA de fichiers et shell dans `app/lib/runtime/action-runner.ts`
- Stores Bolt `workbench`, `files`, `editor`, `terminal`, `previews`
- Integrations deploy GitHub/GitLab/Netlify/Vercel
- Scripts Electron existants

## Risques et garde-fous

- Les stores et flows critiques ne doivent pas reintroduire `~/lib/webcontainer`; les nouveaux acces runtime passent par `RuntimeAdapterProvider` ou l'instance partagee `runtimeAdapter`.
- Le terminal interactif depend encore des sequences OSC de `/bin/jsh`; tout runtime distant doit les reproduire ou adapter `BoltShell`.
- La preview depend des evenements `server-ready` et `port`; le backend remote doit emettre des etats equivalents.
- Les actions IA ecrivent les fichiers pendant le streaming; file sync distant doit etre transactionnel et idempotent.
- Les imports directs a `@webcontainer/api` ne doivent pas revenir hors de `app/lib/webcontainer/*` et des routes de compatibilite WebContainer.
