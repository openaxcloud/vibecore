import type { MetaFunction } from 'react-router';
import { NavLink, Outlet } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { classNames } from '~/utils/classNames';

export const meta: MetaFunction = () => [{ title: 'Account settings - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

/*
 * Canonical account settings hub (H23). Profile, connected accounts and data &
 * privacy live here as tabs (each a nested route with its own loader/action);
 * the old /connected-accounts and /account-data routes 301 into these tabs.
 */
const TABS = [
  { to: '/account-settings', label: 'Account', end: true },
  { to: '/account-settings/connected', label: 'Connected accounts', end: false },
  { to: '/account-settings/data', label: 'Data & privacy', end: false },
] as const;

export default function AccountSettingsLayout() {
  return (
    <AppShell title="Account" description="Profile, connected accounts, and data & privacy for your account.">
      <div
        role="tablist"
        aria-label="Account settings"
        className="mb-6 flex gap-1 border-b border-bolt-elements-borderColor"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            role="tab"
            className={({ isActive }) =>
              classNames(
                'relative -mb-px inline-flex min-h-[44px] items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
                isActive
                  ? 'border-[var(--vc-ide-accent-action)] text-bolt-elements-textPrimary'
                  : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </AppShell>
  );
}
