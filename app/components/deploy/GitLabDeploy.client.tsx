import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { formatBuildFailureOutput } from './deployUtils';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useRuntimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { collectRuntimeTextFiles } from '~/lib/runtime/runtime-files';
import { workbenchStore } from '~/lib/stores/workbench';

export function useGitLabDeploy() {
  const runtimeAdapter = useRuntimeAdapter();
  const [isDeploying, setIsDeploying] = useState(false);
  const currentChatId = useStore(chatId);

  const handleGitLabDeploy = async () => {
    const connection = getLocalStorage('gitlab_connection');

    if (!connection?.token || !connection?.user) {
      toast.error('Please connect your GitLab account in Settings > Connections first');
      return false;
    }

    if (!currentChatId) {
      toast.error('No active chat found');
      return false;
    }

    try {
      setIsDeploying(true);

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new Error('No active project found');
      }

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-gitlab-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'GitLab Deployment',
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'gitlab' });

      const actionId = 'build-' + Date.now();

      const actionData: ActionCallbackData = {
        messageId: 'gitlab build',
        artifactId: artifact.id,
        actionId,
        action: {
          type: 'build' as const,
          content: 'npm run build',
        },
      };

      // Add the action first
      artifact.runner.addAction(actionData);

      // Then run it
      await artifact.runner.runAction(actionData);

      const buildOutput = artifact.runner.buildOutput;

      if (!buildOutput || buildOutput.exitCode !== 0) {
        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildOutput?.output),
          source: 'gitlab',
        });
        throw new Error('Build failed');
      }

      // Notify that build succeeded and deployment preparation is starting
      deployArtifact.runner.handleDeployAction('deploying', 'running', {
        source: 'gitlab',
      });

      const fileContents = await collectRuntimeTextFiles(runtimeAdapter, '/', {
        excludeDirectory: (name) => ['node_modules', '.git', 'dist', 'build', '.cache', '.next'].includes(name),
        excludeFile: (name) => name.endsWith('.DS_Store') || name.endsWith('.log') || name.startsWith('.env'),
      });

      /*
       * Show GitLab deployment dialog here - it will handle the actual deployment
       * and will receive these files to deploy
       */

      /*
       * For now, we'll just complete the deployment with a success message
       * Notify that deployment preparation is complete
       */
      deployArtifact.runner.handleDeployAction('deploying', 'complete', {
        source: 'gitlab',
      });

      // Show success toast notification
      toast.success(`🚀 GitLab deployment preparation completed successfully!`);

      return {
        success: true,
        files: fileContents,
        projectName: artifact.title || 'my-project',
      };
    } catch (err) {
      console.error('GitLab deploy error:', err);
      toast.error(err instanceof Error ? err.message : 'GitLab deployment preparation failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleGitLabDeploy,
    isConnected: !!getLocalStorage('gitlab_connection')?.user,
  };
}
