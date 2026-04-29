# Structure monorepo SaaS

Cette migration est volontairement progressive. Le code Bolt existant reste a la racine pour ne pas casser les imports Remix/Vite/Electron actuels. `apps/web` est cree comme workspace proxy vers l'IDE Bolt existant et devient la cible de migration lorsque les chemins `~/`, les configs Vite/Remix/Wrangler/Electron et les assets auront ete decouples.

## Structure cible creee

- `apps/web` : proxy compatible vers l'IDE Bolt existant. Le code source actuel reste dans `app/`, `public/`, `vite.config.ts`, `wrangler.toml`, etc.
- `apps/admin` : scaffold de l'app admin SaaS.
- `apps/mobile` : scaffold de l'app mobile.
- `apps/desktop` : proxy vers les scripts Electron existants. Le dossier historique `electron/` est conserve.
- `services/api` : scaffold API SaaS.
- `services/worker` : scaffold workers asynchrones.
- `services/workspace-manager` : futur lifecycle manager des workspaces distants.
- `services/workspace-agent` : futur agent embarque dans les workspaces.
- `services/preview-proxy` : futur proxy des previews distantes.
- `services/ai-gateway` : futur point d'entree IA multi-provider.
- `packages/shared` : types/helpers partages.
- `packages/config` : configuration partagee.
- `packages/database` : schema/client database.
- `packages/runtime-contract` : contrat runtime commun.
- `packages/runtime-webcontainer` : futur adapter WebContainer.
- `packages/runtime-remote` : futur adapter remote Kubernetes.
- `packages/ui` : composants UI partages, sans supprimer les composants Bolt existants.
- `packages/editor` : abstractions editor futures, sans remplacer CodeMirror dans Bolt.
- `packages/auth`, `packages/rbac`, `packages/billing`, `packages/quota`, `packages/audit`, `packages/observability` : packages SaaS transverses.
- `infra` : infrastructure et validation.
- `docs` : documentation architecture/migration.

## Pourquoi l'IDE n'a pas ete deplace physiquement

Deplacer immediatement `app/` vers `apps/web/app` casserait probablement :

- les aliases `~/...`;
- les routes Remix;
- `vite.config.ts`;
- `wrangler.toml`;
- Electron renderer/main/preload;
- Dockerfile et docker-compose;
- scripts `bindings.sh`, `pre-start.cjs`, `load-context.ts`;
- chemins de tests et snapshots.

La strategie retenue preserve le comportement actuel et cree les workspaces sans rupture.

## Compatibilite scripts

Les scripts Bolt existants restent a la racine :

- `pnpm run dev`
- `pnpm run build`
- `pnpm test`
- `pnpm run typecheck`
- `pnpm electron:build:mac`
- `pnpm electron:build:win`
- `pnpm electron:build:linux`
- `pnpm electron:build:dist`

Les nouveaux scripts plateforme appellent ces scripts racine tant que l'IDE Bolt vit a la racine.

