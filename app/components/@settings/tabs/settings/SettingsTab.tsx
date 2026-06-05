import { motion } from 'framer-motion';
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import type { UserProfile } from '~/components/@settings/core/types';
import { Switch } from '~/components/ui/Switch';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { classNames } from '~/utils/classNames';
import { isMac } from '~/utils/os';

// Helper to get modifier key symbols/text
const getModifierSymbol = (modifier: string): string => {
  switch (modifier) {
    case 'meta':
      return isMac ? '⌘' : 'Win';
    case 'alt':
      return isMac ? '⌥' : 'Alt';
    case 'shift':
      return '⇧';
    default:
      return modifier;
  }
};

/*
 * Persist the panel's settings to the platform API (DB-backed, audit #3).
 * language/timezone are first-class user columns; notifications rides in the
 * `preferences` blob. Resolves false when the backend can't be reached (e.g.
 * an unauthenticated standalone IDE session) so callers fall back to the
 * localStorage cache without surfacing a hard error.
 */
async function persistPreferencesToBackend(settings: UserProfile): Promise<boolean> {
  try {
    const response = await fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        language: settings.language,
        timezone: settings.timezone,
        preferences: { notifications: settings.notifications },
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export default function SettingsTab() {
  const [currentTimezone, setCurrentTimezone] = useState('');

  const [settings, setSettings] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('bolt_user_profile');
    return saved
      ? JSON.parse(saved)
      : {
          notifications: true,
          language: 'en',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
  });

  /*
   * Gate the save effect until the backend hydration below has run, and skip
   * the one render the hydration merge itself triggers — otherwise we'd echo
   * the freshly-fetched values straight back as a redundant PATCH. We compare
   * against the last-known-persisted snapshot so only genuine user edits hit
   * the network.
   */
  const hydratedRef = useRef(false);
  const lastPersistedRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrentTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Hydrate from the backend on mount; DB wins over the localStorage cache.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/user/preferences', { headers: { accept: 'application/json' } });

        if (response.ok) {
          const data = (await response.json()) as {
            language?: string | null;
            timezone?: string | null;
            preferences?: { notifications?: boolean } | null;
          };

          if (!cancelled) {
            setSettings((prev) => {
              const merged: UserProfile = {
                ...prev,
                notifications: data.preferences?.notifications ?? prev.notifications,
                language: data.language ?? prev.language,
                timezone: data.timezone ?? prev.timezone,
              };

              /*
               * Mirror into the cache and mark as already-persisted so the
               * save effect below treats this merge as a no-op.
               */
              localStorage.setItem('bolt_user_profile', JSON.stringify({ ...prev, ...merged }));
              lastPersistedRef.current = JSON.stringify(merged);

              return merged;
            });
          }
        }
      } catch {
        // Offline or no backend account — keep the localStorage cache.
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Save settings when they change: localStorage cache first (always), then
   * the DB (source of truth) once hydrated and only for real changes.
   */
  useEffect(() => {
    try {
      const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');

      const updatedProfile = {
        ...existingProfile,
        notifications: settings.notifications,
        language: settings.language,
        timezone: settings.timezone,
      };
      localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));

      if (!hydratedRef.current) {
        return;
      }

      const snapshot = JSON.stringify({
        notifications: settings.notifications,
        language: settings.language,
        timezone: settings.timezone,
      });

      if (snapshot === lastPersistedRef.current) {
        return;
      }

      lastPersistedRef.current = snapshot;

      persistPreferencesToBackend(settings).then((persisted) => {
        toast.success(persisted ? 'Settings updated' : 'Settings saved locally');
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to update settings');
    }
  }, [settings]);

  return (
    <div className="space-y-4">
      {/* Language & Notifications */}
      <motion.div
        className="bg-bolt-elements-bg-depth-2 rounded-lg shadow-sm dark:shadow-none p-4 space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:palette-fill w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Preferences</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:translate-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Language</label>
          </div>
          <select
            value={settings.language}
            onChange={(e) => setSettings((prev) => ({ ...prev, language: e.target.value }))}
            className={classNames(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-bolt-elements-bg-depth-1',
              'border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'transition-all duration-200',
            )}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
            <option value="ru">Русский</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:bell-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Notifications</label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">
              {settings.notifications ? 'Notifications are enabled' : 'Notifications are disabled'}
            </span>
            <Switch
              checked={settings.notifications}
              onCheckedChange={(checked) => {
                // Update local state
                setSettings((prev) => ({ ...prev, notifications: checked }));

                // Update localStorage immediately
                const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');

                const updatedProfile = {
                  ...existingProfile,
                  notifications: checked,
                };
                localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));

                /*
                 * Dispatch storage event so other components react in-tab.
                 * The success toast + backend persistence are owned by the
                 * save effect that the setSettings above triggers.
                 */
                window.dispatchEvent(
                  new StorageEvent('storage', {
                    key: 'bolt_user_profile',
                    newValue: JSON.stringify(updatedProfile),
                  }),
                );
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* Timezone */}
      <motion.div
        className="bg-bolt-elements-bg-depth-2 rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:clock-fill w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Time Settings</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:globe-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Timezone</label>
          </div>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings((prev) => ({ ...prev, timezone: e.target.value }))}
            className={classNames(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-bolt-elements-bg-depth-1',
              'border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'transition-all duration-200',
            )}
          >
            {Array.from(new Set([currentTimezone, settings.timezone].filter(Boolean))).map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      {/* Simplified Keyboard Shortcuts */}
      <motion.div
        className="bg-bolt-elements-bg-depth-2 rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:keyboard-fill w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Keyboard Shortcuts</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-lg bg-bolt-elements-bg-depth-1">
            <div className="flex flex-col">
              <span className="text-sm text-bolt-elements-textPrimary">Toggle Theme</span>
              <span className="text-xs text-bolt-elements-textSecondary">Switch between light and dark mode</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeSwitch size="lg" title="Switch light/dark theme" />
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-bolt-elements-bg-depth-2 border border-bolt-elements-borderColor rounded shadow-sm">
                {getModifierSymbol('meta')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-bolt-elements-bg-depth-2 border border-bolt-elements-borderColor rounded shadow-sm">
                {getModifierSymbol('alt')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-bolt-elements-bg-depth-2 border border-bolt-elements-borderColor rounded shadow-sm">
                {getModifierSymbol('shift')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-bolt-elements-bg-depth-2 border border-bolt-elements-borderColor rounded shadow-sm">
                D
              </kbd>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
