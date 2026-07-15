import { buildWorkspaceAgentApp } from './app.js';
import { bootstrapNixEnv } from './nix-env.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

/*
 * Materialise the project's Nix toolchain BEFORE listening: the link farm must be
 * on disk before the first command can be spawned against it (sanitizedChildEnv
 * puts it on PATH). No-op when the shared read-only store isn't mounted, and never
 * throws — a toolchain problem must not stop the agent from serving.
 */
await bootstrapNixEnv();

const app = buildWorkspaceAgentApp();

await app.listen({ port, host });
