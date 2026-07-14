import { Globe2, ShieldCheck } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

type Domain = {
  id: string;
  domain: string;
  verificationToken: string;
  verifiedAt?: string;
  createdAt?: string;

  /** Real TLS lifecycle from the api (VerifiedDomain.sslStatus). */
  sslStatus?: 'pending_dns' | 'dns_verified' | 'failed' | string;
};
type Project = { id: string; name: string; description?: string };

/** TLS/SSL status derived from the domain's real verification + sslStatus. */
function domainSsl(item: Domain): { label: string; tone: 'ok' | 'pending' | 'error' } {
  if (item.sslStatus === 'failed') {
    return { label: 'TLS: verification failed', tone: 'error' };
  }

  if (item.verifiedAt || item.sslStatus === 'dns_verified') {
    return { label: 'TLS certificate active', tone: 'ok' };
  }

  return { label: 'TLS pending domain verification', tone: 'pending' };
}

export const meta: MetaFunction = () => [{ title: 'Custom domains - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

/**
 * apiRequest throws a react-router `redirect()` Response (a 3xx with a Location
 * header and no JSON body) when the session expired (401) or MFA is required
 * (403) on a page navigation. Such a redirect is `instanceof Response`, so the
 * inline `error.json()` branches below would otherwise swallow it into a
 * body-less generic error and leave the user on a dead-end page. Detect it here
 * so the catch blocks can re-throw it and let the browser follow the re-auth
 * redirect.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: 'Project not found' }, { status: 404 });
  }

  const [projectResult, organization] = await Promise.all([
    apiRequest<{ project: Project }>(request, `/projects/${projectId}`),
    firstOrganizationOrNull(request),
  ]);

  if (!organization) {
    return redirect('/');
  }

  const domains = await apiRequest<{ domains: Domain[] }>(request, `/orgs/${organization.id}/domains`);

  return json({ project: projectResult.project, organization, domains: domains?.domains ?? [] });
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: 'Project not found' }, { status: 404 });
  }

  let organization: Awaited<ReturnType<typeof firstOrganization>>;

  try {
    organization = await firstOrganization(request);
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    /*
     * firstOrganization calls apiRequest('/orgs'), whose default
     * AbortSignal.timeout fires on a hung/draining api pod (rejecting with a
     * non-Response TimeoutError) and which also throws a 5xx Response on
     * upstream failure. Neither must reach the root error boundary and blow
     * away the whole Custom Domains page — surface the same friendly inline
     * message the add/verify branches use so the user stays on the page.
     */
    console.error('Organization lookup failed in domains action:', error);

    return json({ error: 'Unable to reach the domains service. Please try again in a moment.' });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const domain = String(form.get('domain') ?? '');

  if (intent === 'verify') {
    try {
      await apiRequest(request, `/orgs/${organization.id}/domains/${encodeURIComponent(domain)}/verify`, {
        method: 'POST',
      });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      /*
       * The API performs a real DNS TXT lookup and returns 422 with a human-readable message when the
       * record isn't visible yet. Surface that message inline instead of throwing to an error boundary.
       */
      if (error instanceof Response) {
        const payload = (await error.json().catch(() => ({}))) as { error?: string };
        return json({ error: payload.error ?? 'Domain verification failed. Check the DNS record and try again.' });
      }

      /*
       * A non-Response failure (e.g. the apiRequest AbortSignal.timeout firing on a slow
       * upstream DNS-TXT lookup, a hung/draining api pod, or a connection reset) would
       * otherwise propagate to the root error boundary and blow away the whole page.
       * Surface a friendly inline message instead so the user stays on the page.
       */
      console.error('Domain verification request failed:', error);

      return json({ error: 'Unable to reach the domains service. Please try again in a moment.' });
    }
  } else {
    try {
      await apiRequest(request, `/orgs/${organization.id}/domains`, {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      /*
       * The API validates the domain and rejects duplicates or invalid hosts. Surface that
       * message inline instead of throwing to an error boundary.
       */
      if (error instanceof Response) {
        const payload = (await error.json().catch(() => ({}))) as { error?: string };
        return json({ error: payload.error ?? 'Unable to add domain. Check the value and try again.' });
      }

      /*
       * A non-Response failure (e.g. the apiRequest AbortSignal.timeout firing, a hung/draining
       * api pod, DNS failure, or a connection reset) would otherwise propagate to the root error
       * boundary and blow away the whole page. Surface a friendly inline message instead.
       */
      console.error('Add-domain request failed:', error);

      return json({ error: 'Unable to reach the domains service. Please try again in a moment.' });
    }
  }

  return redirect(`/projects/${projectId}/domains`);
}

export default function ProjectDomainsPage() {
  const { project, domains } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <ProjectShell
      projectId={project.id}
      title="Custom domains"
      description="Map project deployments to verified domains with TLS readiness."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ActivityList
          items={
            domains.length
              ? domains.map((item) => {
                  const ssl = domainSsl(item);
                  return {
                    title: item.domain,
                    detail: `${
                      item.verifiedAt
                        ? `Verified ${formatUserAreaDateTime(item.verifiedAt) ?? 'date unavailable'}`
                        : 'Pending DNS verification'
                    } · ${ssl.label}`,
                    icon: item.verifiedAt ? ShieldCheck : Globe2,
                  };
                })
              : [{ title: 'No verified domains', detail: 'Add a domain to create a verification token.', icon: Globe2 }]
          }
        />
        <div className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
          {/* Step 1 — add the domain. */}
          <section className="grid gap-3">
            <StepHeader index={1} title="Add your domain" done={domains.length > 0} />
            <Form method="post" className="grid gap-3">
              <input
                className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
                name="domain"
                aria-label="Custom domain"
                placeholder="app.example.com"
                required
              />
              <Button type="submit" disabled={busy} aria-busy={busy}>
                {busy ? 'Adding…' : 'Add domain'}
              </Button>
            </Form>
            {actionData?.error ? (
              <p
                className="rounded-md border border-bolt-elements-icon-error bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-icon-error"
                role="alert"
              >
                {actionData.error}
              </p>
            ) : null}
          </section>

          {domains
            .filter((item) => !item.verifiedAt)
            .map((item) => {
              const ssl = domainSsl(item);
              return (
                <div
                  key={item.id}
                  className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
                >
                  {/* Step 2 — publish the DNS TXT record. */}
                  <section className="grid gap-2">
                    <StepHeader index={2} title={`Add the DNS record for ${item.domain}`} />
                    <p className="text-xs text-bolt-elements-textSecondary">
                      Add this TXT record at your domain registrar, then re-check once it propagates (usually a few
                      minutes, up to 48h):
                    </p>
                    <dl className="grid gap-1 text-xs">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <dt className="text-bolt-elements-textTertiary">Type</dt>
                        <dd className="font-mono">TXT</dd>
                      </div>
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <dt className="text-bolt-elements-textTertiary">Name / Host</dt>
                        <dd className="select-all break-all font-mono">{`_vibecore.${item.domain}`}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <dt className="text-bolt-elements-textTertiary">Value</dt>
                        <dd className="select-all break-all font-mono">{`vibecore-domain-verification=${item.verificationToken}`}</dd>
                      </div>
                    </dl>
                  </section>

                  {/* Step 3 — verify (re-check) and provision TLS. */}
                  <section className="grid gap-2">
                    <StepHeader index={3} title="Verify & secure" />
                    <p className="text-xs" data-ssl-tone={ssl.tone}>
                      <span
                        className={
                          ssl.tone === 'error'
                            ? 'text-bolt-elements-icon-error'
                            : ssl.tone === 'ok'
                              ? 'text-bolt-elements-icon-success'
                              : 'text-bolt-elements-textTertiary'
                        }
                      >
                        {ssl.label}
                      </span>
                    </p>
                    <Form method="post">
                      <input type="hidden" name="intent" value="verify" />
                      <input type="hidden" name="domain" value={item.domain} />
                      <Button type="submit" variant="outline" disabled={busy} aria-busy={busy}>
                        {busy ? 'Re-checking…' : 'Re-check DNS'}
                      </Button>
                    </Form>
                  </section>
                </div>
              );
            })}
        </div>
      </div>
    </ProjectShell>
  );
}

/** Numbered step marker for the DNS setup wizard. */
function StepHeader({ index, title, done }: { index: number; title: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          done
            ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bolt-elements-icon-success text-xs font-semibold text-white'
            : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vc-ide-accent-action)] text-xs font-semibold text-white'
        }
        aria-hidden
      >
        {done ? '✓' : index}
      </span>
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">{title}</h3>
    </div>
  );
}
