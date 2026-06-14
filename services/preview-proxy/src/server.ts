import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { buildPreviewProxyApp } from './app.js';

const app = await buildPreviewProxyApp({
  logger: true,
  workspaceManagerUrl: process.env.WORKSPACE_MANAGER_URL,
  proxySharedSecret: process.env.PREVIEW_PROXY_SHARED_SECRET,
  previewDomain: process.env.PREVIEW_DOMAIN,
});

const port = Number(process.env.PREVIEW_PROXY_PORT ?? 3020);
await app.listen({ host: '0.0.0.0', port });

export type { FastifyRequest, FastifyReply };
export { Fastify };
