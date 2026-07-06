import { KeyRound, Monitor, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function DesktopSettingsRoute() {
  const [settings, setSettings] = useState<DesktopSettingsState>({
    proxy: { mode: 'system' },
    trayEnabled: false,
    devicePolicy: { managed: false, source: 'local-defaults' },
  });

  const [authState, setAuthState] = useState<{ encryptionAvailable?: boolean; hasToken?: boolean }>({});
  const [status, setStatus] = useState('Desktop bridge not detected.');
  const [bridgeReady, setBridgeReady] = useState(false);
  const [showRawPolicy, setShowRawPolicy] = useState(false);

  useEffect(() => {
    const desktop = window.vibecoreDesktop;

    if (!desktop) {
      return;
    }

    setBridgeReady(true);

    Promise.all([desktop.settings.get(), desktop.auth.get()])
      .then(([desktopSettings, auth]) => {
        setSettings(desktopSettings as DesktopSettingsState);
        setAuthState({ encryptionAvailable: auth.encryptionAvailable, hasToken: Boolean(auth.token) });
        setStatus('Desktop bridge connected.');
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

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

  return (
    <AppShell title="Desktop settings" description="Native desktop controls for the E-Code Electron app.">
      <StatGrid
        stats={[
          {
            label: 'Bridge',
            value: bridgeReady ? 'Connected' : 'Web',
            detail: 'Electron preload API',
            icon: Monitor,
          },
          {
            label: 'Token storage',
            value: authState.encryptionAvailable ? 'Keychain' : 'Fallback',
            detail: 'safeStorage-backed session',
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

      {!bridgeReady ? (
        <EmptyState
          className="mt-6"
          icon={Monitor}
          title="Available in the E-Code desktop app"
          description="Proxy, tray, notifications and managed-device policy are native controls. Open this page inside the E-Code desktop app to configure them."
          actionLabel="Get the desktop app"
          to="/desktop"
        />
      ) : null}

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Proxy</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-bolt-elements-textSecondary">
            Mode
            <select
              className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="http://proxy.company.test:8080"
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
            className="rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={() => save({ ...settings, trayEnabled: !settings.trayEnabled })}
          >
            {settings.trayEnabled ? 'Disable tray' : 'Enable tray'}
          </button>
          <button
            className="rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={showTestNotification}
          >
            Test notification
          </button>
          <button
            className="rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!bridgeReady}
            onClick={openLocalFolder}
          >
            Open local folder
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Enterprise device policy</h2>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">
          Managed-device policy hooks are reserved for MDM configuration profiles, registry policies, and signed
          enterprise defaults.
        </p>
        <dl className="mt-3 grid gap-1.5 text-sm">
          {Object.entries(settings.devicePolicy).map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 border-b border-bolt-elements-borderColor pb-1.5"
            >
              <dt className="text-bolt-elements-textTertiary">{key}</dt>
              <dd className="font-mono text-bolt-elements-textPrimary">{String(value)}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => setShowRawPolicy((value) => !value)}
          className="mt-3 text-xs font-medium text-[var(--vc-ide-accent-action)] hover:underline"
          aria-expanded={showRawPolicy}
        >
          {showRawPolicy ? 'Hide raw' : 'View raw'}
        </button>
        {showRawPolicy ? (
          <pre className="mt-2 overflow-auto rounded-md bg-bolt-elements-background-depth-1 p-3 text-xs">
            {JSON.stringify(settings.devicePolicy, null, 2)}
          </pre>
        ) : null}
      </section>

      <p className="mt-4 text-sm text-bolt-elements-textSecondary" role="status">
        {status}
      </p>
    </AppShell>
  );
}
