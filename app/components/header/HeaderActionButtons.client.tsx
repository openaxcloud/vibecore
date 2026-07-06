import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { ACCOUNT_MENU_LINKS, resolveAccountMenuLink } from '~/components/@settings/core/account-menu-links';
import { DeployButton } from '~/components/deploy/DeployButton';
import { buttonVariants } from '~/components/ui/Button';
import { useHydrateConnectors } from '~/lib/hooks/useHydrateConnectors';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted: _chatStarted }: HeaderActionButtonsProps) {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];

  /*
   * Recover Vercel/Netlify/Supabase connections from the encrypted server-side
   * UserConnection on IDE load, so they follow the signed-in user across devices
   * (the Deploy button + Database panel show "connected" without re-pasting a
   * token). Best-effort; no-op when this device already has a local connection.
   */
  useHydrateConnectors();

  const shouldShowButtons = activePreview;

  return (
    <div className="flex items-center gap-1">
      {/* Deploy Button */}
      {shouldShowButtons && <DeployButton />}

      {/* Debug Tools */}
      {shouldShowButtons && (
        <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden text-sm">
          <button
            onClick={() => window.open(resolveAccountMenuLink(ACCOUNT_MENU_LINKS.reportBug), '_blank')}
            className={classNames(buttonVariants({ variant: 'primary', size: 'sm' }), 'gap-1.5 rounded-none')}
            title="Report Bug"
          >
            <div className="i-ph:bug" />
            <span>Report Bug</span>
          </button>
          <div className="w-px bg-bolt-elements-borderColor" />
          <button
            onClick={async () => {
              try {
                const { downloadDebugLog } = await import('~/utils/debugLogger');
                await downloadDebugLog();
              } catch (error) {
                console.error('Failed to download debug log:', error);
              }
            }}
            className={classNames(buttonVariants({ variant: 'primary', size: 'sm' }), 'gap-1.5 rounded-none')}
            title="Download Debug Log"
          >
            <div className="i-ph:download" />
            <span>Debug Log</span>
          </button>
        </div>
      )}
    </div>
  );
}
