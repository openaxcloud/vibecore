# Migration depuis la base Bolt

Ce document fixe les regles de migration pour ce fork. L'objectif n'est pas de reecrire Bolt, mais d'encapsuler progressivement les dependances runtime tout en conservant l'IDE et le comportement existants.

## Regles non negociables

- Ne pas repartir de zero.
- Ne supprimer aucun composant Bolt existant.
- Ne pas remplacer l'IDE Bolt.
- Ne pas changer le comportement actuel tant que la migration runtime n'est pas explicitement lancee.
- Ne pas migrer l'architecture directement depuis les composants UI.
- Toute evolution doit garder WebContainer fonctionnel en local/dev/fallback licencie.
- Toute evolution doit avoir une verification tests + typecheck.

## Etat actuel a conserver

L'architecture actuelle est centree sur :

- `Chat.client.tsx` et `/api/chat` pour la conversation IA.
- `useMessageParser` + `EnhancedStreamingMessageParser` pour transformer les reponses IA en artifacts/actions.
- `workbenchStore` comme facade UI vers fichiers, editeur, terminal, previews et actions.
- `FilesStore`, `TerminalStore`, `PreviewsStore` comme stores specialises.
- `ActionRunner` comme executeur des actions IA.
- `webcontainer` comme runtime concret unique.

Le premier objectif d'une migration future doit etre de rendre le runtime injectable, pas de modifier l'UX.

## Strategie de migration recommandee

### Phase 0 - Baseline documentaire

Etat de cette PR/documentation :

- Cartographie complete dans `docs/BOLT_BASELINE_MAP.md`.
- Plan d'abstraction runtime dans `docs/RUNTIME_REPLACEMENT_PLAN.md`.
- Checklist anti-regression dans `docs/NO_REGRESSION_CHECKLIST.md`.
- Aucun comportement applicatif modifie.

### Phase 1 - Interfaces sans changement de comportement

Introduire des types et interfaces runtime sans changer les appels effectifs :

- `RuntimeAdapter`
- `RuntimeFileSystem`
- `RuntimeTerminalSession`
- `RuntimePreview`
- `RuntimeProcess`
- `RuntimeWatchHandle`

Le premier adapter implemente doit etre `WebContainerRuntimeAdapter`, qui delegue au code actuel. A ce stade, `RUNTIME_MODE=webcontainer` doit produire le meme comportement qu'aujourd'hui.

### Phase 2 - Injection progressive

Changer uniquement les points de construction :

- `app/lib/webcontainer/index.ts` devient source de l'adapter WebContainer ou est remplace par une factory runtime compatible.
- `app/lib/stores/workbench.ts` recoit un adapter au lieu d'importer directement `webcontainer`.
- `FilesStore`, `TerminalStore`, `PreviewsStore`, `ActionRunner` recoivent des interfaces runtime au lieu des types `WebContainer`.

Les composants UI ne doivent pas savoir si le runtime est WebContainer ou distant.

### Phase 3 - Remote Kubernetes en parallele

Ajouter `RemoteKubernetesRuntimeAdapter` derriere le meme contrat :

- FS via API distante ou websocket.
- Watch FS via websocket/SSE.
- Terminal via websocket PTY.
- Process spawn via endpoint runtime.
- Preview via ports exposes/proxies.
- Workspace par chat/projet avec isolation.

WebContainer reste conserve et testable.

### Phase 4 - Feature flag et politique commerciale

Ajouter `RUNTIME_MODE=webcontainer|remote-kubernetes`.

Regles :

- En production commerciale, `remote-kubernetes` est le defaut.
- `webcontainer` reste disponible uniquement pour local/dev/fallback licencie.
- Si `RUNTIME_MODE` est absent en production commerciale, la factory doit choisir `remote-kubernetes`.
- Si `RUNTIME_MODE=webcontainer` est demande en production commerciale, l'app doit exiger une configuration/licence explicite avant usage.

### Phase 5 - Nettoyage apres stabilisation

Seulement apres validation :

- Deplacer les prompts WebContainer-specifiques vers des prompts runtime-aware.
- Generaliser les stack traces.
- Adapter les routes preview/connect.
- Ajouter observabilite runtime distante.
- Ajouter tests E2E ou integration pour les deux modes.

## Zones a ne pas modifier au debut

Ne pas commencer par :

- Refaire `Workbench.client.tsx`.
- Remplacer CodeMirror.
- Remplacer xterm.
- Reecrire le parser Bolt.
- Changer le format `<boltArtifact>` / `<boltAction>`.
- Changer les providers LLM.
- Changer les templates.
- Changer le comportement de streaming des fichiers.

## Points de compatibilite a maintenir

Le runtime abstrait doit conserver ces garanties :

- Workdir logique compatible avec `/home/project`.
- `writeFile`, `readFile`, `mkdir`, `rm`, `readdir`.
- Watch fichiers avec contenu pour alimenter `FilesStore`.
- Spawn shell interactif compatible avec le terminal Bolt.
- Execution non bloquante pour les actions `start`.
- Signal de fin/exit pour les actions `shell`.
- Events de preview equivalents a `server-ready` et `port`.
- URLs preview utilisables dans `Preview.tsx`.
- Lecture des fichiers pour export zip, GitHub/GitLab push, Netlify/Vercel deploy.

## Prompts et contexte IA

Les prompts actuels mentionnent explicitement WebContainer :

- `app/lib/common/prompts/prompts.ts`
- `app/lib/common/prompts/new-prompt.ts`
- `app/lib/common/prompts/optimized.ts`
- `app/lib/common/prompts/discuss-prompt.ts`

Lors d'une future migration, ces prompts devront devenir runtime-aware. Il ne faut pas les changer avant que le runtime adapter soit disponible, sinon le modele pourrait emettre des commandes incompatibles avec le runtime reel.

## Definition de done pour une future migration runtime

- `RUNTIME_MODE=webcontainer` garde le comportement actuel.
- `RUNTIME_MODE=remote-kubernetes` execute fichiers, terminal, preview et actions IA via runtime distant.
- Les tests existants passent.
- Le typecheck passe.
- Les flows suivants sont verifies manuellement :
  - nouveau projet depuis prompt simple;
  - import template;
  - modification fichier en streaming;
  - commande shell;
  - dev server + preview;
  - terminal interactif;
  - export zip;
  - deploy Netlify/Vercel si configure;
  - Electron dev/build si concerne.

## IDE Bolt a conserver absolument

La migration doit conserver les composants listes dans `docs/BOLT_BASELINE_MAP.md`, section `IDE Bolt a conserver absolument`. Toute suppression ou remplacement de ces composants est hors scope tant qu'une decision explicite n'est pas documentee.
