import { ArrowLeft } from 'lucide-react';
import { type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import {
  formatImportHubCopy,
  getImportHubCopy,
  getImportHubCredentialRequirement,
  type ImportHubCredentialProviderId,
} from '~/lib/i18n/catalogs/import-hub';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { getImportHubProvider } from '~/lib/import-hub';

/**
 * Honest credential-gated import surface for the external-API providers
 * (Vercel, Figma, Claude). These sources require a user-supplied access token /
 * connected source that E-Code does not yet hold, so this page is explicit about
 * what is needed and never pretends an import happened. When the credential
 * connector is enabled the primary action becomes a real token exchange; today
 * it states the exact blocker (parity honesty — no fake success).
 */
const CREDENTIAL_PROVIDERS = new Set<ImportHubCredentialProviderId>(['vercel', 'figma', 'claude']);

function isCredentialProvider(provider: string): provider is ImportHubCredentialProviderId {
  return CREDENTIAL_PROVIDERS.has(provider as ImportHubCredentialProviderId);
}

export function loader({ params, request }: LoaderFunctionArgs) {
  const provider = params.provider ?? '';

  if (!isCredentialProvider(provider)) {
    throw new Response(null, { status: 404 });
  }

  const language = resolveRequestLocale(request).language;
  const providerMetadata = getImportHubProvider(provider, language);

  return {
    provider,
    language,
    label: providerMetadata?.label ?? provider,
    requirement: getImportHubCredentialRequirement(provider, language),
  };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getImportHubCopy(data?.language);

  return [
    {
      title: data
        ? formatImportHubCopy(copy['importHub.credential.metaTitle'], { label: data.label })
        : copy['importHub.credential.metaFallback'],
    },
  ];
};

export default function ImportCredentialProviderPage() {
  const { label, requirement, language } = useLoaderData<typeof loader>();
  const copy = getImportHubCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatImportHubCopy(template, values);

  return (
    <AppShell
      title={text(copy['importHub.credential.title'], { label })}
      description={text(copy['importHub.credential.description'], { label })}
    >
      <div className="min-w-0 w-full max-w-full overflow-x-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
        <p className="break-words text-sm leading-6 text-bolt-elements-textSecondary">
          {text(copy['importHub.credential.explanation'], { label, requirement })}
        </p>
        <div
          role="status"
          className="mt-4 break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm leading-6 text-bolt-elements-textTertiary"
        >
          {text(copy['importHub.credential.status'], { label })}
        </div>
        <Link
          to="/import"
          className="mt-5 inline-flex min-h-11 max-w-full min-w-0 flex-wrap items-center gap-1.5 break-words text-sm font-medium text-[var(--vc-ide-accent-action)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          {copy['importHub.credential.back']}
        </Link>
      </div>
    </AppShell>
  );
}
