import { KeyRound, Monitor, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import { EmptyState } from '~/components/ui/EmptyState';
import {
  debounce,
  openDesktopLocalFolder,
  saveDesktopSettings,
  showDesktopTestNotification,
} from '~/lib/desktop-settings-actions';

interface DesktopSettingsState {
  proxy: { mode?: string; server?: string };
  trayEnabled: boolean;
  devicePolicy: { managed?: boolean; source?: string };
}

type DesktopSettingsPhase = 'checking' | 'ready' | 'unavailable' | 'error';

export default function DesktopSettingsRoute() {
  const [settings, setSettings] = useState<DesktopSettingsState>({
    proxy: { mode: 'system' },
    trayEnabled: false,
    devicePolicy: { managed: false, source: 'local-defaults' },
  });

  const [authState, setAuthState] = useState<{ encryptionAvailable?: boolean; hasToken?: boolean }>({});
  const [status, setStatus] = useState('Checking the desktop app…');
  const [phase, setPhase] = useState<DesktopSettingsPhase>('checking');

  const loadDesktopSettings = useCallback(async () => {
    const desktop = window.vibecoreDesktop;

    if (!desktop) {
      setPhase('unavailable');
      setStatus('Open this page in the E-Code desktop app to change native settings.');

      return;
    }

    setPhase('checking');
    setStatus('Loading desktop settings…');

    try {
      const [desktopSettings, auth] = await Promise.all([desktop.settings.get(), desktop.auth.get()]);
      setSettings(desktopSettings as DesktopSettingsState);
      setAuthState({ encryptionAvailable: auth.encryptionAvailable, hasToken: Boolean(auth.token) });
      setStatus('Desktop settings loaded.');
      setPhase('ready');
    } catch {
      setStatus('Desktop settings could not load. Try again.');
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
    void showDesktopTestNotification(window.vibecoreDesktop).then(setStatus);
  }

  function openLocalFolder() {
    void openDesktopLocalFolder(window.vibecoreDesktop).then(setStatus);
  }

  if (phase === 'checking') {
    return (
      <AppShell title="Desktop settings" description="Configure native app, network and device preferences.">
        <AsyncPanelSkeleton label="Loading desktop settings" rows={5} />
      </AppShell>
    );
  }

  if (phase === 'error') {
    return (
      <AppShell title="Desktop settings" description="Configure native app, network and device preferences.">
        <AsyncPanelError
          title="Desktop settings could not load"
          description="The native settings are hidden because the desktop app did not respond. No setting was changed."
          onRetry={() => void loadDesktopSettings()}
        />
      </AppShell>
    );
  }

  if (phase === 'unavailable') {
    return (
      <AppShell title="Desktop settings" description="Configure native app, network and device preferences.">
        <EmptyState
          icon={Monitor}
          title="Available in the E-Code desktop app"
          description="Proxy, tray, notifications and device management are native controls. Open this page inside the E-Code desktop app to configure them."
          actionLabel="Get the desktop app"
          to="/desktop"
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Desktop settings" description="Configure native app, network and device preferences.">
      <StatGrid
        stats={[
          {
            label: 'Desktop connection',
            value: 'Connected',
            detail: 'Native features available',
            icon: Monitor,
          },
          {
            label: 'Token storage',
            value: authState.encryptionAvailable ? 'Protected' : 'Limited',
            detail: authState.encryptionAvailable ? 'Encrypted session storage' : 'System protection unavailable',
            icon: KeyRound,
          },
          {
            label: 'Session',
            value: authState.hasToken ? 'Signed in' : 'Not stored',
            detail: 'SaaS login state',
            icon: Wifi,
          },
        ]}
      />

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Proxy</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-bolt-elements-textSecondary">
            Mode
            <select
              className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 disabled:cursor-not-allowed disabled:opacity-60"
              value={settings.proxy?.mode ?? 'system'}
              disabled={!bridgeReady}
              onChange={(event) => save({ ...settings, proxy: { ...settings.proxy, mode: event.target.value } })}
            >
              <option value="system">System</option>
              <option value="direct">Direct</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-bolt-elements-textSecondary">
            Manual server
            <input
              className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="http://proxy.example.com:8080"
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
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Native features</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="min-h-[44px] rounded-md border border-bolt-elements-borderColor px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={() => save({ ...settings, trayEnabled: !settings.trayEnabled })}
          >
            {settings.trayEnabled ? 'Disable tray' : 'Enable tray'}
          </button>
          <button
            className="min-h-[44px] rounded-md border border-bolt-elements-borderColor px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={showTestNotification}
          >
            Test notification
          </button>
          <button
            className="min-h-[44px] rounded-md border border-bolt-elements-borderColor px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={openLocalFolder}
          >
            Open local folder
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Device management</h2>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">
          {settings.devicePolicy.managed
            ? 'Your organization manages selected desktop settings on this device.'
            : 'This device uses your personal E-Code desktop settings.'}
        </p>
        <dl className="mt-3 text-sm">
          <div className="flex min-h-[44px] items-center justify-between gap-3 border-t border-bolt-elements-borderColor">
            <dt className="text-bolt-elements-textTertiary">Management</dt>
            <dd className="font-medium text-bolt-elements-textPrimary">
              {settings.devicePolicy.managed ? 'Organization managed' : 'Personal'}
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-4 text-sm text-bolt-elements-textSecondary" role="status">
        {status}
      </p>
    </AppShell>
  );
}
