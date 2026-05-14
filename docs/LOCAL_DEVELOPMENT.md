# Developpement local

## Installation

```bash
pnpm install
```

## IDE Bolt

L'IDE Bolt avec le backend SaaS local se lance depuis la racine. C'est le mode par defaut attendu pour que la creation de projet, les fichiers, le terminal, la preview et les panels utilisent les vraies API :

```bash
pnpm run dev
```

Alias monorepo :

```bash
pnpm platform:dev
```

Pour lancer uniquement le frontend historique Bolt sans API locale, utiliser explicitement le mode web-only. Dans ce mode, les projets persistants, l'import des fichiers et la preview projet ne peuvent pas fonctionner completement :

```bash
pnpm run dev:web
```

## Backend SaaS local

Le backend local utilise de vrais services Docker : PostgreSQL, Redis et SMTP Mailpit. Les ports par defaut du projet evitent les conflits avec d'autres stacks locales :

- PostgreSQL: `127.0.0.1:55432`
- Redis: `127.0.0.1:56379`
- API Fastify: `127.0.0.1:3001`
- Mailpit SMTP: `127.0.0.1:1025`
- Mailpit UI: `http://127.0.0.1:8025`

Demarrage :

```bash
docker compose -p vibecore -f docker-compose.dev.yml up -d postgres redis mailpit
DATABASE_URL="postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore" pnpm --filter @vibecore/database db:deploy
DATABASE_URL="postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore" pnpm --filter @vibecore/database db:seed
set -a; . ./.env; set +a; pnpm --filter @vibecore/api dev
pnpm run dev:web
```

La commande equivalente integree est :

```bash
pnpm run dev
```

Verification DB :

```bash
DATABASE_URL="postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore" pnpm --filter @vibecore/database exec prisma migrate status --schema prisma/schema.prisma
DATABASE_URL="postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore" pnpm --filter @vibecore/api test
```

## Runtime Kubernetes local reel

Pour valider le runtime distant sans mock, il faut un cluster Kubernetes local, l'API SaaS et `workspace-manager`.

Variables utiles :

```bash
WORKSPACE_MANAGER_URL=http://127.0.0.1:3010
WORKSPACE_RUNTIME_NAMESPACE=workspaces
WORKSPACE_AGENT_URL_TEMPLATE=http://127.0.0.1:18081
VITE_RUNTIME_API_BASE_URL=http://127.0.0.1:3001/api/runtime
VITE_RUNTIME_MODE=remote-kubernetes
```

Validation bout-en-bout :

```bash
KUBECONFIG=/tmp/vibecore-runtime-api-k3s.yaml \
RUNTIME_API_E2E_NAMESPACE=workspaces \
RUNTIME_API_E2E_AGENT_PORT=18081 \
pnpm run runtime:validate:api-kubernetes
```

Cette commande cree un vrai utilisateur, un vrai projet PostgreSQL, demarre un vrai Pod `workspace-agent` via `workspace-manager`, puis valide fichiers, terminal WebSocket, preview, snapshots et zip via `RemoteKubernetesRuntimeAdapter`.

### Fallback runtime local pour le developpement

En developpement uniquement, l'API SaaS peut executer les commandes runtime directement dans un workspace local si `workspace-manager` est indisponible. Ce chemin evite que les panneaux IDE comme Debugger, Processes et Logs restent bloques sur `Workspace manager is unavailable` pendant le travail local.

Variables utiles :

```bash
# Active par defaut hors production. Mettre false/0 pour forcer l'erreur manager.
WORKSPACE_LOCAL_RUNTIME_FALLBACK=true

# Racine des copies locales de workspaces. Par defaut: .vibecore/local-runtime
WORKSPACE_LOCAL_RUNTIME_ROOT=.vibecore/local-runtime
```

Ce fallback synchronise les fichiers projet stockes par Vibecore vers `WORKSPACE_LOCAL_RUNTIME_ROOT/<workspaceId>` avant d'executer la commande. En production, garder `WORKSPACE_MANAGER_URL` configure et ne pas s'appuyer sur ce mode local.

## Verification

```bash
pnpm platform:verify
```

Cette commande execute les tests existants, le typecheck, le build web et la validation infra.

Commandes separees :

```bash
pnpm platform:test
pnpm platform:typecheck
pnpm platform:build
pnpm platform:lint
pnpm infra:validate
```

## Electron

Le dossier `electron/` existant est conserve. Les scripts historiques restent disponibles :

```bash
pnpm electron:build:mac
pnpm electron:build:win
pnpm electron:build:linux
pnpm electron:build:dist
```

Alias monorepo :

```bash
pnpm desktop:build
pnpm --filter @vibecore/desktop build
```

## Mobile

Le workspace mobile est scaffolde pour la suite :

```bash
pnpm mobile:sync
pnpm --filter @vibecore/mobile sync
```

## Migration future de `apps/web`

Quand le decouplage sera pret, deplacer l'IDE vers `apps/web` en traitant explicitement :

- aliases TypeScript/Vite;
- Remix routes/build;
- Cloudflare/Wrangler;
- Docker;
- Electron renderer;
- imports `~/...`;
- tests et snapshots;
- assets `public/`, `icons/`, `assets/`.

Jusque-la, `apps/web` reste un proxy compatible pour ne pas casser Bolt.
