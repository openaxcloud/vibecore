import { KeyRound, Monitor, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import { EmptyState } from '~/components/ui/EmptyState';
import {
  debounce,
  openDesktopLocalFolder,
  saveDesktopSettings,
  showDesktopTestNotification,
  type DesktopSettingsStatusKey,
} from '~/lib/desktop-settings-actions';
import { getDesktopSettingsCopy, resolveDesktopSettingsLanguage } from '~/lib/i18n/catalogs/desktop-settings';

interface DesktopSettingsState {
  proxy: { mode?: string; server?: string };
  trayEnabled: boolean;
  devicePolicy: { managed?: boolean; source?: string };
}

type DesktopSettingsPhase = 'checking' | 'ready' | 'unavailable' | 'error';

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getDesktopSettingsCopy(rootData?.language)['desktopSettings.metaTitle'] }];
};

export default function DesktopSettingsRoute() {
  const { i18n } = useTranslation();
  const language = resolveDesktopSettingsLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDesktopSettingsCopy(language);

  const [settings, setSettings] = useState<DesktopSettingsState>({
    proxy: { mode: 'system' },
    trayEnabled: false,
    devicePolicy: { managed: false, source: 'local-defaults' },
  });

  const [authState, setAuthState] = useState<{ encryptionAvailable?: boolean; hasToken?: boolean }>({});
  const [status, setStatus] = useState<DesktopSettingsStatusKey>('desktopSettings.status.checking');
  const [phase, setPhase] = useState<DesktopSettingsPhase>('checking');

  const loadDesktopSettings = useCallback(async () => {
    const desktop = window.vibecoreDesktop;

    if (!desktop) {
      setPhase('unavailable');
      setStatus('desktopSettings.status.openAppSettings');

      return;
    }

    setPhase('checking');
    setStatus('desktopSettings.status.loading');

    try {
      const [desktopSettings, auth] = await Promise.all([desktop.settings.get(), desktop.auth.get()]);
      setSettings(desktopSettings as DesktopSettingsState);
      setAuthState({ encryptionAvailable: auth.encryptionAvailable, hasToken: Boolean(auth.token) });
      setStatus('desktopSettings.status.loaded');
      setPhase('ready');
    } catch {
      setStatus('desktopSettings.status.loadFailed');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void loadDesktopSettings();
  }, [loadDesktopSettings]);

  const bridgeReady = phase === 'ready';

  /*
   * Persist immediately for discrete toggles/selects. Errors surface to the
   * status line instead of becoming unhandled rejections.
   */
  const persist = useCallback((next: DesktopSettingsState) => {
    void saveDesktopSettings(window.vibecoreDesktop, next).then(setStatus);
  }, []);

  /*
   * Debounced variant for the manual-server text field so we don't run
   * settings.set once per keystroke. Cancelled on unmount.
   */
  const persistDebounced = useMemo(() => debounce(persist, 400), [persist]);

  useEffect(() => () => persistDebounced.cancel(), [persistDebounced]);

  function save(next: DesktopSettingsState, options?: { debounced?: boolean }) {
    setSettings(next);

    if (options?.debounced) {
      persistDebounced(next);
    } else {
      persist(next);
    }
  }

  function showTestNotification() {
    void showDesktopTestNotification(window.vibecoreDesktop, language).then(setStatus);
  }

  function openLocalFolder() {
    void openDesktopLocalFolder(window.vibecoreDesktop).then(setStatus);
  }

  if (phase === 'checking') {
    return (
      <AppShell title={copy['desktopSettings.title']} description={copy['desktopSettings.description']}>
        <AsyncPanelSkeleton label={copy['desktopSettings.loading.label']} rows={5} />
      </AppShell>
    );
  }

  if (phase === 'error') {
    return (
      <AppShell title={copy['desktopSettings.title']} description={copy['desktopSettings.description']}>
        <AsyncPanelError
          title={copy['desktopSettings.error.title']}
          description={copy['desktopSettings.error.description']}
          onRetry={() => void loadDesktopSettings()}
        />
      </AppShell>
    );
  }

  if (phase === 'unavailable') {
    return (
      <AppShell title={copy['desktopSettings.title']} description={copy['desktopSettings.description']}>
        <EmptyState
          icon={Monitor}
          title={copy['desktopSettings.unavailable.title']}
          description={copy['desktopSettings.unavailable.description']}
          actionLabel={copy['desktopSettings.unavailable.action']}
          to="/desktop"
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={copy['desktopSettings.title']} description={copy['desktopSettings.description']}>
      <StatGrid
        stats={[
          {
            label: copy['desktopSettings.stats.connection.label'],
            value: copy['desktopSettings.stats.connection.value'],
            detail: copy['desktopSettings.stats.connection.detail'],
            icon: Monitor,
          },
          {
            label: copy['desktopSettings.stats.storage.label'],
            value: authState.encryptionAvailable
              ? copy['desktopSettings.stats.storage.protected']
              : copy['desktopSettings.stats.storage.limited'],
            detail: authState.encryptionAvailable
              ? copy['desktopSettings.stats.storage.encrypted']
              : copy['desktopSettings.stats.storage.unavailable'],
            icon: KeyRound,
          },
          {
            label: copy['desktopSettings.stats.session.label'],
            value: authState.hasToken
              ? copy['desktopSettings.stats.session.signedIn']
              : copy['desktopSettings.stats.session.notStored'],
            detail: copy['desktopSettings.stats.session.detail'],
            icon: Wifi,
          },
        ]}
      />

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
          {copy['desktopSettings.proxy.title']}
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-bolt-elements-textSecondary">
            {copy['desktopSettings.proxy.mode']}
            <select
              className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 disabled:cursor-not-allowed disabled:opacity-60"
              value={settings.proxy?.mode ?? 'system'}
              disabled={!bridgeReady}
              onChange={(event) => save({ ...settings, proxy: { ...settings.proxy, mode: event.target.value } })}
            >
              <option value="system">{copy['desktopSettings.proxy.system']}</option>
              <option value="direct">{copy['desktopSettings.proxy.direct']}</option>
              <option value="manual">{copy['desktopSettings.proxy.manual']}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-bolt-elements-textSecondary">
            {copy['desktopSettings.proxy.server']}
            <input
              className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder={copy['desktopSettings.proxy.serverPlaceholder']}
              value={settings.proxy?.server ?? ''}
              disabled={!bridgeReady}
              onChange={(event) =>
                save({ ...settings, proxy: { ...settings.proxy, server: event.target.value } }, { debounced: true })
              }
            />
          </label>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
          {copy['desktopSettings.native.title']}
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="h-auto min-h-[44px] whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={() => save({ ...settings, trayEnabled: !settings.trayEnabled })}
          >
            {settings.trayEnabled
              ? copy['desktopSettings.native.disableTray']
              : copy['desktopSettings.native.enableTray']}
          </button>
          <button
            className="h-auto min-h-[44px] whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={showTestNotification}
          >
            {copy['desktopSettings.native.testNotification']}
          </button>
          <button
            className="h-auto min-h-[44px] whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={openLocalFolder}
          >
            {copy['desktopSettings.native.openFolder']}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
          {copy['desktopSettings.device.title']}
        </h2>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">
          {settings.devicePolicy.managed
            ? copy['desktopSettings.device.managedDescription']
            : copy['desktopSettings.device.personalDescription']}
        </p>
        <dl className="mt-3 text-sm">
          <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 border-t border-bolt-elements-borderColor">
            <dt className="text-bolt-elements-textTertiary">{copy['desktopSettings.device.management']}</dt>
            <dd className="break-words text-right font-medium text-bolt-elements-textPrimary">
              {settings.devicePolicy.managed
                ? copy['desktopSettings.device.organizationManaged']
                : copy['desktopSettings.device.personal']}
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-4 text-sm text-bolt-elements-textSecondary" role="status">
        {copy[status]}
      </p>
    </AppShell>
  );
}
