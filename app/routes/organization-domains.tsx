import { CheckCircle2, Clock, Copy, Globe, Plus, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatOrganizationDomainsCopy,
  getOrganizationDomainsCopy,
  resolveOrganizationDomainsLanguage,
  type OrganizationDomainsCopy,
} from '~/lib/i18n/catalogs/organization-domains';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
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
 * NOT distinct from `projects.$projectId.domains.tsx`, despite what this
 * comment used to claim: that route reads and writes the SAME
 * `/orgs/:orgId/domains` endpoints. `VerifiedDomain` has no `projectId` column
 * at all (`@@unique([organizationId, domain])`), so a domain is verified once
 * per ORGANISATION and is then usable by any of its projects — there is no
 * per-project domain to be distinct from. The two pages are two renderings of
 * one list; see R-1 in BUG_INVENTORY_LIVE.md for the consolidation.
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

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getOrganizationDomainsCopy(rootData?.language)['organizationDomains.metaTitle'] }];
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveOrganizationDomainsLanguage(resolveRequestLocale(request).language);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  let domains: DomainVerification[] = [];
  let loadError = false;
  let loadErrorKind: 'permission' | 'temporary' | null = null;

  try {
    const result = await apiRequest<{ domains: DomainVerification[] }>(request, `/orgs/${organization.id}/domains`);
    domains = result.domains;
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      loadError = true;
      loadErrorKind = 'permission';
    } else {
      loadError = true;
      loadErrorKind = 'temporary';
    }
  }

  return json({
    orgId: organization.id,
    orgName: organization.name ?? organization.slug ?? organization.id,
    domains,
    loadError,
    loadErrorKind,
    language,
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const copy = getOrganizationDomainsCopy(resolveRequestLocale(request).language);

  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    domain?: string;
    redirectWww?: string;
    wildcardEnabled?: string;
  };

  if (!body.orgId) {
    return json({ error: copy['organizationDomains.errors.organizationUnavailable'] }, { status: 400 });
  }

  try {
    if (body.intent === 'add') {
      const domain = (body.domain ?? '').trim().toLowerCase();

      if (!domain) {
        return json({ error: copy['organizationDomains.errors.domainRequired'] }, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/domains`, {
        method: 'POST',
        body: JSON.stringify({
          domain,
          redirectWww: body.redirectWww === 'on',
          wildcardEnabled: body.wildcardEnabled === 'on',
        }),
      });

      return json({
        status: formatOrganizationDomainsCopy(copy['organizationDomains.success.added'], { domain }),
      });
    }

    if (!body.domain) {
      return json({ error: copy['organizationDomains.errors.missingDomain'] }, { status: 400 });
    }

    const domainPath = `/orgs/${body.orgId}/domains/${encodeURIComponent(body.domain)}`;

    if (body.intent === 'verify') {
      await apiRequest(request, `${domainPath}/verify`, { method: 'POST', body: JSON.stringify({}) });

      return json({
        status: formatOrganizationDomainsCopy(copy['organizationDomains.success.verified'], {
          domain: body.domain,
        }),
      });
    }

    if (body.intent === 'config') {
      await apiRequest(request, domainPath, {
        method: 'PATCH',
        body: JSON.stringify({
          redirectWww: body.redirectWww === 'on',
          wildcardEnabled: body.wildcardEnabled === 'on',
        }),
      });

      return json({
        status: formatOrganizationDomainsCopy(copy['organizationDomains.success.saved'], {
          domain: body.domain,
        }),
      });
    }

    return json({ error: copy['organizationDomains.errors.unknownAction'] }, { status: 400 });
  } catch (error) {
    if (isReauthRedirect(error) || shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      return json({ error: copy['organizationDomains.errors.permission'] }, { status: 403 });
    }

    if (isApiResponse(error)) {
      return json({ error: copy['organizationDomains.errors.actionFailed'] }, { status: error.status });
    }

    return json({ error: copy['organizationDomains.errors.temporary'] });
  }
}

function CopyField(props: { label: string; value: string; copy: OrganizationDomainsCopy }) {
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
          aria-label={formatOrganizationDomainsCopy(props.copy['organizationDomains.copy.aria'], {
            label: props.label,
          })}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied ? props.copy['organizationDomains.copy.copied'] : props.copy['organizationDomains.copy.copy']}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ domain, copy }: { domain: DomainVerification; copy: OrganizationDomainsCopy }) {
  if (domain.sslStatus === 'dns_verified' || domain.verifiedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-success-text)]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        {copy['organizationDomains.status.verified']}
      </span>
    );
  }

  if (domain.sslStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-error-text)]">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
        {copy['organizationDomains.status.failed']}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {copy['organizationDomains.status.pending']}
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
  const {
    orgId,
    orgName,
    domains,
    loadError,
    loadErrorKind,
    language: loaderLanguage,
  } = useLoaderData<typeof loader>();

  const language = resolveOrganizationDomainsLanguage(loaderLanguage);
  const copy = getOrganizationDomainsCopy(language);
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== 'idle';
  const retrying = revalidator.state !== 'idle';

  const description = formatOrganizationDomainsCopy(copy['organizationDomains.description'], {
    organization: orgName,
  });

  if (loadError) {
    return (
      <EnterpriseFormPage title={copy['organizationDomains.title']} description={description}>
        {retrying ? (
          <AsyncPanelSkeleton label={copy['organizationDomains.load.loading']} rows={4} />
        ) : (
          <AsyncPanelError
            title={
              loadErrorKind === 'permission'
                ? copy['organizationDomains.load.permissionTitle']
                : copy['organizationDomains.load.errorTitle']
            }
            description={
              loadErrorKind === 'permission'
                ? copy['organizationDomains.load.permissionDescription']
                : copy['organizationDomains.load.errorDescription']
            }
            onRetry={revalidator.revalidate}
            retryLabel={copy['organizationDomains.load.retry']}
            tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </EnterpriseFormPage>
    );
  }

  return (
    <EnterpriseFormPage
      title={copy['organizationDomains.title']}
      description={description}
      status={actionData?.status}
      error={actionData?.error}
    >
      <div className="space-y-8">
        <section>
          <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
            {copy['organizationDomains.add.title']}
          </h2>
          <Form method="post" className="mt-3 space-y-4">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="intent" value="add" />
            <label className="block text-sm font-medium">
              {copy['organizationDomains.add.domain']}
              <input
                name="domain"
                placeholder={copy['organizationDomains.add.placeholder']}
                required
                className="mt-2 min-h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckboxRow
                name="redirectWww"
                label={copy['organizationDomains.options.redirect.label']}
                description={copy['organizationDomains.options.redirect.description']}
                defaultChecked={true}
              />
              <CheckboxRow
                name="wildcardEnabled"
                label={copy['organizationDomains.options.wildcard.label']}
                description={copy['organizationDomains.options.wildcard.description']}
                defaultChecked={false}
              />
            </div>
            <PrimaryButton disabled={busy}>
              <span className="inline-flex flex-wrap items-center justify-center gap-1.5 whitespace-normal text-center">
                <Plus className="h-4 w-4" aria-hidden />
                {copy['organizationDomains.add.submit']}
              </span>
            </PrimaryButton>
          </Form>
        </section>

        <section className="border-t border-bolt-elements-borderColor pt-8">
          <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
            {copy['organizationDomains.list.title']}
          </h2>

          {domains.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
                <Globe className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
              </span>
              <p className="break-words text-sm text-bolt-elements-textSecondary">
                {copy['organizationDomains.list.empty']}
              </p>
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
                      <StatusBadge domain={domain} copy={copy} />
                    </div>

                    {!verified ? (
                      <div className="space-y-3 border-b border-bolt-elements-borderColor p-4">
                        <p className="break-words text-xs text-bolt-elements-textSecondary">
                          {copy['organizationDomains.dns.instructions']}
                        </p>
                        <CopyField
                          copy={copy}
                          label={copy['organizationDomains.dns.host']}
                          value={`${TXT_HOST_PREFIX}${domain.domain}`}
                        />
                        <CopyField
                          copy={copy}
                          label={copy['organizationDomains.dns.value']}
                          value={`${TXT_VALUE_PREFIX}${domain.verificationToken}`}
                        />
                        <Form method="post">
                          <input type="hidden" name="orgId" value={orgId} />
                          <input type="hidden" name="intent" value="verify" />
                          <input type="hidden" name="domain" value={domain.domain} />
                          <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            {copy['organizationDomains.actions.verify']}
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
                          label={copy['organizationDomains.options.redirect.label']}
                          description={copy['organizationDomains.options.redirect.description']}
                          defaultChecked={domain.redirectWww}
                        />
                        <CheckboxRow
                          name="wildcardEnabled"
                          label={copy['organizationDomains.options.wildcard.label']}
                          description={copy['organizationDomains.options.wildcard.description']}
                          defaultChecked={domain.wildcardEnabled}
                        />
                      </div>
                      <div>
                        <button
                          type="submit"
                          disabled={busy}
                          className={classNames(
                            'inline-flex min-h-[44px] items-center whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                          )}
                        >
                          {copy['organizationDomains.actions.save']}
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
