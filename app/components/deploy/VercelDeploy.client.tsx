import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { BOLT_DEPLOY_OUTPUT_DIRECTORIES, DEFAULT_DEPLOY_BUILD_COMMAND, formatBuildFailureOutput } from './deployUtils';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useRuntimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { collectRuntimeTextFiles, runtimeDirectoryExists } from '~/lib/runtime/runtime-files';
import { vercelConnection } from '~/lib/stores/vercel';
import { workbenchStore } from '~/lib/stores/workbench';

export function useVercelDeploy() {
  const runtimeAdapter = useRuntimeAdapter();
  const [isDeploying, setIsDeploying] = useState(false);
  const vercelConn = useStore(vercelConnection);
  const currentChatId = useStore(chatId);

  const handleVercelDeploy = async () => {
    if (!vercelConn.user || !vercelConn.token) {
      toast.error('Please connect to Vercel first in the settings tab!');
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
      const deploymentId = `deploy-vercel-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'Vercel Deployment',
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
        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildOutput?.output),
          source: 'vercel',
        });
        throw new Error('Build failed');
      }

      // Notify that build succeeded and deployment is starting
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
        throw new Error('Could not find build output directory. Please check your build configuration.');
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

      const data = (await response.json().catch(() => ({}))) as any;

      if (!response.ok || !data.deploy || !data.project) {
        console.error('Invalid deploy response:', data);

        // Notify that deployment failed
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: data.error || 'Invalid deployment response',
          source: 'vercel',
        });
        throw new Error(data.error || 'Invalid deployment response');
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
        toast.info('Your Vercel deployment is still in progress. Check the Vercel dashboard for the final status.');

        return true;
      }

      // Notify that deployment completed successfully
      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: data.deploy.url,
        source: 'vercel',
      });

      // Show success toast notification
      toast.success(`🚀 Vercel deployment completed successfully!`);

      return true;
    } catch (err) {
      console.error('Vercel deploy error:', err);
      toast.error(err instanceof Error ? err.message : 'Vercel deployment failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleVercelDeploy,
    isConnected: !!vercelConn.user,
  };
}
