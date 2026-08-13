import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { sidebarMenuStore } from '~/lib/stores/menu';
import { classNames } from '~/utils/classNames';

export function Header() {
  const chat = useStore(chatStore);
  const menuOpen = useStore(sidebarMenuStore);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary">
        <button
          type="button"
          onClick={() => sidebarMenuStore.set(!menuOpen)}
          aria-label="Chats"
          aria-expanded={menuOpen}
          title="Chats"
          data-vc-tooltip="Chats"
          className="flex h-8 w-8 items-center justify-center rounded-md text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
        >
          <span className="i-ph:sidebar-simple-duotone text-xl" aria-hidden />
        </button>
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          <img src="/logo-light-styled.png" alt="E-Code" className="w-[90px] inline-block dark:hidden" />
          <img src="/logo-dark-styled.png" alt="E-Code" className="w-[90px] inline-block hidden dark:block" />
        </a>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
    </header>
  );
}
