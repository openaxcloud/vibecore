import { useEffect, useState } from 'react';
import { AppShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import { KeyRound, Monitor, Wifi } from 'lucide-react';

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

  useEffect(() => {
    const desktop = window.vibecoreDesktop;

    if (!desktop) {
      return;
    }

    Promise.all([desktop.settings.get(), desktop.auth.get()])
      .then(([desktopSettings, auth]) => {
        setSettings(desktopSettings as DesktopSettingsState);
        setAuthState({ encryptionAvailable: auth.encryptionAvailable, hasToken: Boolean(auth.token) });
        setStatus('Desktop bridge connected.');
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  async function save(next: DesktopSettingsState) {
    setSettings(next);

    if (!window.vibecoreDesktop) {
      setStatus('Desktop bridge not detected. Settings are staged in this browser session.');
      return;
    }

    await window.vibecoreDesktop.settings.set(next);
    setStatus('Desktop settings saved.');
  }

  async function showTestNotification() {
    if (!window.vibecoreDesktop) {
      setStatus('Desktop bridge not detected. Native notifications require Electron.');
      return;
    }

    await window.vibecoreDesktop.notifications.show({
      title: 'VibeCore',
      body: 'Native notifications are enabled.',
    });
    setStatus('Test notification sent.');
  }

  async function openLocalFolder() {
    if (!window.vibecoreDesktop) {
      setStatus('Desktop bridge not detected. Local folder import requires Electron.');
      return;
    }

    const folder = await window.vibecoreDesktop.files.openLocalFolder();
    setStatus(folder ? `Folder selected: ${folder}` : 'Folder selection canceled.');
  }

  return (
    <AppShell title="Desktop settings" description="Native desktop controls for the VibeCore Electron app.">
      <StatGrid
        stats={[
          {
            label: 'Bridge',
            value: window.vibecoreDesktop ? 'Connected' : 'Web',
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

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Proxy</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-bolt-elements-textSecondary">
            Mode
            <select
              className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2"
              value={settings.proxy?.mode ?? 'system'}
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
              className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2"
              placeholder="http://proxy.company.test:8080"
              value={settings.proxy?.server ?? ''}
              onChange={(event) => save({ ...settings, proxy: { ...settings.proxy, server: event.target.value } })}
            />
          </label>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Native features</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm"
            onClick={() => save({ ...settings, trayEnabled: !settings.trayEnabled })}
          >
            {settings.trayEnabled ? 'Disable tray' : 'Enable tray'}
          </button>
          <button
            className="rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm"
            onClick={showTestNotification}
          >
            Test notification
          </button>
          <button
            className="rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm"
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
        <pre className="mt-3 overflow-auto rounded-md bg-bolt-elements-background-depth-1 p-3 text-xs">
          {JSON.stringify(settings.devicePolicy, null, 2)}
        </pre>
      </section>

      <p className="mt-4 text-sm text-bolt-elements-textSecondary" role="status">
        {status}
      </p>
    </AppShell>
  );
}
