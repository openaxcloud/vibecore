import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { NetlifyDeploymentLink } from '~/components/chat/NetlifyDeploymentLink.client';
import { VercelDeploymentLink } from '~/components/chat/VercelDeploymentLink.client';
import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { GitHubDeploymentDialog } from '~/components/deploy/GitHubDeploymentDialog';
import { useGitLabDeploy } from '~/components/deploy/GitLabDeploy.client';
import { GitLabDeploymentDialog } from '~/components/deploy/GitLabDeploymentDialog';
import { useNetlifyDeploy } from '~/components/deploy/NetlifyDeploy.client';
import { useVercelDeploy } from '~/components/deploy/VercelDeploy.client';
import { buttonVariants } from '~/components/ui/Button';
import {
  formatDeployRemainingCopy,
  getDeployRemainingCopy,
  type DeployRemainingCopy,
  type DeployRemainingKey,
} from '~/lib/i18n/catalogs/deploy-remaining';
import { isGitLabConnected } from '~/lib/stores/gitlabConnection';
import { netlifyConnection } from '~/lib/stores/netlify';
import { streamingState } from '~/lib/stores/streaming';
import { vercelConnection } from '~/lib/stores/vercel';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface DeployButtonProps {
  onVercelDeploy?: () => Promise<void>;
  onNetlifyDeploy?: () => Promise<void>;
  onGitHubDeploy?: () => Promise<void>;
  onGitLabDeploy?: () => Promise<void>;
}

type DeployProvider = 'netlify' | 'vercel' | 'github' | 'gitlab';

const DEPLOY_PROVIDER_NAME_KEYS = {
  netlify: 'deployRemaining.button.provider.netlify',
  vercel: 'deployRemaining.button.provider.vercel',
  github: 'deployRemaining.button.provider.github',
  gitlab: 'deployRemaining.button.provider.gitlab',
} as const satisfies Readonly<Record<DeployProvider, DeployRemainingKey>>;

function deployProviderName(copy: DeployRemainingCopy, provider: DeployProvider): string {
  return copy[DEPLOY_PROVIDER_NAME_KEYS[provider]];
}

export const DeployButton = ({
  onVercelDeploy,
  onNetlifyDeploy,
  onGitHubDeploy,
  onGitLabDeploy,
}: DeployButtonProps) => {
  const { i18n } = useTranslation();
  const netlifyConn = useStore(netlifyConnection);
  const vercelConn = useStore(vercelConnection);
  const gitlabIsConnected = useStore(isGitLabConnected);
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployingTo, setDeployingTo] = useState<DeployProvider | null>(null);
  const isStreaming = useStore(streamingState);
  const { handleVercelDeploy } = useVercelDeploy();
  const { handleNetlifyDeploy } = useNetlifyDeploy();
  const { handleGitHubDeploy } = useGitHubDeploy();
  const { handleGitLabDeploy } = useGitLabDeploy();
  const [showGitHubDeploymentDialog, setShowGitHubDeploymentDialog] = useState(false);
  const [showGitLabDeploymentDialog, setShowGitLabDeploymentDialog] = useState(false);
  const [githubDeploymentFiles, setGithubDeploymentFiles] = useState<Record<string, string> | null>(null);
  const [gitlabDeploymentFiles, setGitlabDeploymentFiles] = useState<Record<string, string> | null>(null);
  const [githubProjectName, setGithubProjectName] = useState('');
  const [gitlabProjectName, setGitlabProjectName] = useState('');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getDeployRemainingCopy(language);
  const currentCopy = () => getDeployRemainingCopy(i18n.resolvedLanguage ?? i18n.language);

  const runDeployment = async <Result,>(
    provider: DeployProvider,
    action: () => Promise<Result>,
  ): Promise<Result | undefined> => {
    setIsDeploying(true);
    setDeployingTo(provider);

    try {
      return await action();
    } catch (error) {
      console.error(`${provider} deployment action failed:`, error);
      toast.error(currentCopy()['deployRemaining.button.failed']);

      return undefined;
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleVercelDeployClick = async () => {
    await runDeployment('vercel', async () => {
      if (onVercelDeploy) {
        return onVercelDeploy();
      }

      return handleVercelDeploy();
    });
  };

  const handleNetlifyDeployClick = async () => {
    await runDeployment('netlify', async () => {
      if (onNetlifyDeploy) {
        return onNetlifyDeploy();
      }

      return handleNetlifyDeploy();
    });
  };

  const handleGitHubDeployClick = async () => {
    const result = await runDeployment('github', async () => {
      if (onGitHubDeploy) {
        return onGitHubDeploy();
      }

      return handleGitHubDeploy();
    });

    if (result && result.success && result.files && Object.keys(result.files).length > 0) {
      setGithubDeploymentFiles(result.files);
      setGithubProjectName(result.projectName);
      setShowGitHubDeploymentDialog(true);
    }
  };

  const handleGitLabDeployClick = async () => {
    const result = await runDeployment('gitlab', async () => {
      if (onGitLabDeploy) {
        return onGitLabDeploy();
      }

      return handleGitLabDeploy();
    });

    if (result && result.success && result.files && Object.keys(result.files).length > 0) {
      setGitlabDeploymentFiles(result.files);
      setGitlabProjectName(result.projectName);
      setShowGitLabDeploymentDialog(true);
    }
  };

  const triggerLabel =
    isDeploying && deployingTo
      ? formatDeployRemainingCopy(copy['deployRemaining.button.deployingTo'], {
          provider: deployProviderName(copy, deployingTo),
        })
      : copy['deployRemaining.button.deploy'];

  return (
    <>
      <div className="flex max-w-full overflow-hidden rounded-md border border-bolt-elements-borderColor text-sm">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            disabled={isDeploying || !activePreview || isStreaming}
            aria-busy={isDeploying}
            aria-label={triggerLabel}
            className={classNames(
              buttonVariants({ variant: 'primary', size: 'sm' }),
              'min-h-11 min-w-0 max-w-full gap-1.5 whitespace-normal px-3 py-2 leading-snug',
            )}
          >
            {isDeploying ? <span className="i-svg-spinners:90-ring-with-bg shrink-0" aria-hidden /> : null}
            <span className="min-w-0 break-words">{triggerLabel}</span>
            {!isDeploying ? (
              <span className={classNames('i-ph:caret-down shrink-0 transition-transform')} aria-hidden />
            ) : null}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            className={classNames(
              'z-[250] min-w-[min(240px,calc(100vw-24px))] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-24px))] overflow-auto',
              'bg-bolt-elements-background-depth-2',
              'rounded-lg shadow-lg',
              'border border-bolt-elements-borderColor',
              'animate-in fade-in-0 zoom-in-95',
              'py-1',
            )}
            sideOffset={5}
            align="end"
            collisionPadding={12}
            hideWhenDetached
          >
            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bolt-elements-focus',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview || !netlifyConn.user,
                },
              )}
              disabled={isDeploying || !activePreview || !netlifyConn.user}
              onClick={handleNetlifyDeployClick}
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/netlify"
                alt=""
              />
              <span className="mx-auto min-w-0 break-words text-center leading-snug">
                {!netlifyConn.user
                  ? copy['deployRemaining.button.netlifyDisconnected']
                  : copy['deployRemaining.button.netlify']}
              </span>
              {netlifyConn.user && <NetlifyDeploymentLink />}
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bolt-elements-focus',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview || !vercelConn.user,
                },
              )}
              disabled={isDeploying || !activePreview || !vercelConn.user}
              onClick={handleVercelDeployClick}
            >
              <img
                className="w-5 h-5 bg-black p-1 rounded"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/vercel/white"
                alt=""
              />
              <span className="mx-auto min-w-0 break-words text-center leading-snug">
                {!vercelConn.user
                  ? copy['deployRemaining.button.vercelDisconnected']
                  : copy['deployRemaining.button.vercel']}
              </span>
              {vercelConn.user && <VercelDeploymentLink />}
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bolt-elements-focus',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview,
                },
              )}
              disabled={isDeploying || !activePreview}
              onClick={handleGitHubDeployClick}
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/github"
                alt=""
              />
              <span className="mx-auto min-w-0 break-words text-center leading-snug">
                {copy['deployRemaining.button.github']}
              </span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bolt-elements-focus',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview || !gitlabIsConnected,
                },
              )}
              disabled={isDeploying || !activePreview || !gitlabIsConnected}
              onClick={handleGitLabDeployClick}
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/gitlab"
                alt=""
              />
              <span className="mx-auto min-w-0 break-words text-center leading-snug">
                {!gitlabIsConnected
                  ? copy['deployRemaining.button.gitlabDisconnected']
                  : copy['deployRemaining.button.gitlab']}
              </span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              disabled
              className="flex min-h-11 w-full min-w-0 cursor-not-allowed items-center gap-2 rounded-md px-4 py-2 text-sm text-bolt-elements-textTertiary opacity-60"
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/cloudflare"
                alt=""
              />
              <span className="mx-auto min-w-0 break-words text-center leading-snug">
                {copy['deployRemaining.button.cloudflareSoon']}
              </span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      {/* GitHub Deployment Dialog */}
      {showGitHubDeploymentDialog && githubDeploymentFiles && (
        <GitHubDeploymentDialog
          isOpen={showGitHubDeploymentDialog}
          onClose={() => setShowGitHubDeploymentDialog(false)}
          projectName={githubProjectName}
          files={githubDeploymentFiles}
        />
      )}

      {/* GitLab Deployment Dialog */}
      {showGitLabDeploymentDialog && gitlabDeploymentFiles && (
        <GitLabDeploymentDialog
          isOpen={showGitLabDeploymentDialog}
          onClose={() => setShowGitLabDeploymentDialog(false)}
          projectName={gitlabProjectName}
          files={gitlabDeploymentFiles}
        />
      )}
    </>
  );
};
