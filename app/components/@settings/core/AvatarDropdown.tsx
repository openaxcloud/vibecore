import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ACCOUNT_MENU_LINKS, resolveAccountMenuLink } from './account-menu-links';
import type { TabType, Profile } from './types';
import {
  formatSettingsCoreCopy,
  getSettingsCoreCopy,
  resolveSettingsCoreLanguage,
} from '~/lib/i18n/catalogs/settings-core';
import { profileStore } from '~/lib/stores/profile';
import { classNames } from '~/utils/classNames';

interface AvatarDropdownProps {
  onSelectTab: (tab: TabType) => void;
}

export const AvatarDropdown = ({ onSelectTab }: AvatarDropdownProps) => {
  const profile = useStore(profileStore) as Profile;
  const { i18n } = useTranslation();
  const language = resolveSettingsCoreLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getSettingsCoreCopy(language);
  const [isDownloadingDebugLog, setIsDownloadingDebugLog] = useState(false);

  const accountMenuLabel = profile?.username
    ? formatSettingsCoreCopy(copy['settingsCore.avatar.menuFor'], { username: profile.username })
    : copy['settingsCore.avatar.menu'];
  const profileImageAlt = profile?.username
    ? formatSettingsCoreCopy(copy['settingsCore.avatar.imageAltFor'], { username: profile.username })
    : copy['settingsCore.avatar.imageAlt'];

  const openAccountMenuLink = (link: string) => {
    const openedWindow = window.open(resolveAccountMenuLink(link), '_blank', 'noopener,noreferrer');

    if (openedWindow) {
      openedWindow.opener = null;
    }
  };

  const handleDebugLogDownload = async () => {
    if (isDownloadingDebugLog) {
      return;
    }

    setIsDownloadingDebugLog(true);

    try {
      const { downloadDebugLog } = await import('~/utils/debugLogger');
      await downloadDebugLog();
      toast.success(copy['settingsCore.avatar.debugLogDownloaded']);
    } catch (error) {
      console.error('[settings-core] debug-log-download-failed', error);
      toast.error(copy['settingsCore.avatar.debugLogDownloadFailed']);
    } finally {
      setIsDownloadingDebugLog(false);
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <motion.button
          type="button"
          aria-label={accountMenuLabel}
          title={accountMenuLabel}
          className="vc-focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-transparent focus:outline-none"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt={profileImageAlt}
              className="w-full h-full rounded-full object-cover"
              loading="eager"
              decoding="sync"
            />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary">
              <div className="i-ph:user w-6 h-6" aria-hidden="true" />
            </div>
          )}
        </motion.button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          aria-label={accountMenuLabel}
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
                  alt={profileImageAlt}
                  className={classNames('w-full h-full', 'object-cover', 'transform-gpu', 'image-rendering-crisp')}
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-bolt-elements-textTertiary font-medium text-lg">
                  <div className="i-ph:user w-6 h-6" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium text-bolt-elements-textPrimary" dir="auto">
                {profile?.username || copy['settingsCore.avatar.guest']}
              </div>
              {profile?.bio && (
                <div className="truncate text-xs text-bolt-elements-textTertiary" dir="auto" title={profile.bio}>
                  {profile.bio}
                </div>
              )}
            </div>
          </div>

          <DropdownMenu.Item
            className={classNames(
              'flex min-h-11 items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group whitespace-normal [overflow-wrap:anywhere]',
            )}
            onClick={() => onSelectTab('profile')}
          >
            <div
              className="i-ph:user-circle w-4 h-4 shrink-0 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors"
              aria-hidden="true"
            />
            {copy['settingsCore.avatar.editProfile']}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex min-h-11 items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group whitespace-normal [overflow-wrap:anywhere]',
            )}
            onClick={() => onSelectTab('settings')}
          >
            <div
              className="i-ph:gear-six w-4 h-4 shrink-0 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors"
              aria-hidden="true"
            />
            {copy['settingsCore.avatar.settings']}
          </DropdownMenu.Item>

          <div className="my-1 border-t border-bolt-elements-borderColor" />

          <DropdownMenu.Item
            className={classNames(
              'flex min-h-11 items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group whitespace-normal [overflow-wrap:anywhere]',
            )}
            onClick={() => openAccountMenuLink(ACCOUNT_MENU_LINKS.reportBug)}
          >
            <div
              className="i-ph:bug w-4 h-4 shrink-0 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors"
              aria-hidden="true"
            />
            {copy['settingsCore.avatar.reportBug']}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex min-h-11 items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group whitespace-normal [overflow-wrap:anywhere]',
              isDownloadingDebugLog ? 'cursor-wait opacity-70' : '',
            )}
            disabled={isDownloadingDebugLog}
            aria-busy={isDownloadingDebugLog}
            onClick={() => void handleDebugLogDownload()}
          >
            <div
              className="i-ph:download w-4 h-4 shrink-0 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors"
              aria-hidden="true"
            />
            {
              copy[
                isDownloadingDebugLog
                  ? 'settingsCore.avatar.downloadingDebugLog'
                  : 'settingsCore.avatar.downloadDebugLog'
              ]
            }
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex min-h-11 items-center gap-2 px-4 py-2.5',
              'text-sm text-bolt-elements-textSecondary',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'hover:text-[var(--vc-ide-accent-action)]',
              'cursor-pointer transition-all duration-200',
              'outline-none vc-focus-ring',
              'group whitespace-normal [overflow-wrap:anywhere]',
            )}
            onClick={() => openAccountMenuLink(ACCOUNT_MENU_LINKS.helpDocs)}
          >
            <div
              className="i-ph:question w-4 h-4 shrink-0 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors"
              aria-hidden="true"
            />
            {copy['settingsCore.avatar.helpDocumentation']}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
