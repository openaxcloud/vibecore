import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';
import { ACCOUNT_MENU_LINKS, resolveAccountMenuLink } from './account-menu-links';
import type { TabType, Profile } from './types';
import { profileStore } from '~/lib/stores/profile';
import { classNames } from '~/utils/classNames';

interface AvatarDropdownProps {
  onSelectTab: (tab: TabType) => void;
}

export const AvatarDropdown = ({ onSelectTab }: AvatarDropdownProps) => {
  const profile = useStore(profileStore) as Profile;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <motion.button
          aria-label={profile?.username ? `Account menu for ${profile.username}` : 'Account menu'}
          className="vc-focus-ring w-10 h-10 rounded-full bg-transparent flex items-center justify-center focus:outline-none"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt={profile?.username || 'Profile'}
              className="w-full h-full rounded-full object-cover"
              loading="eager"
              decoding="sync"
            />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary">
              <div className="i-ph:user w-6 h-6" />
            </div>
          )}
        </motion.button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={classNames(
            'min-w-[min(240px,calc(100vw-24px))] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-24px))] overflow-auto z-[250]',
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
          <div className={classNames('px-4 py-3 flex items-center gap-3', 'border-b border-bolt-elements-borderColor')}>
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-bolt-elements-background-depth-3 shadow-sm">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile?.username || 'Profile'}
                  className={classNames('w-full h-full', 'object-cover', 'transform-gpu', 'image-rendering-crisp')}
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-bolt-elements-textTertiary font-medium text-lg">
                  <div className="i-ph:user w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-bolt-elements-textPrimary truncate">
                {profile?.username || 'Guest User'}
              </div>
              {profile?.bio && <div className="text-xs text-bolt-elements-textTertiary truncate">{profile.bio}</div>}
            </div>
          </div>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group',
            )}
            onClick={() => onSelectTab('profile')}
          >
            <div className="i-ph:user-circle w-4 h-4 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors" />
            Edit Profile
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group',
            )}
            onClick={() => onSelectTab('settings')}
          >
            <div className="i-ph:gear-six w-4 h-4 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors" />
            Settings
          </DropdownMenu.Item>

          <div className="my-1 border-t border-bolt-elements-borderColor" />

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group',
            )}
            onClick={() => window.open(resolveAccountMenuLink(ACCOUNT_MENU_LINKS.reportBug), '_blank')}
          >
            <div className="i-ph:bug w-4 h-4 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors" />
            Report Bug
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group',
            )}
            onClick={async () => {
              try {
                const { downloadDebugLog } = await import('~/utils/debugLogger');
                await downloadDebugLog();
              } catch (error) {
                console.error('Failed to download debug log:', error);
              }
            }}
          >
            <div className="i-ph:download w-4 h-4 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors" />
            Download Debug Log
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group',
            )}
            onClick={() => window.open(resolveAccountMenuLink(ACCOUNT_MENU_LINKS.helpDocs), '_blank')}
          >
            <div className="i-ph:question w-4 h-4 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors" />
            Help & Documentation
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
