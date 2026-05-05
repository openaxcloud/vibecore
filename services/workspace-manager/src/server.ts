import { KubectlWorkspaceK8sClient } from '@vibecore/k8s-client';
import { buildWorkspaceManagerApp } from './app.js';
import { JsonWorkspaceStore, StructuredLogEventBus, WorkspaceManager } from './manager.js';

if (!process.env.WORKSPACE_AGENT_TOKEN_SECRET) {
  throw new Error('WORKSPACE_AGENT_TOKEN_SECRET is required');
}

const app = buildWorkspaceManagerApp(
  new WorkspaceManager(new JsonWorkspaceStore(), new KubectlWorkspaceK8sClient(), new StructuredLogEventBus(), process.env.WORKSPACE_AGENT_TOKEN_SECRET),
);
const port = Number(process.env.WORKSPACE_MANAGER_PORT ?? 3010);

await app.listen({ host: '0.0.0.0', port });
