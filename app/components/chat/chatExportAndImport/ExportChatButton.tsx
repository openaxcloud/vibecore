import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { buttonVariants } from '~/components/ui/Button';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

export const ExportChatButton = ({ exportChat }: { exportChat?: () => void }) => {
  return (
    <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={classNames(buttonVariants({ variant: 'primary', size: 'sm' }), 'gap-1.5')}>
          Export
          <span className={classNames('i-ph:caret-down transition-transform')} />
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
              'cursor-pointer flex items-center w-auto px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
            )}
            onClick={() => {
              workbenchStore.downloadZip();
            }}
          >
            <div className="i-ph:code size-4.5"></div>
            <span>Download Code</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={classNames(
              'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
            )}
            onClick={() => exportChat?.()}
          >
            <div className="i-ph:chat size-4.5"></div>
            <span>Export Chat</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
};
