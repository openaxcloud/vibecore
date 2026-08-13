import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { ACCOUNT_MENU_LINKS, resolveAccountMenuLink } from '~/components/@settings/core/account-menu-links';
import { DeployButton } from '~/components/deploy/DeployButton';
import { buttonVariants } from '~/components/ui/Button';
import { Dropdown, DropdownItem } from '~/components/ui/Dropdown';
import { useHydrateConnectors } from '~/lib/hooks/useHydrateConnectors';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

async function downloadDebugLog() {
  try {
    const { downloadDebugLog: run } = await import('~/utils/debugLogger');
    await run();
  } catch (error) {
    console.error('Failed to download debug log:', error);
  }
}

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

      {/* Help & debug tools — collapsed into a single menu so the header isn't
          cluttered by two permanent debug buttons. */}
      {shouldShowButtons && (
        <Dropdown
          align="end"
          trigger={
            <button
              type="button"
              title="Help & debug tools"
              aria-label="Help and debug tools"
              className={classNames(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <div className="i-ph:question" />
              <span>Help</span>
            </button>
          }
        >
          <DropdownItem onSelect={() => window.open(resolveAccountMenuLink(ACCOUNT_MENU_LINKS.reportBug), '_blank')}>
            <div className="i-ph:bug" />
            Report a bug
          </DropdownItem>
          <DropdownItem onSelect={() => void downloadDebugLog()}>
            <div className="i-ph:download" />
            Download debug log
          </DropdownItem>
        </Dropdown>
      )}
    </div>
  );
}
