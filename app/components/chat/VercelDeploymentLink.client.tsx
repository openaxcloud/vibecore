import { useStore } from '@nanostores/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useState } from 'react';
import { chatId } from '~/lib/persistence/useChatHistory';
import { vercelConnection } from '~/lib/stores/vercel';
import { isValidVercelProjectId } from '~/lib/vercel-project-id';

/**
 * Pure helper that extracts a deployment URL from the /api/vercel-deploy
 * fallback response body. Returns the deploy URL when present, otherwise the
 * project URL, otherwise null. Kept separate so it can be unit-tested without a
 * DOM/fetch environment.
 */
export function parseDeploymentResponse(data: unknown): string | null {
  const deployUrl = (data as { deploy?: { url?: string } } | null)?.deploy?.url;

  if (typeof deployUrl === 'string') {
    return deployUrl;
  }

  const projectUrl = (data as { project?: { url?: string } } | null)?.project?.url;

  if (typeof projectUrl === 'string') {
    return projectUrl;
  }

  return null;
}

/**
 * Pure helper that picks the cleanest public deploy URL from a Vercel
 * `GET /v9/projects/{id}` response. Prefers a production alias that ends in
 * `.vercel.app` but is not the noisy `-projects.vercel.app` form, otherwise
 * falls back to the first production alias. Returns a fully-qualified URL or
 * null. Kept separate so it can be unit-tested without a DOM/fetch environment.
 */
export function parseProjectAliasUrl(projectDetails: unknown): string | null {
  const aliases = (projectDetails as { targets?: { production?: { alias?: unknown } } } | null)?.targets?.production
    ?.alias;

  if (!Array.isArray(aliases) || aliases.length === 0) {
    return null;
  }

  const stringAliases = aliases.filter((a): a is string => typeof a === 'string');

  if (stringAliases.length === 0) {
    return null;
  }

  const cleanUrl = stringAliases.find((a) => a.endsWith('.vercel.app') && !a.includes('-projects.vercel.app'));

  return `https://${cleanUrl ?? stringAliases[0]}`;
}

export function VercelDeploymentLink() {
  const connection = useStore(vercelConnection);
  const currentChatId = useStore(chatId);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    /*
     * Guard against stale setState after the chat/token changes or the component
     * unmounts mid-fetch (several awaited Vercel API hops below).
     */
    let cancelled = false;

    async function fetchProjectData() {
      if (!connection.token || !currentChatId) {
        return;
      }

      // Check if we have a stored project ID for this chat
      const projectId = localStorage.getItem(`vercel-project-${currentChatId}`);

      if (!projectId) {
        return;
      }

      setIsLoading(true);

      try {
        /*
         * Resolve the project directly from the stored project id. The deployer
         * (VercelDeploy.client.tsx) persists `data.project.id` under
         * `vercel-project-<chatId>`, and current project names are built by
         * buildVercelProjectName() as `ecode-<sanitized-chatId>-<ts>` — there is
         * no `bolt-diy-`/chat-number substring to match on, so the old
         * `GET /v9/projects` name search was dead. Validate the id before
         * interpolating it into the upstream URL.
         */
        if (isValidVercelProjectId(projectId)) {
          // Fetch project details including production aliases
          const projectDetailsResponse = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
            headers: {
              Authorization: `Bearer ${connection.token}`,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
          });

          if (projectDetailsResponse.ok) {
            const projectDetails = (await projectDetailsResponse.json()) as any;

            // Prefer the clean production-alias URL when available
            const aliasUrl = parseProjectAliasUrl(projectDetails);

            if (aliasUrl) {
              if (!cancelled) {
                setDeploymentUrl(aliasUrl);
              }

              return;
            }
          }

          // If no aliases or project details failed, try fetching deployments
          const deploymentsResponse = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`,
            {
              headers: {
                Authorization: `Bearer ${connection.token}`,
                'Content-Type': 'application/json',
              },
              cache: 'no-store',
            },
          );

          if (deploymentsResponse.ok) {
            const deploymentsData = (await deploymentsResponse.json()) as any;

            if (deploymentsData.deployments && deploymentsData.deployments.length > 0) {
              if (!cancelled) {
                setDeploymentUrl(`https://${deploymentsData.deployments[0].url}`);
              }

              return;
            }
          }
        }

        /*
         * Fallback to API call if not found in fetched projects. Send the token
         * in a header, never the query string (avoids logging/history/Referer leak).
         */
        const fallbackResponse = await fetch(`/api/vercel-deploy?projectId=${projectId}`, {
          method: 'GET',
          headers: { 'x-vercel-token': connection.token },
        });

        /*
         * Guard against a non-2xx fallback response: calling .json() on an error
         * body (often non-JSON) throws and is only console.error'd, so the link
         * silently never appears. Bail out cleanly instead.
         */
        if (!fallbackResponse.ok) {
          return;
        }

        const deploymentUrl = parseDeploymentResponse(await fallbackResponse.json());

        if (!cancelled && deploymentUrl) {
          setDeploymentUrl(deploymentUrl);
        }
      } catch (err) {
        console.error('Error fetching Vercel deployment:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchProjectData();

    return () => {
      cancelled = true;
    };
  }, [connection.token, currentChatId]);

  if (!deploymentUrl) {
    return null;
  }

  return (
    <Tooltip.Provider delayDuration={500}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary z-50"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className={`i-ph:link w-4 h-4 hover:text-blue-400 ${isLoading ? 'animate-pulse' : ''}`} />
          </a>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="px-3 py-2 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary text-xs z-50"
            sideOffset={5}
          >
            {deploymentUrl}
            <Tooltip.Arrow className="fill-bolt-elements-background-depth-3" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
