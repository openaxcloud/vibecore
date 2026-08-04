import { ArrowLeft } from 'lucide-react';
import { type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { getImportHubProvider } from '~/lib/import-hub';

/**
 * Honest credential-gated import surface for the external-API providers
 * (Vercel, Figma, Claude). These sources require a user-supplied access token /
 * connected source that E-Code does not yet hold, so this page is explicit about
 * what is needed and never pretends an import happened. When the credential
 * connector is enabled the primary action becomes a real token exchange; today
 * it states the exact blocker (parity honesty — no fake success).
 */
const CREDENTIAL_PROVIDERS = new Set(['vercel', 'figma', 'claude']);

const CREDENTIAL_REQUIREMENT: Record<string, string> = {
  vercel: 'a Vercel access token with read access to the project you want to import',
  figma: 'a Figma personal access token and the file key of the design to import',
  claude: 'a connected Claude source for the design/artifact you want to import',
};

export function loader({ params }: LoaderFunctionArgs) {
  const provider = params.provider ?? '';

  if (!CREDENTIAL_PROVIDERS.has(provider)) {
    throw new Response(null, { status: 404 });
  }

  const meta = getImportHubProvider(provider);

  return { provider, label: meta?.label ?? provider, requirement: CREDENTIAL_REQUIREMENT[provider] };
}

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  data ? [{ title: `Import from ${data.label} - E-Code` }] : [{ title: 'Import - E-Code' }];

export default function ImportCredentialProviderPage() {
  const { label, requirement } = useLoaderData<typeof loader>();

  return (
    <AppShell title={`Import from ${label}`} description={`Connect ${label} to import into a persistent workspace.`}>
      <div className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
        <p className="text-sm text-bolt-elements-textSecondary">
          Importing from {label} needs {requirement}. This connector is credential-gated: it stays disabled until the
          token is connected, and it never reports a success it did not perform.
        </p>
        <div
          role="status"
          className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textTertiary"
        >
          Credential required — connect your {label} token to enable this import.
        </div>
        <Link
          to="/import"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--vc-ide-accent-action)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to all import sources
        </Link>
      </div>
    </AppShell>
  );
}
