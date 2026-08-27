import { useStore } from '@nanostores/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ACCOUNT_MENU_LINKS, resolveAccountMenuLink } from '~/components/@settings/core/account-menu-links';
import { DeployButton } from '~/components/deploy/DeployButton';
import { buttonVariants } from '~/components/ui/Button';
import { Dropdown, DropdownItem } from '~/components/ui/Dropdown';
import { useHydrateConnectors } from '~/lib/hooks/useHydrateConnectors';
import { getHeaderActionButtonsCopy } from '~/lib/i18n/catalogs/header-action-buttons';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

async function downloadDebugLog(): Promise<boolean> {
  try {
    const { downloadDebugLog: run } = await import('~/utils/debugLogger');
    await run();

    return true;
  } catch (error) {
    console.error('Failed to download debug log:', error);

    return false;
  }
}

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted: _chatStarted }: HeaderActionButtonsProps) {
  const [activePreviewIndex] = useState(0);
  const [isDownloadingDebugLog, setIsDownloadingDebugLog] = useState(false);
  const { i18n } = useTranslation();
  const copy = getHeaderActionButtonsCopy(i18n.resolvedLanguage ?? i18n.language);
  const liveCopy = useRef(copy);
  liveCopy.current = copy;

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

  const openBugReport = () => {
    const openedWindow = window.open(
      resolveAccountMenuLink(ACCOUNT_MENU_LINKS.reportBug),
      '_blank',
      'noopener,noreferrer',
    );

    if (openedWindow) {
      openedWindow.opener = null;
    }
  };

  const handleDebugLogDownload = async () => {
    if (isDownloadingDebugLog) {
      return;
    }

    setIsDownloadingDebugLog(true);

    const downloaded = await downloadDebugLog();

    if (downloaded) {
      toast.success(liveCopy.current['headerActionButtons.debugLogDownloaded']);
    } else {
      toast.error(liveCopy.current['headerActionButtons.debugLogDownloadFailed']);
    }

    setIsDownloadingDebugLog(false);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
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
              title={copy['headerActionButtons.help.tooltip']}
              aria-label={copy['headerActionButtons.help.aria']}
              className={classNames(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'min-h-11 min-w-11 max-w-full gap-1.5 px-2 sm:px-3',
              )}
            >
              <div className="i-ph:question shrink-0" aria-hidden="true" />
              <span className="hidden min-w-0 sm:inline">{copy['headerActionButtons.help.label']}</span>
            </button>
          }
        >
          <DropdownItem
            className="min-h-11 min-w-0 whitespace-normal [overflow-wrap:anywhere]"
            onSelect={openBugReport}
          >
            <div className="i-ph:bug shrink-0" aria-hidden="true" />
            <span className="min-w-0">{copy['headerActionButtons.reportBug']}</span>
          </DropdownItem>
          <DropdownItem
            className={classNames(
              'min-h-11 min-w-0 whitespace-normal [overflow-wrap:anywhere]',
              isDownloadingDebugLog && 'pointer-events-none opacity-60',
            )}
            onSelect={() => void handleDebugLogDownload()}
          >
            <div
              className={classNames(
                'shrink-0',
                isDownloadingDebugLog ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:download',
              )}
              aria-hidden="true"
            />
            <span className="min-w-0" aria-live="polite">
              {
                copy[
                  isDownloadingDebugLog
                    ? 'headerActionButtons.downloadingDebugLog'
                    : 'headerActionButtons.downloadDebugLog'
                ]
              }
            </span>
          </DropdownItem>
        </Dropdown>
      )}
    </div>
  );
}
