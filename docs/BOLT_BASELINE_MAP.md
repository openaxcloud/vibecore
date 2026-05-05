# Cartographie baseline du fork bolt.diy

Ce document decrit l'etat actuel du fork. Il sert de reference avant toute modification structurelle. Aucune suppression de composant Bolt, aucun remplacement de l'IDE et aucune migration runtime ne doivent etre faits sans repasser par cette cartographie.

## Vue d'ensemble

L'application est une app Remix/Vite avec rendu client pour l'IDE, APIs Remix/Cloudflare pour le chat et les providers, Electron pour le desktop, et WebContainer pour le runtime navigateur. Le coeur de l'experience Bolt est compose de trois zones couplees :

- Chat IA : `app/components/chat/*`, `app/routes/api.chat.ts`, `app/lib/.server/llm/*`.
- Workbench IDE : `app/components/workbench/*`, `app/components/editor/codemirror/*`, `app/lib/stores/workbench.ts`.
- Runtime WebContainer : `app/lib/webcontainer/index.ts`, `app/lib/stores/files.ts`, `app/lib/stores/terminal.ts`, `app/lib/stores/previews.ts`, `app/lib/runtime/action-runner.ts`, `app/utils/shell.ts`.

## 1. Editeur de code

Emplacements principaux :

- `app/components/editor/codemirror/CodeMirrorEditor.tsx` : composant CodeMirror, documents, etat editable/readonly, sauvegarde, scroll, themes et extensions.
- `app/components/editor/codemirror/languages.ts` : detection/chargement des langages CodeMirror.
- `app/components/editor/codemirror/cm-theme.ts` : theme CodeMirror.
- `app/components/editor/codemirror/BinaryContent.tsx` : rendu des fichiers binaires/non textuels.
- `app/components/editor/codemirror/EnvMasking.ts` : masquage des secrets/env dans l'editeur.
- `app/components/workbench/EditorPanel.tsx` : panneau IDE qui assemble file explorer, breadcrumb, editeur CodeMirror, recherche, locks et terminal.
- `app/lib/stores/editor.ts` : store des documents ouverts, selection de fichier et positions de scroll.
- `app/styles/components/editor.scss` et `app/styles/components/code.scss` : styles editeur/code.

Flux actuel :

1. `workbenchStore.files` expose la map des fichiers.
2. `EditorStore` convertit les fichiers en documents.
3. `EditorPanel` passe le document courant a `CodeMirrorEditor`.
4. Les changements utilisateur remontent a `workbenchStore.setCurrentDocumentContent`.
5. La sauvegarde appelle `workbenchStore.saveFile`, puis `FilesStore.saveFile`, puis `webcontainer.fs.writeFile`.

## 2. File explorer

Emplacements principaux :

- `app/components/workbench/FileTree.tsx` : arbre de fichiers/dossiers, collapse, selection, menus contextuels, et indicateurs de modifications.
- `app/components/workbench/FileBreadcrumb.tsx` : breadcrumb du fichier courant avec navigation.
- `app/components/workbench/Search.tsx` : recherche dans les fichiers du workbench.
- `app/components/workbench/LockManager.tsx` : interface de verrouillage fichiers/dossiers.
- `app/lib/stores/files.ts` : source de verite client pour la map virtuelle des fichiers.
- `app/lib/persistence/lockedFiles.ts` : persistence des locks par chat.
- `app/utils/fileLocks.ts` : helpers lies au chat courant.

Flux actuel :

1. `FilesStore` observe WebContainer via `webcontainer.internal.watchPaths`.
2. Les evenements `add_file`, `change`, `remove_file`, `add_dir`, `remove_dir` mettent a jour `files`.
3. `EditorPanel` transmet cette map a `FileTree`.
4. Une selection appelle `workbenchStore.setSelectedFile`.
5. Les operations create/delete passent par `workbenchStore.createFile/createFolder/deleteFile/deleteFolder`, puis `FilesStore`, puis WebContainer FS.

## 3. Terminal

Emplacements principaux :

- `app/components/workbench/terminal/Terminal.tsx` : wrapper xterm.js, FitAddon, WebLinksAddon, resize.
- `app/components/workbench/terminal/TerminalTabs.tsx` : UI des terminaux, terminal Bolt principal, terminaux additionnels, reset, collapse.
- `app/components/workbench/terminal/TerminalManager.tsx` : gestion additionnelle des terminaux dans ce fork.
- `app/components/workbench/terminal/theme.ts` : theme xterm.
- `app/lib/stores/terminal.ts` : attache/detache les terminaux a WebContainer.
- `app/utils/shell.ts` : spawn `/bin/jsh`, execution de commandes IA, parsing OSC, sortie terminal, detection URL Expo.
- `app/types/terminal.ts` : interface terminal commune.
- `app/styles/components/terminal.scss` : styles xterm.

Flux actuel :

1. `TerminalTabs` cree un terminal xterm.
2. `workbenchStore.attachBoltTerminal` ou `attachTerminal` delegue a `TerminalStore`.
3. `TerminalStore` appelle `newBoltShellProcess` ou `newShellProcess`.
4. `app/utils/shell.ts` utilise `webcontainer.spawn('/bin/jsh', ...)`.
5. Les actions IA de type `shell`/`start` utilisent `BoltShell.executeCommand`.

## 4. Preview panel

Emplacements principaux :

- `app/components/workbench/Preview.tsx` : iframe preview, selection de port, reload, fullscreen, device mode, screenshot, inspector.
- `app/components/workbench/PortDropdown.tsx` : selection des previews par port.
- `app/components/workbench/ScreenshotSelector.tsx` : capture/selection screenshot.
- `app/components/workbench/ExpoQrModal.tsx` : QR Expo.
- `app/components/workbench/Inspector.tsx` et `app/components/workbench/InspectorPanel.tsx` : selection/inspection element preview dans ce fork.
- `app/lib/stores/previews.ts` : ecoute `server-ready` et `port` de WebContainer, maintient la liste des previews.
- `app/routes/webcontainer.preview.$id.tsx` : route iframe qui construit l'URL `*.local-credentialless.webcontainer-api.io`.
- `app/routes/webcontainer.connect.$id.tsx` : route de connexion WebContainer via script CDN.

Flux actuel :

1. Les commandes `npm run dev` ou equivalents tournent dans WebContainer.
2. WebContainer emet `server-ready` et `port`.
3. `PreviewsStore` ajoute/met a jour `PreviewInfo`.
4. `Preview` selectionne le port actif et rend une iframe vers `baseUrl`.
5. Le script d'inspection est injecte via `webcontainer.setPreviewScript` dans `app/lib/webcontainer/index.ts`.

## 5. Integration WebContainer

Emplacements principaux :

- `app/lib/webcontainer/index.ts` : boot unique de WebContainer cote client, `WebContainer.boot`, `workdirName`, `coep`, script preview, gestion des messages d'erreur preview.
- `app/lib/webcontainer/auth.client.ts` : authentification/connexion WebContainer si necessaire.
- `package.json` : dependance `@webcontainer/api`.
- `app/routes/webcontainer.preview.$id.tsx` et `app/routes/webcontainer.connect.$id.tsx` : routes liees aux previews/connect.
- `app/utils/constants.ts` : `WORK_DIR_NAME = 'project'`, `WORK_DIR = '/home/project'`.
- `app/utils/stacktrace.ts` : nettoyage des URLs WebContainer dans les stack traces.

Usages directs de WebContainer :

- `app/lib/stores/workbench.ts` : instancie `PreviewsStore`, `FilesStore`, `TerminalStore` avec la promesse `webcontainer`; cree `ActionRunner`.
- `app/lib/stores/files.ts` : `fs.writeFile`, `fs.mkdir`, `fs.rm`, `internal.watchPaths`.
- `app/lib/stores/terminal.ts` : attache les terminaux.
- `app/lib/stores/previews.ts` : `on('server-ready')`, `on('port')`.
- `app/lib/runtime/action-runner.ts` : ecrit les fichiers IA, lance build, lit historique.
- `app/utils/shell.ts` : `spawn('/bin/jsh')`.
- `app/lib/hooks/useGit.ts` : adaptation FS pour isomorphic-git au-dessus de `webcontainer.fs`.
- `app/components/deploy/NetlifyDeploy.client.tsx` et `app/components/deploy/VercelDeploy.client.tsx` : lecture des fichiers/builds depuis WebContainer.
- `app/utils/file-watcher.ts` : helpers watch WebContainer.

## 6. Filesystem virtuel

Emplacements principaux :

- `app/lib/stores/files.ts` : store virtuel principal. Il conserve une `FileMap`, detecte les fichiers binaires, suit les fichiers modifies, gere les suppressions et locks, puis synchronise avec `webcontainer.fs`.
- `app/lib/stores/workbench.ts` : API facade exposee a l'UI pour save/create/delete/download/sync/push.
- `app/lib/stores/editor.ts` : projection editor des fichiers.
- `app/utils/path.ts` : operations de chemin cote navigateur.
- `app/utils/diff.ts` : calcul des modifications.
- `app/utils/folderImport.ts` et `app/components/chat/ImportFolderButton.tsx` : import local en artifacts Bolt.
- `app/lib/services/importExportService.ts` : import/export donnees app et providers.

Convention de chemin :

- Root logique : `/home/project`.
- `WORK_DIR_NAME` vaut `project`.
- Les actions IA peuvent fournir des chemins relatifs; `workbenchStore` et `ActionRunner` les joignent au workdir quand necessaire.

## 7. Chat IA

Emplacements principaux :

- `app/routes/_index.tsx` : page principale, rend `Header` puis `Chat`.
- `app/routes/chat.$id.tsx` : route de chat persistant par id.
- `app/components/chat/Chat.client.tsx` : composant client principal, `useChat`, provider/model, streaming, template auto-select, erreurs, persistence.
- `app/components/chat/BaseChat.tsx` : layout chat + workbench + menu + messages + alerts.
- `app/components/chat/ChatBox.tsx` : zone de saisie, model selector, API keys, upload image, web search, MCP, send button.
- `app/components/chat/Messages.client.tsx`, `AssistantMessage.tsx`, `UserMessage.tsx`, `Markdown.tsx`, `Artifact.tsx` : rendu conversation et artifacts.
- `app/components/chat/ModelSelector.tsx` et `APIKeyManager.tsx` : selection modele/provider et cles.
- `app/lib/stores/chat.ts` : etat UI chat.
- `app/lib/persistence/*` : historique, description, IndexedDB/localStorage.
- `app/routes/api.chat.ts` : endpoint streaming principal.
- `app/routes/api.llmcall.ts` : appel LLM ponctuel, utilise aussi pour selection de template.
- `app/routes/api.enhancer.ts` : prompt enhancer.
- `app/lib/.server/llm/stream-text.ts` : preparation prompt systeme, provider/model, contexte fichiers, locks, appel Vercel AI SDK.
- `app/lib/.server/llm/select-context.ts` et `create-summary.ts` : optimisation du contexte.

## 8. Actions IA qui creent/modifient les fichiers

Emplacements principaux :

- `app/lib/runtime/message-parser.ts` : parser streaming des balises `<boltArtifact>` et `<boltAction>`.
- `app/lib/runtime/enhanced-message-parser.ts` : extension locale qui auto-detecte certains blocs de code et commandes quand le modele n'a pas emis les balises Bolt.
- `app/lib/hooks/useMessageParser.ts` : callbacks parser vers `workbenchStore`.
- `app/lib/stores/workbench.ts` : orchestration des artifacts, queue d'execution, streaming des actions file, sauvegarde dans l'editeur.
- `app/lib/runtime/action-runner.ts` : execution effective des actions `file`, `shell`, `start`, `build`, `supabase`.
- `app/types/actions.ts` et `app/types/artifact.ts` : types des actions/artifacts.
- `app/components/chat/Artifact.tsx` : rendu des artifacts/actions cote chat.

Flux actuel :

1. `/api/chat` stream la reponse IA.
2. `Chat.client.tsx` recoit les chunks via `useChat`.
3. `useMessageParser` parse les messages assistant.
4. A l'ouverture d'un artifact, `workbenchStore.addArtifact` cree un `ActionRunner`.
5. A l'ouverture/stream/fermeture d'une action, `workbenchStore.addAction` puis `runAction` sont appeles.
6. Les actions `file` mettent a jour l'editeur et sauvegardent via `FilesStore`/`webcontainer.fs.writeFile`.
7. Les actions `shell`/`start` passent par `BoltShell.executeCommand` dans le terminal Bolt.

## 9. Providers IA

Emplacements principaux :

- `app/lib/modules/llm/base-provider.ts` : classe de base provider.
- `app/lib/modules/llm/types.ts` : types provider/modele.
- `app/lib/modules/llm/registry.ts` : exports de providers.
- `app/lib/modules/llm/manager.ts` : singleton `LLMManager`, enregistrement providers, listes statiques/dynamiques.
- `app/lib/modules/llm/providers/*` : implementations providers.
- `app/routes/api.models.ts` et `app/routes/api.models.$provider.ts` : liste providers/modeles.
- `app/routes/api.configured-providers.ts` : diagnostic providers configures.
- `app/routes/api.check-env-key.ts` et `app/routes/api.export-api-keys.ts` : gestion/verification cles.
- `app/lib/hooks/useSettings.ts`, `app/lib/stores/settings.ts` : settings providers.
- `app/components/@settings/tabs/providers/cloud/*` et `app/components/@settings/tabs/providers/local/*` : UI settings providers.

Providers presents dans ce fork :

- Amazon Bedrock, Anthropic, Cerebras, Cohere, Deepseek, Fireworks, GitHub Models, Google, Groq, HuggingFace, Hyperbolic, LM Studio, Mistral, Moonshot, Ollama, OpenAI, OpenAI-like, OpenRouter, Perplexity, Together, xAI, Z.ai.

## 10. Templates projets

Emplacements principaux :

- `app/utils/constants.ts` : `STARTER_TEMPLATES`, liste canonique des templates.
- `app/types/template.ts` : type `Template`.
- `app/components/chat/StarterTemplates.tsx` : affichage des icones/templates sur l'ecran chat.
- `app/utils/selectStarterTemplate.ts` : selection automatique par LLM, fetch du template, generation d'un assistant message contenant des `boltAction type="file"`.
- `app/routes/api.github-template.ts` : endpoint qui recupere les fichiers d'un repo GitHub template, via release zip ou GitHub Contents API en Cloudflare.
- `app/components/chat/GitCloneButton.tsx`, `app/components/git/GitUrlImport.client.tsx`, `app/routes/git.tsx` : import depuis URL Git.
- `app/utils/folderImport.ts` : transforme un dossier local en artifact Bolt.
- `app/components/@settings/tabs/features/FeaturesTab.tsx`, `app/lib/stores/settings.ts` : feature `autoSelectTemplate`.

Templates declares :

- Expo App, Basic Astro, NextJS Shadcn, Vite Shadcn, Qwik Typescript, Remix Typescript, Slidev, SvelteKit, Vanilla Vite, Vite React, Vite Typescript, Vue, Angular, SolidJS.

## 11. Scripts Electron desktop

Emplacements principaux :

- `electron/main/index.ts` : processus main Electron.
- `electron/main/ui/window.ts` : creation fenetre.
- `electron/main/ui/menu.ts` : menu desktop.
- `electron/main/utils/*` : auto-update, store, cookie, serve, reload, vite-server, constantes.
- `electron/preload/index.ts` : preload expose au renderer.
- `electron/main/vite.config.ts` et `electron/preload/vite.config.ts` : builds Electron.
- `vite-electron.config.ts` : config renderer Electron.
- `electron-builder.yml` et `electron-update.yml` : packaging/update.
- `assets/icons/*`, `assets/entitlements.mac.plist`, `notarize.cjs` : assets/signature.
- `scripts/electron-dev.mjs` : lancement dev Electron.

Scripts package lies :

- `electron:dev`
- `electron:dev:inspect`
- `electron:build:deps`
- `electron:build:main`
- `electron:build:preload`
- `electron:build:renderer`
- `electron:build:unpack`
- `electron:build:mac`
- `electron:build:win`
- `electron:build:linux`
- `electron:build:dist`

## 12. Configs Vite/Wrangler/Docker

Vite/Remix :

- `vite.config.ts` : Remix Vite plugin, Cloudflare dev proxy, UnoCSS, polyfills Node, aliases Buffer, envPrefix, config Vitest.
- `uno.config.ts` : config UnoCSS/icons/styles.
- `tsconfig.json` : TypeScript.
- `eslint.config.mjs`, `.eslintrc.json`, `.prettierrc` : lint/format.
- `worker-configuration.d.ts` : types Worker.

Wrangler/Cloudflare :

- `wrangler.toml` : nom `bolt`, `nodejs_compat`, date compatibilite, output Pages `./build/client`.
- `functions/[[path]].ts` : worker/functions entrypoint.
- `bindings.sh` : injection bindings au demarrage Wrangler.
- Scripts package : `deploy`, `start`, `start:unix`, `start:windows`, `dockerstart`, `typegen`.

Docker :

- `Dockerfile` : stages `build`, `prod-deps`, `bolt-ai-production`, `development`.
- `docker-compose.yaml` : services `app-prod`, `app-dev`, `app-prebuild`.
- `.dockerignore` : exclusions Docker.
- Scripts package : `dockerbuild`, `dockerbuild:prod`, `dockerrun`.

CI :

- `.github/workflows/ci.yaml`, `quality.yaml`, `security.yaml`, `docker.yaml`, `electron.yml`, `docs.yaml`, etc.
- `.github/actions/setup-and-build/action.yaml`.

## 13. Points a modifier pour remplacer WebContainer par un runtime distant

Points de couplage directs a abstraire plus tard :

- `app/lib/webcontainer/index.ts` : remplacer le singleton concret par une factory runtime.
- `app/lib/stores/workbench.ts` : injecte actuellement la promesse `webcontainer` dans `PreviewsStore`, `FilesStore`, `TerminalStore`, `ActionRunner`.
- `app/lib/stores/files.ts` : depend de `WebContainer`, `fs.*`, `internal.watchPaths`, chemins relatifs au workdir.
- `app/lib/stores/terminal.ts` : depend de `WebContainerProcess`.
- `app/utils/shell.ts` : depend de `webcontainer.spawn('/bin/jsh')`, streams WebContainer et signaux OSC.
- `app/lib/stores/previews.ts` : depend des events `server-ready` et `port`, et des URLs WebContainer.
- `app/lib/runtime/action-runner.ts` : depend de `webcontainer.fs`, `webcontainer.spawn`, `webcontainer.workdir`.
- `app/lib/hooks/useGit.ts` : implemente une FS compatible isomorphic-git au-dessus de `webcontainer.fs`.
- `app/components/deploy/NetlifyDeploy.client.tsx` et `app/components/deploy/VercelDeploy.client.tsx` : lisent le projet depuis `webcontainer.fs`.
- `app/routes/webcontainer.preview.$id.tsx` et `app/routes/webcontainer.connect.$id.tsx` : routes specifiques WebContainer.
- `app/lib/common/prompts/*` : prompts systeme qui decrivent explicitement WebContainer et ses limitations.
- `app/utils/stacktrace.ts` : nettoyage d'URLs WebContainer.
- `package.json` : dependance `@webcontainer/api`, scripts/builds impactes seulement apres migration effective.

L'approche recommandee est d'introduire un `RuntimeAdapter` compatible avec les contrats actuels avant de changer les appels. Voir `docs/RUNTIME_REPLACEMENT_PLAN.md`.

## 14. Risques de regression

Risques fonctionnels principaux :

- Perte de streaming fichier : les actions `file` sont appliquees pendant le stream, pas seulement a la fin.
- Desynchronisation editeur/filesystem : `EditorStore`, `FilesStore` et WebContainer FS doivent rester coherents.
- Perte des watchers : `internal.watchPaths` alimente l'arbre de fichiers, les modifications externes et certains refresh preview.
- Terminal non interactif : `BoltShell` depend des codes OSC de `/bin/jsh` pour savoir quand une commande finit.
- Preview cassee : les events `server-ready`/`port`, URLs preview et iframe sont fortement lies a WebContainer.
- Chemins incorrects : beaucoup de code suppose `/home/project`.
- Locks ignores : fichiers/dossiers verrouilles sont injectes dans le prompt et affiches dans le file explorer.
- Templates non importes : `getTemplates` transforme les fichiers GitHub en actions Bolt; toute modification du parser/action runner peut casser ce flux.
- Providers/modeles : `LLMManager` est singleton; tout changement d'env ou provider peut casser les routes `/api/models`, `/api/chat`, `/api/llmcall`.
- Deploy Netlify/Vercel : le code lit les fichiers et builds directement depuis le FS runtime.
- Electron : le renderer et le mode web partagent beaucoup de code; changer les configs Vite ou runtime peut casser le desktop.
- Commercial/licence : WebContainer est conserve dans le code; son usage production commerciale doit etre controle par feature flag et politique runtime.

## IDE Bolt a conserver absolument

Ces composants existants ne doivent pas etre supprimes lors d'une migration runtime :

- `app/components/workbench/Workbench.client.tsx`
- `app/components/workbench/EditorPanel.tsx`
- `app/components/workbench/FileTree.tsx`
- `app/components/workbench/FileBreadcrumb.tsx`
- `app/components/workbench/Search.tsx`
- `app/components/workbench/LockManager.tsx`
- `app/components/workbench/DiffView.tsx`
- `app/components/workbench/Preview.tsx`
- `app/components/workbench/PortDropdown.tsx`
- `app/components/workbench/ScreenshotSelector.tsx`
- `app/components/workbench/ExpoQrModal.tsx`
- `app/components/workbench/Inspector.tsx`
- `app/components/workbench/InspectorPanel.tsx`
- `app/components/workbench/terminal/Terminal.tsx`
- `app/components/workbench/terminal/TerminalTabs.tsx`
- `app/components/workbench/terminal/TerminalManager.tsx`
- `app/components/editor/codemirror/CodeMirrorEditor.tsx`
- `app/components/editor/codemirror/BinaryContent.tsx`
- `app/components/editor/codemirror/EnvMasking.ts`
- `app/components/chat/Chat.client.tsx`
- `app/components/chat/BaseChat.tsx`
- `app/components/chat/ChatBox.tsx`
- `app/components/chat/Messages.client.tsx`
- `app/components/chat/Artifact.tsx`
- `app/components/chat/ModelSelector.tsx`
- `app/components/chat/APIKeyManager.tsx`
- `app/components/chat/StarterTemplates.tsx`
- `app/lib/stores/workbench.ts`
- `app/lib/stores/files.ts`
- `app/lib/stores/editor.ts`
- `app/lib/stores/terminal.ts`
- `app/lib/stores/previews.ts`
- `app/lib/runtime/message-parser.ts`
- `app/lib/runtime/enhanced-message-parser.ts`
- `app/lib/runtime/action-runner.ts`

Ces composants peuvent etre adaptes par injection d'un runtime abstrait, mais leur surface UX doit rester preservee.
