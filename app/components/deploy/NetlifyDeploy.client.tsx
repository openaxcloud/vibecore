import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { BOLT_DEPLOY_OUTPUT_DIRECTORIES, DEFAULT_DEPLOY_BUILD_COMMAND, formatBuildFailureOutput } from './deployUtils';
import { pollNetlifyDeploy, type NetlifyDeployStatus } from './netlify-deploy-poll';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useRuntimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { collectRuntimeTextFiles, runtimeDirectoryExists } from '~/lib/runtime/runtime-files';
import { netlifyConnection } from '~/lib/stores/netlify';
import { workbenchStore } from '~/lib/stores/workbench';

export function useNetlifyDeploy() {
  const runtimeAdapter = useRuntimeAdapter();
  const [isDeploying, setIsDeploying] = useState(false);
  const netlifyConn = useStore(netlifyConnection);
  const currentChatId = useStore(chatId);

  const handleNetlifyDeploy = async () => {
    if (!netlifyConn.user || !netlifyConn.token) {
      toast.error('Please connect to Netlify first in the settings tab!');
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
      const deploymentId = `deploy-artifact`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'Netlify Deployment',
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
        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildOutput?.output),
          source: 'netlify',
        });
        throw new Error('Build failed');
      }

      // Notify that build succeeded and deployment is starting
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
        throw new Error('Could not find build output directory. Please check your build configuration.');
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

      const data = (await response.json().catch(() => ({}))) as any;

      if (!response.ok || !data.deploy || !data.site) {
        console.error('Invalid deploy response:', data);

        // Notify that deployment failed
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: data.error || 'Invalid deployment response',
          source: 'netlify',
        });
        throw new Error(data.error || 'Invalid deployment response');
      }

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
          const statusResponse = await fetch(
            `https://api.netlify.com/api/v1/sites/${data.site.id}/deploys/${data.deploy.id}`,
            {
              headers: {
                Authorization: `Bearer ${netlifyConn.token}`,
              },
            },
          );

          if (!statusResponse.ok) {
            throw new Error(`Deployment status check failed (HTTP ${statusResponse.status})`);
          }

          return (await statusResponse.json()) as NetlifyDeployStatus;
        },
      });

      if (pollResult.outcome === 'error') {
        // Notify that deployment failed
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: pollResult.error,
          source: 'netlify',
        });
        throw new Error(pollResult.error);
      }

      if (pollResult.outcome === 'timeout') {
        // Notify that deployment timed out
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: 'Deployment timed out',
          source: 'netlify',
        });
        throw new Error('Deployment timed out');
      }

      const deploymentStatus = pollResult.status;

      // Store the site ID if it's a new site
      if (data.site) {
        localStorage.setItem(`netlify-site-${currentChatId}`, data.site.id);
      }

      // Notify that deployment completed successfully
      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: deploymentStatus.ssl_url || deploymentStatus.url,
        source: 'netlify',
      });

      // Show success toast notification
      toast.success(`🚀 Netlify deployment completed successfully!`);

      return true;
    } catch (error) {
      console.error('Deploy error:', error);
      toast.error(error instanceof Error ? error.message : 'Deployment failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleNetlifyDeploy,
    isConnected: !!netlifyConn.user,
  };
}
