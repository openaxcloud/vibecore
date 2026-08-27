import { useTranslation } from 'react-i18next';
import { data as json, NavLink, Outlet, useLocation, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { getAccountSettingsLayoutCopy } from '~/lib/i18n/catalogs/account-data';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { classNames } from '~/utils/classNames';

export function loader({ request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);

  return json({ language: localeResolution.language }, { headers: localeResponseHeaders(request, localeResolution) });
}

const ACCOUNT_SETTINGS_CANONICAL_URL = 'https://e-code.ai/account-settings';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getAccountSettingsLayoutCopy(language).seo;
  const french = language === 'fr';

  return [
    { title: copy.title },
    { name: 'description', content: copy.description },
    { property: 'og:title', content: copy.title },
    { property: 'og:description', content: copy.description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: ACCOUNT_SETTINGS_CANONICAL_URL },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: copy.title },
    { name: 'twitter:description', content: copy.description },
    { tagName: 'link', rel: 'canonical', href: ACCOUNT_SETTINGS_CANONICAL_URL },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${ACCOUNT_SETTINGS_CANONICAL_URL}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${ACCOUNT_SETTINGS_CANONICAL_URL}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: ACCOUNT_SETTINGS_CANONICAL_URL },
  ];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

/*
 * Canonical account settings hub (H23). Profile, connected accounts and data &
 * privacy live here as tabs (each a nested route with its own loader/action);
 * the old /connected-accounts and /account-data routes 301 into these tabs.
 */
const TABS = [
  ['/account-settings', 'account', true],
  ['/account-settings/connected', 'connected', false],
  ['/account-settings/data', 'data', false],
] as const;

export default function AccountSettingsLayout() {
  const { i18n } = useTranslation();
  const copy = getAccountSettingsLayoutCopy(i18n.resolvedLanguage ?? i18n.language);
  const location = useLocation();

  return (
    <AppShell title={copy.shell.title} description={copy.shell.description}>
      <div
        role="tablist"
        aria-label={copy.tabs.ariaLabel}
        className="mb-6 flex max-w-full gap-1 overflow-x-auto overscroll-x-contain border-b border-bolt-elements-borderColor"
      >
        {/* role="tab" sans état est incomplet : l'onglet actif est annoncé via aria-selected. */}
        {TABS.map(([to, copyKey, end]) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            role="tab"
            aria-selected={end ? location.pathname === to : location.pathname.startsWith(to)}
            className={({ isActive }) =>
              classNames(
                'relative -mb-px inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
                isActive
                  ? 'border-[var(--vc-ide-accent-action)] text-bolt-elements-textPrimary'
                  : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )
            }
          >
            {copy.tabs[copyKey]}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </AppShell>
  );
}
