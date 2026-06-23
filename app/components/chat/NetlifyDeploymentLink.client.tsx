import { useStore } from '@nanostores/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect } from 'react';
import { chatId } from '~/lib/persistence/useChatHistory';
import { netlifyConnection, fetchNetlifyStats } from '~/lib/stores/netlify';

/*
 * Deploy site names are minted as `<prefix>-<chatId>-<timestamp>` (see
 * app/routes/api.netlify-deploy.ts).
 *
 * We accept both the product-brand `ecode-` prefix and the legacy upstream
 * `bolt-diy-` prefix so sites created before/after the rename both resolve.
 */
const SITE_NAME_PREFIXES = ['ecode', 'bolt-diy'] as const;

/*
 * Match the chat's site by a delimited key rather than a bare substring. A naive
 * `name.includes('<prefix>-' + chatId)` treats a short chatId (e.g. `12`) as a
 * prefix of another (`123`), so `Array.find` could return a *different*
 * project's live deployment. Requiring the chatId to be followed by the
 * `-<timestamp>` delimiter (or to be the whole suffix) prevents that collision.
 */
export function isNetlifySiteForChat(siteName: string, currentChatId: string): boolean {
  if (!currentChatId) {
    return false;
  }

  return SITE_NAME_PREFIXES.some((prefix) => {
    const base = `${prefix}-${currentChatId}`;
    return siteName === base || siteName.startsWith(`${base}-`);
  });
}

export function NetlifyDeploymentLink() {
  const connection = useStore(netlifyConnection);
  const currentChatId = useStore(chatId);

  useEffect(() => {
    if (connection.token && currentChatId) {
      fetchNetlifyStats(connection.token);
    }
  }, [connection.token, currentChatId]);

  const deployedSite = currentChatId
    ? connection.stats?.sites?.find((site) => isNetlifySiteForChat(site.name, currentChatId))
    : undefined;

  if (!deployedSite) {
    return null;
  }

  return (
    <Tooltip.Provider delayDuration={500}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <a
            href={deployedSite.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-textSecondary hover:text-[#00AD9F] z-50"
            onClick={(e) => {
              e.stopPropagation(); // This is to prevent click from bubbling up
            }}
          >
            <div className="i-ph:link w-4 h-4 hover:text-blue-400" />
          </a>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="px-3 py-2 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary text-xs z-50"
            sideOffset={5}
          >
            {deployedSite.url}
            <Tooltip.Arrow className="fill-bolt-elements-background-depth-3" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
