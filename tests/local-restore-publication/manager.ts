import { KubectlWorkspaceK8sClient } from '../../packages/k8s-client/src/index';
import { buildWorkspaceManagerApp } from '../../services/workspace-manager/src/app';
import {
  JsonWorkspaceStore,
  StructuredLogEventBus,
  WorkspaceManager,
} from '../../services/workspace-manager/src/manager';

const manager = new WorkspaceManager(
  new JsonWorkspaceStore(),
  new KubectlWorkspaceK8sClient(),
  new StructuredLogEventBus(),
  process.env.WORKSPACE_AGENT_TOKEN_SECRET!,
);
buildWorkspaceManagerApp(manager)
  .listen({ host: '127.0.0.1', port: Number(process.env.WORKSPACE_MANAGER_PORT) })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
