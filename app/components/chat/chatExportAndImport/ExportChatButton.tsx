import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/Button';
import { getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

export const ExportChatButton = ({ exportChat }: { exportChat?: () => void }) => {
  const { i18n } = useTranslation();
  const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className="flex max-w-full overflow-hidden rounded-md border border-bolt-elements-borderColor">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={classNames(
            buttonVariants({ variant: 'primary', size: 'sm' }),
            'min-h-11 min-w-0 gap-1.5 whitespace-normal px-3',
          )}
        >
          <span className="min-w-0 break-words">{copy['chatResiduals.export.trigger']}</span>
          <span className={classNames('i-ph:caret-down shrink-0 transition-transform')} aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className={classNames(
            'z-[250] min-w-[min(180px,calc(100vw-24px))] max-w-[calc(100vw-24px)] max-h-[min(320px,calc(100dvh-24px))] overflow-auto',
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
              'group relative flex min-h-11 w-auto cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm text-bolt-elements-textPrimary outline-none hover:bg-bolt-elements-item-backgroundActive focus:bg-bolt-elements-item-backgroundActive',
            )}
            onClick={() => {
              workbenchStore.downloadZip();
            }}
          >
            <div className="i-ph:code size-4.5 shrink-0" aria-hidden></div>
            <span className="break-words">{copy['chatResiduals.export.downloadCode']}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={classNames(
              'group relative flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm text-bolt-elements-textPrimary outline-none hover:bg-bolt-elements-item-backgroundActive focus:bg-bolt-elements-item-backgroundActive',
            )}
            onClick={() => exportChat?.()}
          >
            <div className="i-ph:chat size-4.5 shrink-0" aria-hidden></div>
            <span className="break-words">{copy['chatResiduals.export.exportChat']}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
};
