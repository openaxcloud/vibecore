import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { BOLT_DEPLOY_OUTPUT_DIRECTORIES, DEFAULT_DEPLOY_BUILD_COMMAND, formatBuildFailureOutput } from './deployUtils';
import {
  getDeploySurfacesCopy,
  getDeploySurfaceStatusCopy,
  type DeploySurfacesKey,
  type DeploySurfaceStatus,
} from '~/lib/i18n/catalogs/deploy-surfaces';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useRuntimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { collectRuntimeTextFiles, runtimeDirectoryExists } from '~/lib/runtime/runtime-files';
import { vercelConnection } from '~/lib/stores/vercel';
import { workbenchStore } from '~/lib/stores/workbench';

class VercelDeployError extends Error {
  constructor(
    readonly userCopyKey: DeploySurfacesKey,
    readonly technicalCause?: unknown,
  ) {
    super(userCopyKey);
    this.name = 'VercelDeployError';
  }
}

interface VercelDeployResponse {
  deploy?: { url?: string };
  project?: { id?: string };
  pending?: boolean;
  error?: unknown;
}

export function useVercelDeploy() {
  const { i18n } = useTranslation();
  const runtimeAdapter = useRuntimeAdapter();
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploySurfaceStatus>('idle');
  const vercelConn = useStore(vercelConnection);
  const currentChatId = useStore(chatId);
  const copy = getDeploySurfacesCopy(i18n.resolvedLanguage ?? i18n.language);

  const currentCopy = () => getDeploySurfacesCopy(i18n.resolvedLanguage ?? i18n.language);

  const handleVercelDeploy = async () => {
    if (!vercelConn.user || !vercelConn.token) {
      setDeploymentStatus('error');
      toast.error(currentCopy()['deploySurfaces.vercel.connectFirst']);

      return false;
    }

    if (!currentChatId) {
      setDeploymentStatus('error');
      toast.error(currentCopy()['deploySurfaces.common.noActiveChat']);

      return false;
    }

    try {
      setIsDeploying(true);
      setDeploymentStatus('building');

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new VercelDeployError('deploySurfaces.common.noActiveProject');
      }

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-vercel-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: currentCopy()['deploySurfaces.vercel.artifactTitle'],
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'vercel' });

      const actionId = 'build-' + Date.now();

      const actionData: ActionCallbackData = {
        messageId: 'vercel build',
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

        console.error('Vercel build failed:', technicalOutput);

        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: currentCopy()['deploySurfaces.common.buildFailed'],
          source: 'vercel',
        });
        throw new VercelDeployError('deploySurfaces.common.buildFailed', technicalOutput);
      }

      // Notify that build succeeded and deployment is starting
      setDeploymentStatus('deploying');
      deployArtifact.runner.handleDeployAction('deploying', 'running', { source: 'vercel' });

      const buildPath = buildOutput.path.replace(runtimeAdapter.workdir, '');

      // Check if the build path exists
      let finalBuildPath = buildPath;

      // List of common output directories to check if the specified build path doesn't exist
      const commonOutputDirs = [buildPath, ...BOLT_DEPLOY_OUTPUT_DIRECTORIES];

      // Verify the build path exists, or try to find an alternative
      let buildPathExists = false;

      for (const dir of commonOutputDirs) {
        if (await runtimeDirectoryExists(runtimeAdapter, dir)) {
          finalBuildPath = dir;
          buildPathExists = true;
          break;
        }
      }

      if (!buildPathExists) {
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: currentCopy()['deploySurfaces.common.outputDirectoryMissing'],
          source: 'vercel',
        });
        throw new VercelDeployError('deploySurfaces.common.outputDirectoryMissing');
      }

      const fileContents = await collectRuntimeTextFiles(runtimeAdapter, finalBuildPath, {
        stripPrefix: finalBuildPath,
      });

      // Get all source project files for framework detection
      const allProjectFiles: Record<string, string> = {};

      Object.assign(
        allProjectFiles,
        await collectRuntimeTextFiles(runtimeAdapter, '.', {
          excludeDirectory: (name) => name.startsWith('.') || name === 'node_modules',
        }),
      );

      // Use chatId instead of artifact.id
      const existingProjectId = localStorage.getItem(`vercel-project-${currentChatId}`);

      const response = await fetch('/api/vercel-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: existingProjectId || undefined,
          files: fileContents,
          sourceFiles: allProjectFiles,
          token: vercelConn.token,
          chatId: currentChatId,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as VercelDeployResponse;

      if (!response.ok || !data.deploy || !data.project?.id) {
        console.error('Invalid deploy response:', data);

        // Notify that deployment failed
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: currentCopy()['deploySurfaces.common.invalidResponse'],
          source: 'vercel',
        });
        throw new VercelDeployError('deploySurfaces.common.invalidResponse', data.error);
      }

      if (data.project) {
        localStorage.setItem(`vercel-project-${currentChatId}`, data.project.id);
      }

      /*
       * A 202 (or an explicit `pending` flag) means the server could not confirm
       * a terminal state on Vercel's side — the deployment is still in progress
       * and must NOT be reported as a verified success. Keep the deploy artifact
       * in the running state and tell the user it is still deploying.
       */
      if (response.status === 202 || data.pending) {
        deployArtifact.runner.handleDeployAction('deploying', 'running', { source: 'vercel' });
        setDeploymentStatus('pending');
        toast.info(currentCopy()['deploySurfaces.vercel.pending']);

        return true;
      }

      if (!data.deploy.url) {
        console.error('Invalid deploy response: missing deployment URL', data);
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: currentCopy()['deploySurfaces.common.invalidResponse'],
          source: 'vercel',
        });
        throw new VercelDeployError('deploySurfaces.common.invalidResponse');
      }

      // Notify that deployment completed successfully
      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: data.deploy.url,
        source: 'vercel',
      });

      // Show success toast notification
      setDeploymentStatus('success');
      toast.success(currentCopy()['deploySurfaces.vercel.success']);

      return true;
    } catch (err) {
      console.error('Vercel deploy error:', err);
      setDeploymentStatus('error');

      const messageKey = err instanceof VercelDeployError ? err.userCopyKey : 'deploySurfaces.vercel.failed';

      toast.error(currentCopy()[messageKey]);

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleVercelDeploy,
    isConnected: !!vercelConn.user,
    deploymentStatus,
    statusMessage: getDeploySurfaceStatusCopy(copy, deploymentStatus),
  };
}
