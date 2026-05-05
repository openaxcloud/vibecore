import { buildWorkspaceAgentApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const app = buildWorkspaceAgentApp();

await app.listen({ port, host });
