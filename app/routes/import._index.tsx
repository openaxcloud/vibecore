import { ArrowRight } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Link } from 'react-router';
import { isExternalDashboardLink } from './dashboard-nav';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { firstOrganizationOrNull, redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import {
  IMPORT_HUB_CATEGORY_LABELS,
  IMPORT_HUB_PROVIDERS,
  type ImportHubCategory,
  type ImportHubProvider,
} from '~/lib/import-hub';

export const meta: MetaFunction = () => [{ title: 'Import a project - E-Code' }];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return null;
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

function ImportTile({ provider }: { provider: ImportHubProvider }) {
  const Icon = provider.icon;
  const external = isExternalDashboardLink(provider.to);

  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <Icon className="h-5 w-5 text-bolt-elements-textPrimary" aria-hidden />
        </span>
        {provider.status === 'credential' ? (
          <span className="shrink-0 rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] font-medium text-bolt-elements-textTertiary">
            {provider.badge ?? 'Connect'}
          </span>
        ) : (
          <ArrowRight
            className="h-4 w-4 shrink-0 text-bolt-elements-textTertiary transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </span>
      <span className="mt-3 block text-sm font-semibold text-bolt-elements-textPrimary">{provider.label}</span>
      <span className="mt-1 block text-xs leading-relaxed text-bolt-elements-textSecondary">
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
  const groups = groupProviders(IMPORT_HUB_PROVIDERS);

  return (
    <AppShell
      title="Import a project"
      description="Bring your existing code, data or design into a persistent E-Code workspace. Files are staged and scanned for secrets before anything is committed."
    >
      <div className="flex flex-col gap-8" data-testid="import-hub">
        {groups.map(([category, providers]) => (
          <section key={category} aria-label={IMPORT_HUB_CATEGORY_LABELS[category]}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">
              {IMPORT_HUB_CATEGORY_LABELS[category]}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {providers.map((provider) => (
                <ImportTile key={provider.id} provider={provider} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
