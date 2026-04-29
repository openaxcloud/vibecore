# Plan de remplacement runtime

Objectif : remplacer progressivement la dependance directe a WebContainer par une abstraction runtime, tout en conservant l'IDE Bolt et le comportement actuel. Ce plan ne migre pas encore le code; il definit la cible.

## Decision d'architecture

Introduire un `RuntimeAdapter` avec deux implementations :

- `WebContainerRuntimeAdapter` : conserve le comportement actuel et delegue a `@webcontainer/api`.
- `RemoteKubernetesRuntimeAdapter` : ajoute un runtime distant isole, base sur Kubernetes.

Feature flag :

```text
RUNTIME_MODE=webcontainer|remote-kubernetes
```

Regles :

- En production commerciale, `remote-kubernetes` est le defaut.
- WebContainer reste disponible uniquement pour local/dev/fallback licencie.
- Le mode WebContainer ne doit pas etre supprime.
- Le mode distant ne doit pas changer l'IDE Bolt.

## Contrat RuntimeAdapter propose

Le contrat doit couvrir les usages reels observes dans le code :

```ts
export type RuntimeMode = 'webcontainer' | 'remote-kubernetes';

export interface RuntimeAdapter {
  mode: RuntimeMode;
  workdir: string;

  fs: RuntimeFileSystem;

  boot(): Promise<void>;
  spawn(command: string, args?: string[], options?: RuntimeSpawnOptions): Promise<RuntimeProcess>;
  watchPaths(config: RuntimeWatchConfig, callback: RuntimeWatchCallback): Promise<RuntimeWatchHandle> | RuntimeWatchHandle;
  onServerReady(callback: (port: number, url: string) => void): RuntimeUnsubscribe;
  onPort(callback: (port: number, type: 'open' | 'close', url: string) => void): RuntimeUnsubscribe;
  setPreviewScript?(script: string): Promise<void>;
  dispose?(): Promise<void>;
}

export interface RuntimeFileSystem {
  readFile(path: string, encoding?: 'utf-8'): Promise<string | Uint8Array>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string, options?: { withFileTypes?: boolean }): Promise<any[]>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
}

export interface RuntimeProcess {
  input: WritableStream<string>;
  output: ReadableStream<string>;
  exit: Promise<number>;
  resize?(size: { cols: number; rows: number }): void;
  kill?(): void;
}
```

Les noms exacts peuvent evoluer, mais le contrat doit rester centre sur les usages actuels, pas sur une reecriture de l'IDE.

## WebContainerRuntimeAdapter

Responsabilites :

- Wrapper `WebContainer.boot`.
- Exposer `workdir`.
- Deleguer `fs.*` a `webcontainer.fs`.
- Deleguer `spawn` a `webcontainer.spawn`.
- Deleguer `watchPaths` a `webcontainer.internal.watchPaths`.
- Convertir `webcontainer.on('server-ready')` et `webcontainer.on('port')`.
- Conserver `setPreviewScript`.
- Garder les routes WebContainer preview/connect tant que le mode existe.

Fichiers sources actuels a encapsuler :

- `app/lib/webcontainer/index.ts`
- `app/lib/webcontainer/auth.client.ts`
- `app/routes/webcontainer.preview.$id.tsx`
- `app/routes/webcontainer.connect.$id.tsx`

## RemoteKubernetesRuntimeAdapter

Responsabilites proposees :

- Creer ou rattacher un workspace distant par chat/projet.
- Fournir une API FS equivalente a `RuntimeFileSystem`.
- Fournir un terminal PTY via websocket.
- Executer les commandes shell/start/build dans un pod isole.
- Exposer les ports preview via proxy HTTPS.
- Emettre des events equivalents a `server-ready` et `port`.
- Streamer les changements fichiers vers le client.
- Nettoyer les workspaces inactifs.

Composants backend probables :

- Runtime API HTTP pour FS, workspace lifecycle, metadata.
- Gateway websocket pour terminal, process IO et file watch.
- Preview proxy pour mapper `{workspaceId, port}` vers une URL publique.
- Controller Kubernetes pour pods, PVC/ephemeral volumes, quotas, TTL.
- Auth/session liant chat utilisateur et workspace.

## Factory runtime

Une factory doit centraliser le choix :

```ts
export function getRuntimeMode(env: ImportMetaEnv | Record<string, string>): RuntimeMode {
  const requested = env.RUNTIME_MODE || env.VITE_RUNTIME_MODE;

  if (requested === 'webcontainer' || requested === 'remote-kubernetes') {
    return requested;
  }

  if (env.NODE_ENV === 'production' && env.COMMERCIAL_DEPLOYMENT === 'true') {
    return 'remote-kubernetes';
  }

  return 'webcontainer';
}
```

Note : le code exact devra respecter l'exposition env Vite/Remix. Aujourd'hui `vite.config.ts` expose surtout les variables prefixees `VITE_` et quelques base URLs providers. Il faudra donc definir clairement quelles variables sont serveur-only et quelles variables sont client-safe.

## Points d'integration a adapter

Ordre recommande :

1. Ajouter les interfaces runtime sans modifier le comportement.
2. Implementer `WebContainerRuntimeAdapter`.
3. Remplacer les types/imports directs dans `FilesStore`.
4. Remplacer les types/imports directs dans `TerminalStore` et `app/utils/shell.ts`.
5. Remplacer les types/imports directs dans `PreviewsStore`.
6. Remplacer les types/imports directs dans `ActionRunner`.
7. Adapter `workbenchStore` pour recevoir la factory/adaptateur.
8. Adapter deploy/export/git hooks.
9. Ajouter `RemoteKubernetesRuntimeAdapter`.
10. Ajouter selection via `RUNTIME_MODE`.

Fichiers prioritaires :

- `app/lib/stores/workbench.ts`
- `app/lib/stores/files.ts`
- `app/lib/stores/terminal.ts`
- `app/lib/stores/previews.ts`
- `app/lib/runtime/action-runner.ts`
- `app/utils/shell.ts`
- `app/lib/hooks/useGit.ts`
- `app/components/deploy/NetlifyDeploy.client.tsx`
- `app/components/deploy/VercelDeploy.client.tsx`

## Preview distante

WebContainer fournit aujourd'hui des URLs `*.local-credentialless.webcontainer-api.io`. Le runtime distant doit fournir un equivalent :

- URL stable par workspace + port.
- HTTPS obligatoire en production.
- Isolation par utilisateur/session.
- Support refresh iframe.
- Support erreurs preview ou alternative a `setPreviewScript`.
- Support stockage local si l'app preview en depend.

Le composant `Preview.tsx` doit continuer a consommer une liste de `{ port, ready, baseUrl }`.

## Terminal distant

Le terminal actuel depend de `/bin/jsh` et de codes OSC. Pour eviter une regression, deux options existent :

- Emuler les signaux attendus par `BoltShell` dans l'adapter distant.
- Introduire un `RuntimeShellSession` qui fournit directement `executeCommand`, `interactiveInput`, `resize`, `output`.

La seconde option est plus propre, mais doit etre introduite sans changer l'UI `Terminal.tsx`/`TerminalTabs.tsx`.

## Filesystem distant

Le FS distant doit garantir :

- Ecritures atomiques suffisantes pour actions IA.
- Watch avec contenu ou lecture rapide apres event.
- Detection binaire equivalente.
- Conservation des locks cote client.
- Suppression recursive fiable.
- Chemins normalises compatibles `/home/project`.

`FilesStore` doit rester la source de verite UI, mais ne doit plus connaitre WebContainer.

## Actions IA

`ActionRunner` doit rester le point d'execution des actions. Il doit appeler l'adapter :

- `file` -> `runtime.fs.writeFile`
- `shell` -> session shell runtime
- `start` -> session shell runtime non bloquante
- `build` -> `runtime.spawn('npm', ['run', 'build'])` ou API process equivalente
- `supabase` -> comportement actuel conserve

Le format `<boltArtifact>` / `<boltAction>` ne change pas.

## Prompts runtime-aware

Aujourd'hui les prompts expliquent WebContainer au modele. Apres introduction des adapters :

- `webcontainer` : garder les limitations WebContainer.
- `remote-kubernetes` : decrire un environnement Linux/Node distant selon l'image runtime reelle.
- Ne pas exposer Kubernetes au modele sauf si utile.
- Garder les instructions Bolt sur ecriture complete des fichiers si le parser/action runner le necessite.

Fichiers concernes :

- `app/lib/common/prompts/prompts.ts`
- `app/lib/common/prompts/new-prompt.ts`
- `app/lib/common/prompts/optimized.ts`
- `app/lib/common/prompts/discuss-prompt.ts`

## IDE Bolt a conserver absolument

Les composants suivants sont a conserver. Ils peuvent recevoir un adapter ou des props differentes, mais ne doivent pas etre supprimes ni remplaces :

- Workbench : `Workbench.client.tsx`, `EditorPanel.tsx`, `FileTree.tsx`, `FileBreadcrumb.tsx`, `Search.tsx`, `LockManager.tsx`, `DiffView.tsx`, `Preview.tsx`, `PortDropdown.tsx`, `ScreenshotSelector.tsx`, `ExpoQrModal.tsx`, `Inspector.tsx`, `InspectorPanel.tsx`.
- Terminal : `Terminal.tsx`, `TerminalTabs.tsx`, `TerminalManager.tsx`, `theme.ts`.
- Editeur : `CodeMirrorEditor.tsx`, `BinaryContent.tsx`, `EnvMasking.ts`, `languages.ts`, `cm-theme.ts`.
- Chat : `Chat.client.tsx`, `BaseChat.tsx`, `ChatBox.tsx`, `Messages.client.tsx`, `AssistantMessage.tsx`, `UserMessage.tsx`, `Artifact.tsx`, `Markdown.tsx`, `ModelSelector.tsx`, `APIKeyManager.tsx`, `StarterTemplates.tsx`.
- Stores : `workbench.ts`, `files.ts`, `editor.ts`, `terminal.ts`, `previews.ts`, `chat.ts`, `settings.ts`.
- Runtime IA : `message-parser.ts`, `enhanced-message-parser.ts`, `action-runner.ts`.

## Risques specifiques Remote Kubernetes

- Latence terminal et file watch visible dans l'UI.
- Race conditions entre stream IA, sauvegarde fichier et watch distant.
- Previews non pretes ou ports mal exposes.
- Fuites de workspace/pods si cleanup incomplet.
- Isolation insuffisante entre utilisateurs.
- Gestion des secrets providers dans des pods distants.
- Incompatibilite entre environnement Linux distant et prompts WebContainer actuels.
- Cout infra si chaque chat garde un pod actif trop longtemps.
- Rupture Electron si le mode distant suppose des APIs web absentes en desktop.

## Validation minimale

Avant d'activer `remote-kubernetes` par defaut :

- `pnpm run test`
- `pnpm run typecheck`
- `pnpm run build`
- Creation d'un projet Vite React depuis template.
- Creation/modification de fichier pendant streaming.
- `npm install && npm run dev` dans terminal Bolt.
- Preview active et rafraichie.
- Terminal interactif additionnel.
- Export zip.
- Push GitHub/GitLab si configure.
- Deploy Netlify/Vercel si configure.
- Verification mode `RUNTIME_MODE=webcontainer`.
- Verification mode `RUNTIME_MODE=remote-kubernetes`.
