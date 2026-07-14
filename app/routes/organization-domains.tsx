import { CheckCircle2, Clock, Copy, Globe, Plus, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect, shouldRethrowActionError } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

/*
 * ORG-level verified domains, backed by the existing endpoints:
 *   GET   /orgs/:orgId/domains                (app.ts:14549)
 *   POST  /orgs/:orgId/domains                (app.ts:14555)
 *   PATCH /orgs/:orgId/domains/:domain        (app.ts:14576)
 *   POST  /orgs/:orgId/domains/:domain/verify (app.ts:14602)
 * The verify handler checks a TXT record at `_vibecore.<domain>` equal to
 * `vibecore-domain-verification=<verificationToken>` (prisma-store verifyDomain).
 * This is distinct from per-PROJECT domains (projects.$projectId.domains.tsx).
 */
type DomainVerification = {
  id: string;
  organizationId: string;
  domain: string;
  verificationToken: string;
  verifiedAt?: string;
  redirectWww: boolean;
  wildcardEnabled: boolean;
  sslStatus: 'pending_dns' | 'dns_verified' | 'failed';
  createdAt: string;
};

// Mirror of the DNS challenge the API's verifyDomain enforces.
const TXT_HOST_PREFIX = '_vibecore.';
const TXT_VALUE_PREFIX = 'vibecore-domain-verification=';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  let domains: DomainVerification[] = [];
  let loadError: string | null = null;
  let loadErrorKind: 'permission' | 'temporary' | null = null;

  try {
    const result = await apiRequest<{ domains: DomainVerification[] }>(request, `/orgs/${organization.id}/domains`);
    domains = result.domains;
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      loadError = "You don't have permission to manage this organization's domains.";
      loadErrorKind = 'permission';
    } else {
      loadError = 'Verified domains are temporarily unavailable.';
      loadErrorKind = 'temporary';
    }
  }

  return json({
    orgId: organization.id,
    orgName: organization.name ?? organization.slug ?? organization.id,
    domains,
    loadError,
    loadErrorKind,
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    domain?: string;
    redirectWww?: string;
    wildcardEnabled?: string;
  };

  if (!body.orgId) {
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
  }

  try {
    if (body.intent === 'add') {
      const domain = (body.domain ?? '').trim().toLowerCase();

      if (!domain) {
        return json({ error: 'Enter a domain, e.g. app.example.com.' }, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/domains`, {
        method: 'POST',
        body: JSON.stringify({
          domain,
          redirectWww: body.redirectWww === 'on',
          wildcardEnabled: body.wildcardEnabled === 'on',
        }),
      });

      return json({ status: `Domain ${domain} added. Publish the TXT record below, then verify.` });
    }

    if (!body.domain) {
      return json({ error: 'Missing domain.' }, { status: 400 });
    }

    const domainPath = `/orgs/${body.orgId}/domains/${encodeURIComponent(body.domain)}`;

    if (body.intent === 'verify') {
      await apiRequest(request, `${domainPath}/verify`, { method: 'POST', body: JSON.stringify({}) });

      return json({ status: `${body.domain} verified.` });
    }

    if (body.intent === 'config') {
      await apiRequest(request, domainPath, {
        method: 'PATCH',
        body: JSON.stringify({
          redirectWww: body.redirectWww === 'on',
          wildcardEnabled: body.wildcardEnabled === 'on',
        }),
      });

      return json({ status: `${body.domain} settings saved.` });
    }

    return json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    if (isReauthRedirect(error) || shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      return json({ error: "You don't have permission to manage this organization's domains." }, { status: 403 });
    }

    if (isApiResponse(error)) {
      return json({ error: await apiErrorMessage(error, 'Domain action failed.') }, { status: error.status });
    }

    return json({ error: 'This action is temporarily unavailable. Please try again in a moment.' });
  }
}

function CopyField(props: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <span className="block text-xs font-medium text-bolt-elements-textSecondary">{props.label}</span>
      <div className="mt-1 flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 font-mono text-xs text-bolt-elements-textPrimary">
          {props.value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(props.value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => undefined,
            );
          }}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
          aria-label={`Copy ${props.label}`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ domain }: { domain: DomainVerification }) {
  if (domain.sslStatus === 'dns_verified' || domain.verifiedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-success-text)]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Verified
      </span>
    );
  }

  if (domain.sslStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-error-text)]">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
        Verification failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      Pending DNS
    </span>
  );
}

function CheckboxRow(props: { name: string; label: string; description: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-2 py-1">
      <input
        type="checkbox"
        name={props.name}
        defaultChecked={props.defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-bolt-elements-borderColor accent-bolt-elements-item-contentAccent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-bolt-elements-textPrimary">{props.label}</span>
        <span className="mt-0.5 block text-xs text-bolt-elements-textSecondary">{props.description}</span>
      </span>
    </label>
  );
}

export default function OrganizationDomainsPage() {
  const { orgId, orgName, domains, loadError, loadErrorKind } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== 'idle';
  const retrying = revalidator.state !== 'idle';

  if (loadError) {
    return (
      <EnterpriseFormPage
        title="Verified domains"
        description={`Add and verify custom domains for ${orgName}. Publish a DNS TXT record to prove ownership.`}
      >
        {retrying ? (
          <AsyncPanelSkeleton label="Loading verified domains" rows={4} />
        ) : (
          <AsyncPanelError
            title={loadErrorKind === 'permission' ? 'Domain management is restricted' : 'Domains could not load'}
            description={
              loadErrorKind === 'permission'
                ? "You don't have permission to view or change this organization's verified domains."
                : 'Domain controls are hidden because the latest request failed. No domain was changed.'
            }
            onRetry={revalidator.revalidate}
            retryLabel="Reload domains"
            tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </EnterpriseFormPage>
    );
  }

  return (
    <EnterpriseFormPage
      title="Verified domains"
      description={`Add and verify custom domains for ${orgName}. Publish a DNS TXT record to prove ownership.`}
      status={actionData?.status}
      error={actionData?.error}
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Add a domain</h2>
          <Form method="post" className="mt-3 space-y-4">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="intent" value="add" />
            <label className="block text-sm font-medium">
              Domain
              <input
                name="domain"
                placeholder="app.example.com"
                required
                className="mt-2 min-h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckboxRow
                name="redirectWww"
                label="Redirect www"
                description="Redirect www.<domain> to the apex domain."
                defaultChecked={true}
              />
              <CheckboxRow
                name="wildcardEnabled"
                label="Wildcard"
                description="Cover all subdomains (*.<domain>)."
                defaultChecked={false}
              />
            </div>
            <PrimaryButton disabled={busy}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                Add domain
              </span>
            </PrimaryButton>
          </Form>
        </section>

        <section className="border-t border-bolt-elements-borderColor pt-8">
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Domains</h2>

          {domains.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
                <Globe className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
              </span>
              <p className="text-sm text-bolt-elements-textSecondary">No domains yet. Add one above to get started.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {domains.map((domain) => {
                const verified = domain.sslStatus === 'dns_verified' || Boolean(domain.verifiedAt);

                return (
                  <li
                    key={domain.id}
                    className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1"
                  >
                    <div className="flex flex-col gap-2 border-b border-bolt-elements-borderColor p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <Globe className="h-4 w-4 shrink-0 text-bolt-elements-textSecondary" aria-hidden />
                        <span className="break-all text-sm font-medium text-bolt-elements-textPrimary">
                          {domain.domain}
                        </span>
                      </div>
                      <StatusBadge domain={domain} />
                    </div>

                    {!verified ? (
                      <div className="space-y-3 border-b border-bolt-elements-borderColor p-4">
                        <p className="text-xs text-bolt-elements-textSecondary">
                          Add this TXT record at your DNS provider, then click Verify once it propagates.
                        </p>
                        <CopyField label="TXT record name / host" value={`${TXT_HOST_PREFIX}${domain.domain}`} />
                        <CopyField label="TXT record value" value={`${TXT_VALUE_PREFIX}${domain.verificationToken}`} />
                        <Form method="post">
                          <input type="hidden" name="orgId" value={orgId} />
                          <input type="hidden" name="intent" value="verify" />
                          <input type="hidden" name="domain" value={domain.domain} />
                          <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            Verify domain
                          </button>
                        </Form>
                      </div>
                    ) : null}

                    <Form method="post" className="flex flex-col gap-3 p-4">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="intent" value="config" />
                      <input type="hidden" name="domain" value={domain.domain} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <CheckboxRow
                          name="redirectWww"
                          label="Redirect www"
                          description="Redirect www.<domain> to the apex domain."
                          defaultChecked={domain.redirectWww}
                        />
                        <CheckboxRow
                          name="wildcardEnabled"
                          label="Wildcard"
                          description="Cover all subdomains (*.<domain>)."
                          defaultChecked={domain.wildcardEnabled}
                        />
                      </div>
                      <div>
                        <button
                          type="submit"
                          disabled={busy}
                          className={classNames(
                            'inline-flex min-h-[44px] items-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                          )}
                        >
                          Save settings
                        </button>
                      </div>
                    </Form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </EnterpriseFormPage>
  );
}
