import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { DEFAULT_DEPLOY_BUILD_COMMAND, formatBuildFailureOutput } from './deployUtils';
import {
  getDeployRemainingCopy,
  getRepositoryDeployErrorMessage,
  getRepositoryDeployStatusMessage,
  type RepositoryDeployErrorCode,
  type RepositoryDeployStatus,
} from '~/lib/i18n/catalogs/deploy-remaining';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useRuntimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { collectRuntimeTextFiles } from '~/lib/runtime/runtime-files';
import { workbenchStore } from '~/lib/stores/workbench';

class GitLabDeployError extends Error {
  constructor(
    readonly code: Extract<RepositoryDeployErrorCode, 'no-active-project' | 'build-failed' | 'preparation-failed'>,
    readonly technicalCause?: unknown,
  ) {
    super(code);
    this.name = 'GitLabDeployError';
  }
}

export function useGitLabDeploy() {
  const { i18n } = useTranslation();
  const runtimeAdapter = useRuntimeAdapter();
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<RepositoryDeployStatus>('idle');
  const currentChatId = useStore(chatId);
  const language = i18n.resolvedLanguage ?? i18n.language;

  const currentLanguage = () => i18n.resolvedLanguage ?? i18n.language;

  const handleGitLabDeploy = async () => {
    const connection = getLocalStorage('gitlab_connection');

    if (!connection?.token || !connection?.user) {
      setDeploymentStatus('error');
      toast.error(getRepositoryDeployErrorMessage(currentLanguage(), 'gitlab', 'connect-first'));

      return false;
    }

    if (!currentChatId) {
      setDeploymentStatus('error');
      toast.error(getRepositoryDeployErrorMessage(currentLanguage(), 'gitlab', 'no-active-chat'));

      return false;
    }

    try {
      setIsDeploying(true);
      setDeploymentStatus('building');

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new GitLabDeployError('no-active-project');
      }

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-gitlab-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: getDeployRemainingCopy(currentLanguage())['deployRemaining.repository.gitlab.artifactTitle'],
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
          content: DEFAULT_DEPLOY_BUILD_COMMAND,
        },
      };

      // Add the action first
      artifact.runner.addAction(actionData);

      // Then run it
      await artifact.runner.runAction(actionData);

      const buildOutput = artifact.runner.buildOutput;

      if (!buildOutput || buildOutput.exitCode !== 0) {
        const technicalOutput = formatBuildFailureOutput(buildOutput?.output);

        console.error('GitLab build failed:', technicalOutput);

        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: getRepositoryDeployErrorMessage(currentLanguage(), 'gitlab', 'build-failed'),
          source: 'gitlab',
        });
        throw new GitLabDeployError('build-failed', technicalOutput);
      }

      // Notify that build succeeded and deployment preparation is starting
      setDeploymentStatus('preparing');
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
      setDeploymentStatus('success');
      toast.success(getDeployRemainingCopy(currentLanguage())['deployRemaining.repository.gitlab.success']);

      return {
        success: true,
        files: fileContents,
        projectName: artifact.title || 'my-project',
      };
    } catch (err) {
      console.error('GitLab deploy error:', err);
      setDeploymentStatus('error');

      const errorCode = err instanceof GitLabDeployError ? err.code : 'preparation-failed';

      toast.error(getRepositoryDeployErrorMessage(currentLanguage(), 'gitlab', errorCode));

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleGitLabDeploy,
    isConnected: !!getLocalStorage('gitlab_connection')?.user,
    deploymentStatus,
    statusMessage: getRepositoryDeployStatusMessage(language, deploymentStatus),
  };
}
