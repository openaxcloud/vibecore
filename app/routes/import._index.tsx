import { ArrowRight } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import { isExternalDashboardLink } from './dashboard-nav';
import { AsyncPanelError } from '~/components/dashboard/AsyncPanelState';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { firstOrganizationOrNull, redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { getImportHubCopy } from '~/lib/i18n/catalogs/import-hub';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import {
  getImportHubCategoryLabels,
  getImportHubProviders,
  type ImportHubCategory,
  type ImportHubProvider,
} from '~/lib/import-hub';

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: getImportHubCopy(data?.language)['importHub.meta.title'] },
];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveRequestLocale(request).language;

  try {
    const organization = await firstOrganizationOrNull(request);

    if (!organization) {
      return redirect('/');
    }

    return { language, loadError: false as const };
  } catch (error) {
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      throw error;
    }

    return { language, loadError: true as const };
  }
}

/** Preserve the documented order while grouping tiles under their category. */
const CATEGORY_ORDER: ImportHubCategory[] = ['git', 'export', 'data', 'design', 'ai', 'blank'];

function groupProviders(providers: ImportHubProvider[]): Array<[ImportHubCategory, ImportHubProvider[]]> {
  const groups = new Map<ImportHubCategory, ImportHubProvider[]>();

  for (const provider of providers) {
    const current = groups.get(provider.category) ?? [];
    current.push(provider);
    groups.set(provider.category, current);
  }

  return CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => [category, groups.get(category)!]);
}

function ImportTile({ provider, connectLabel }: { provider: ImportHubProvider; connectLabel: string }) {
  const Icon = provider.icon;
  const external = isExternalDashboardLink(provider.to);

  const body = (
    <>
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <Icon className="h-5 w-5 text-bolt-elements-textPrimary" aria-hidden />
        </span>
        {provider.status === 'credential' ? (
          <span className="min-w-0 max-w-full break-words rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-right text-[11px] font-medium leading-4 text-bolt-elements-textTertiary">
            {provider.badge ?? connectLabel}
          </span>
        ) : (
          <ArrowRight
            className="h-4 w-4 shrink-0 text-bolt-elements-textTertiary transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </span>
      <span className="mt-3 block break-words text-sm font-semibold text-bolt-elements-textPrimary">
        {provider.label}
      </span>
      <span className="mt-1 block break-words text-xs leading-relaxed text-bolt-elements-textSecondary">
        {provider.description}
      </span>
    </>
  );

  const className =
    'group flex w-full min-w-0 flex-col rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-left transition-colors hover:border-[var(--vc-ide-accent-action)] hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]';

  if (external) {
    return (
      <a href={provider.to} className={className} data-import-source={provider.id}>
        {body}
      </a>
    );
  }

  return (
    <Link to={provider.to} className={className} data-import-source={provider.id}>
      {body}
    </Link>
  );
}

export default function ImportHubPage() {
  const { language, loadError } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const copy = getImportHubCopy(language);
  const categoryLabels = getImportHubCategoryLabels(language);
  const groups = groupProviders(getImportHubProviders(language));

  return (
    <AppShell title={copy['importHub.page.title']} description={copy['importHub.page.description']}>
      {loadError ? (
        <AsyncPanelError
          title={copy['importHub.error.title']}
          description={copy['importHub.error.description']}
          retryLabel={copy['importHub.error.retry']}
          retrying={revalidator.state !== 'idle'}
          onRetry={() => revalidator.revalidate()}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-8" data-testid="import-hub">
          {groups.map(([category, providers]) => (
            <section key={category} className="min-w-0" aria-label={categoryLabels[category]}>
              <h2 className="mb-3 break-words text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">
                {categoryLabels[category]}
              </h2>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {providers.map((provider) => (
                  <ImportTile key={provider.id} provider={provider} connectLabel={copy['importHub.action.connect']} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
