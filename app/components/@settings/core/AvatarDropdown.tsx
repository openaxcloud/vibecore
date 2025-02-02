import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { profileStore } from '~/lib/stores/profile';
import type { TabType, Profile } from './types';

interface AvatarDropdownProps {
  onSelectTab: (tab: TabType) => void;
}

export const AvatarDropdown = ({ onSelectTab }: AvatarDropdownProps) => {
  const profile = useStore(profileStore) as Profile;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <motion.button
          className="group flex items-center justify-center"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div
            className={classNames(
              'w-10 h-10',
              'rounded-full overflow-hidden',
              'bg-gray-100/50 dark:bg-gray-800/50',
              'flex items-center justify-center',
              'ring-1 ring-gray-200/50 dark:ring-gray-700/50',
              'group-hover:ring-purple-500/50 dark:group-hover:ring-purple-500/50',
              'group-hover:bg-purple-500/10 dark:group-hover:bg-purple-500/10',
              'transition-all duration-200',
              'relative',
            )}
          >
            {profile?.avatar ? (
              <div className="w-full h-full">
                <img
                  src={profile.avatar}
                  alt={profile?.username || 'Profile'}
                  className={classNames(
                    'w-full h-full',
                    'object-cover',
                    'transform-gpu',
                    'image-rendering-crisp',
                    'group-hover:brightness-110',
                    'group-hover:scale-105',
                    'transition-all duration-200',
                  )}
                  loading="eager"
                  decoding="sync"
                />
                <div
                  className={classNames(
                    'absolute inset-0',
                    'ring-1 ring-inset ring-black/5 dark:ring-white/5',
                    'group-hover:ring-purple-500/20 dark:group-hover:ring-purple-500/20',
                    'group-hover:bg-purple-500/5 dark:group-hover:bg-purple-500/5',
                    'transition-colors duration-200',
                  )}
                />
              </div>
            ) : (
              <div className="i-ph:robot-fill w-6 h-6 text-gray-400 dark:text-gray-400 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
            )}
          </div>
        </motion.button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={classNames(
            'min-w-[240px] z-[250]',
            'bg-white dark:bg-[#141414]',
            'rounded-lg shadow-lg',
            'border border-gray-200/50 dark:border-gray-800/50',
            'animate-in fade-in-0 zoom-in-95',
            'py-1',
          )}
          sideOffset={5}
          align="end"
        >
          <div
            className={classNames(
              'px-4 py-3 flex items-center gap-3',
              'border-b border-gray-200/50 dark:border-gray-800/50',
            )}
          >
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100/50 dark:bg-gray-800/50 flex-shrink-0">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile?.username || 'Profile'}
                  className={classNames('w-full h-full', 'object-cover', 'transform-gpu', 'image-rendering-crisp')}
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="i-ph:robot-fill w-6 h-6 text-gray-400 dark:text-gray-400 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                {profile?.username || 'Guest User'}
              </div>
              {profile?.bio && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{profile.bio}</div>}
            </div>
          </div>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-gray-700 dark:text-gray-200',
              'hover:bg-purple-50 dark:hover:bg-purple-500/10',
              'hover:text-purple-500 dark:hover:text-purple-400',
              'cursor-pointer transition-all duration-200',
              'outline-none',
              'group',
            )}
            onClick={() => onSelectTab('profile')}
          >
            <div className="i-ph:robot-fill w-4 h-4 text-gray-400 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
            Edit Profile
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-gray-700 dark:text-gray-200',
              'hover:bg-purple-50 dark:hover:bg-purple-500/10',
              'hover:text-purple-500 dark:hover:text-purple-400',
              'cursor-pointer transition-all duration-200',
              'outline-none',
              'group',
            )}
            onClick={() => onSelectTab('settings')}
          >
            <div className="i-ph:gear-six-fill w-4 h-4 text-gray-400 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
            Settings
          </DropdownMenu.Item>

          <div className="my-1 border-t border-gray-200/50 dark:border-gray-800/50" />

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-gray-700 dark:text-gray-200',
              'hover:bg-purple-50 dark:hover:bg-purple-500/10',
              'hover:text-purple-500 dark:hover:text-purple-400',
              'cursor-pointer transition-all duration-200',
              'outline-none',
              'group',
            )}
            onClick={() => onSelectTab('task-manager')}
          >
            <div className="i-ph:activity-fill w-4 h-4 text-gray-400 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
            Task Manager
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-4 py-2.5',
              'text-sm text-gray-700 dark:text-gray-200',
              'hover:bg-purple-50 dark:hover:bg-purple-500/10',
              'hover:text-purple-500 dark:hover:text-purple-400',
              'cursor-pointer transition-all duration-200',
              'outline-none',
              'group',
            )}
            onClick={() => onSelectTab('service-status')}
          >
            <div className="i-ph:heartbeat-fill w-4 h-4 text-gray-400 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
            Service Status
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
