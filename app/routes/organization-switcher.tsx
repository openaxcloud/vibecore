import * as RadixDialog from '@radix-ui/react-dialog';
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRouteError, useSearchParams } from 'react-router';
import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { Dialog, DialogTitle } from '~/components/ui/Dialog';
import {
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { getOrganizationAccessCopy } from '~/lib/i18n/catalogs/organization-access';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { buildOrganizationRows, type Organization } from '~/lib/organizations';
import { isReauthRedirect } from '~/lib/route-reauth';

const ORGANIZATION_SWITCHER_CANONICAL_URL = 'https://e-code.ai/organization-switcher';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getOrganizationAccessCopy(language);
  const title = copy['organizationAccess.switcher.metaTitle'];
  const description = copy['organizationAccess.switcher.metaDescription'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: ORGANIZATION_SWITCHER_CANONICAL_URL },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: ORGANIZATION_SWITCHER_CANONICAL_URL },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: `${ORGANIZATION_SWITCHER_CANONICAL_URL}?lang=en`,
    },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: `${ORGANIZATION_SWITCHER_CANONICAL_URL}?lang=fr`,
    },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: ORGANIZATION_SWITCHER_CANONICAL_URL },
  ];
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);

  try {
    const result = await apiRequest<{ organizations?: unknown }>(request, '/orgs');

    if (!Array.isArray(result.organizations)) {
      throw new TypeError('organizations');
    }

    const organizations = result.organizations.filter(
      (organization): organization is Organization =>
        Boolean(organization) &&
        typeof organization === 'object' &&
        typeof (organization as { id?: unknown }).id === 'string',
    );

    return json(
      { organizations, language: localeResolution.language },
      { headers: localeResponseHeaders(request, localeResolution) },
    );
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    throw json(
      { errorCode: 'loadFailed' as const },
      { status: 503, headers: localeResponseHeaders(request, localeResolution) },
    );
  }
}

type ActionErrorCode = 'nameRequired' | 'requestFailed';
type ActionResult = { ok: false; errorCode: ActionErrorCode };

export async function action({ request }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();

  const actionError = (errorCode: ActionErrorCode, status: number) =>
    json<ActionResult>({ ok: false, errorCode }, { status, headers: localeResponseHeaders(request, localeResolution) });

  if (!name) {
    return actionError('nameRequired', 400);
  }

  try {
    const created = await apiRequest<{ organization: Organization }>(request, '/orgs', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    /*
     * There is no active-org session state to flip (see ~/lib/organizations):
     * "switching" means navigating into an org-scoped page. Land the user in
     * the new organization's members page so they can invite teammates.
     */
    return redirect(`/organization-members?orgId=${encodeURIComponent(created.organization.id)}`);
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    if (error instanceof Response) {
      return actionError('requestFailed', error.status);
    }

    return actionError('requestFailed', 500);
  }
}

const BLUE_CTA =
  'inline-flex min-h-11 items-center justify-center whitespace-normal rounded-md bg-[var(--vc-action-primary)] px-4 py-2 text-center text-sm font-medium text-[var(--vc-action-primary-foreground)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60';

export default function OrganizationSwitcherPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getOrganizationAccessCopy(language);
  const { organizations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  // `?create=1` (e.g. the /teams/new redirect) opens the create-org modal on load.
  const [searchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('create') === '1');

  const error =
    actionData && !actionData.ok ? copy[`organizationAccess.switcher.${actionData.errorCode}` as const] : null;

  return (
    <AppShell
      title={copy['organizationAccess.switcher.title']}
      description={copy['organizationAccess.switcher.description']}
      actions={
        <button type="button" onClick={() => setCreateOpen(true)} className={BLUE_CTA}>
          {copy['organizationAccess.switcher.new']}
        </button>
      }
    >
      <ActivityList
        items={buildOrganizationRows(organizations, language).map((row) => ({
          ...row,
          icon: organizations.length ? Building2 : Plus,
        }))}
      />

      <RadixDialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        {createOpen ? (
          <Dialog onClose={() => setCreateOpen(false)} onBackdrop={() => setCreateOpen(false)}>
            <div className="p-6">
              <DialogTitle asChild>
                <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
                  {copy['organizationAccess.switcher.createTitle']}
                </h2>
              </DialogTitle>
              <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
                {copy['organizationAccess.switcher.createDescription']}
              </p>

              <Form method="post" className="mt-4 space-y-5">
                <div>
                  <label htmlFor="org-name" className="block text-sm font-medium text-bolt-elements-textPrimary">
                    {copy['organizationAccess.switcher.name']}
                  </label>
                  {/* text-base (16px) on mobile prevents iOS Safari's focus auto-zoom, which
                      shifts the viewport-fixed modal off-screen to the right; sm:text-sm keeps
                      the 14px desktop scale. */}
                  <input
                    id="org-name"
                    name="name"
                    type="text"
                    required
                    maxLength={120}
                    placeholder={copy['organizationAccess.switcher.namePlaceholder']}
                    className="mt-1 min-h-11 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-base text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none sm:text-sm"
                  />
                </div>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm"
                    style={{ color: 'var(--status-error-text)' }}
                  >
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center whitespace-normal rounded-md border border-bolt-elements-borderColor px-4 py-2 text-center text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                  >
                    {copy['organizationAccess.switcher.cancel']}
                  </button>
                  <button type="submit" disabled={busy} aria-busy={busy} className={BLUE_CTA}>
                    {busy ? copy['organizationAccess.switcher.creating'] : copy['organizationAccess.switcher.create']}
                  </button>
                </div>
              </Form>
            </div>
          </Dialog>
        ) : null}
      </RadixDialog.Root>
    </AppShell>
  );
}

export function ErrorBoundary() {
  const { i18n } = useTranslation();
  const copy = getOrganizationAccessCopy(i18n.resolvedLanguage ?? i18n.language);

  useRouteError();

  return (
    <AppShell
      title={copy['organizationAccess.switcher.title']}
      description={copy['organizationAccess.switcher.description']}
    >
      <div
        role="alert"
        className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-[var(--status-error-text)]"
      >
        <p className="break-words text-sm">{copy['organizationAccess.switcher.loadFailed']}</p>
        <div className="mt-4">
          <LinkButton to="/dashboard" variant="outline">
            {copy['organizationAccess.switcher.backDashboard']}
          </LinkButton>
        </div>
      </div>
    </AppShell>
  );
}
