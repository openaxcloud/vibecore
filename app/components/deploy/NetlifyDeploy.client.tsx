import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { BOLT_DEPLOY_OUTPUT_DIRECTORIES, DEFAULT_DEPLOY_BUILD_COMMAND, formatBuildFailureOutput } from './deployUtils';
import { pollNetlifyDeploy, type NetlifyDeployStatus } from './netlify-deploy-poll';
import { formatClientAstResidualCopy, getClientAstResidualCopy } from '~/lib/i18n/catalogs/client-ast-residual';
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
import { netlifyConnection } from '~/lib/stores/netlify';
import { workbenchStore } from '~/lib/stores/workbench';

class NetlifyDeployError extends Error {
  constructor(
    readonly userCopyKey: DeploySurfacesKey,
    readonly technicalCause?: unknown,
  ) {
    super(userCopyKey);
    this.name = 'NetlifyDeployError';
  }
}

interface NetlifyDeployResponse {
  deploy?: { id?: string };
  site?: { id?: string };
  error?: unknown;
}

export function useNetlifyDeploy() {
  const { i18n } = useTranslation();
  const runtimeAdapter = useRuntimeAdapter();
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploySurfaceStatus>('idle');
  const netlifyConn = useStore(netlifyConnection);
  const currentChatId = useStore(chatId);
  const copy = getDeploySurfacesCopy(i18n.resolvedLanguage ?? i18n.language);

  const currentCopy = () => getDeploySurfacesCopy(i18n.resolvedLanguage ?? i18n.language);
  const currentAstCopy = () => getClientAstResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  const handleNetlifyDeploy = async () => {
    if (!netlifyConn.user || !netlifyConn.token) {
      setDeploymentStatus('error');
      toast.error(currentCopy()['deploySurfaces.netlify.connectFirst']);

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
        throw new NetlifyDeployError('deploySurfaces.common.noActiveProject');
      }

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-artifact`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: currentCopy()['deploySurfaces.netlify.artifactTitle'],
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'netlify' });

      // Set up build action
      const actionId = 'build-' + Date.now();

      const actionData: ActionCallbackData = {
        messageId: 'netlify build',
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

        console.error('Netlify build failed:', technicalOutput);

        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: currentCopy()['deploySurfaces.common.buildFailed'],
          source: 'netlify',
        });
        throw new NetlifyDeployError('deploySurfaces.common.buildFailed', technicalOutput);
      }

      // Notify that build succeeded and deployment is starting
      setDeploymentStatus('deploying');
      deployArtifact.runner.handleDeployAction('deploying', 'running', { source: 'netlify' });

      const buildPath = buildOutput.path.replace(runtimeAdapter.workdir, '');

      console.log('Original buildPath', buildPath);

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
          console.log(`Using build directory: ${finalBuildPath}`);
          break;
        }
      }

      if (!buildPathExists) {
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: currentCopy()['deploySurfaces.common.outputDirectoryMissing'],
          source: 'netlify',
        });
        throw new NetlifyDeployError('deploySurfaces.common.outputDirectoryMissing');
      }

      const fileContents = await collectRuntimeTextFiles(runtimeAdapter, finalBuildPath, {
        stripPrefix: finalBuildPath,
      });

      // Use chatId instead of artifact.id
      const existingSiteId = localStorage.getItem(`netlify-site-${currentChatId}`);

      const response = await fetch('/api/netlify-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: existingSiteId || undefined,
          files: fileContents,
          token: netlifyConn.token,
          chatId: currentChatId,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as NetlifyDeployResponse;

      if (!response.ok || !data.deploy?.id || !data.site?.id) {
        console.error('Invalid deploy response:', data);

        // Notify that deployment failed
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: currentCopy()['deploySurfaces.common.invalidResponse'],
          source: 'netlify',
        });
        throw new NetlifyDeployError('deploySurfaces.common.invalidResponse', data.error);
      }

      const deployId = data.deploy.id;
      const siteId = data.site.id;

      const maxAttempts = 120; // ~2 minutes timeout (1s between polls)

      /*
       * Poll the deploy status until it reaches a terminal state, times out, or
       * exhausts its attempts. The helper guarantees every iteration — including
       * ones where the status fetch fails or the user is offline — advances
       * toward maxAttempts, so a persistently erroring status endpoint can never
       * spin this loop forever (it terminates as a timeout instead).
       */
      const pollResult = await pollNetlifyDeploy({
        maxAttempts,
        fetchStatus: async () => {
          const statusResponse = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys/${deployId}`, {
            headers: {
              Authorization: `Bearer ${netlifyConn.token}`,
            },
          });

          if (!statusResponse.ok) {
            throw new Error(
              formatClientAstResidualCopy(currentAstCopy()['clientAst.deploy.netlify.statusCheckFailed'], {
                status: statusResponse.status,
              }),
            );
          }

          return (await statusResponse.json()) as NetlifyDeployStatus;
        },
      });

      if (pollResult.outcome === 'error') {
        console.error('Netlify deployment status reported an error:', pollResult.technicalCause);

        // Notify that deployment failed
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: currentCopy()['deploySurfaces.netlify.statusCheckFailed'],
          source: 'netlify',
        });
        throw new NetlifyDeployError('deploySurfaces.netlify.statusCheckFailed', pollResult.technicalCause);
      }

      if (pollResult.outcome === 'timeout') {
        // Notify that deployment timed out
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: currentCopy()['deploySurfaces.netlify.timedOut'],
          source: 'netlify',
        });
        throw new NetlifyDeployError('deploySurfaces.netlify.timedOut');
      }

      const deploymentStatus = pollResult.status;

      // Store the site ID if it's a new site
      localStorage.setItem(`netlify-site-${currentChatId}`, siteId);

      // Notify that deployment completed successfully
      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: deploymentStatus.ssl_url || deploymentStatus.url,
        source: 'netlify',
      });

      // Show success toast notification
      setDeploymentStatus('success');
      toast.success(currentCopy()['deploySurfaces.netlify.success']);

      return true;
    } catch (error) {
      console.error('Deploy error:', error);
      setDeploymentStatus('error');

      const messageKey = error instanceof NetlifyDeployError ? error.userCopyKey : 'deploySurfaces.netlify.failed';

      toast.error(currentCopy()[messageKey]);

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleNetlifyDeploy,
    isConnected: !!netlifyConn.user,
    deploymentStatus,
    statusMessage: getDeploySurfaceStatusCopy(copy, deploymentStatus),
  };
}
