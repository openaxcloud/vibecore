import { Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useNavigation } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { getImportRoutesCopy } from '~/lib/i18n/catalogs/import-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

const IMPORT_GIT_CANONICAL_URL = 'https://e-code.ai/import-github';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getImportRoutesCopy(language);
  const title = copy['importRoutes.git.meta.title'];
  const description = copy['importRoutes.git.meta.description'];
  const french = language === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: IMPORT_GIT_CANONICAL_URL },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: IMPORT_GIT_CANONICAL_URL },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${IMPORT_GIT_CANONICAL_URL}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${IMPORT_GIT_CANONICAL_URL}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: IMPORT_GIT_CANONICAL_URL },
  ];
};

type Project = { id: string; slug?: string };
type ImportGitErrorCode = 'urlRequired' | 'inaccessible' | 'quota' | 'importFailed';
type ImportGitActionData = { errorCode: ImportGitErrorCode };

/*
 * Route the import to the matching server endpoint by repository host so one page
 * imports GitHub, GitLab and Bitbucket (each backed by its own per-provider,
 * org-scoped import route). SSH (git@host:org/repo) is normalised to a URL first.
 * Unknown hosts default to the GitHub endpoint (its schema still SSRF-validates).
 */
export function importEndpointForUrl(orgId: string, repositoryUrl: string): string {
  let host = '';

  try {
    host = new URL(repositoryUrl.trim().replace(/^git@([^:]+):/, 'https://$1/')).host.toLowerCase();
  } catch {
    host = '';
  }

  const provider = host.includes('gitlab') ? 'gitlab' : host.includes('bitbucket') ? 'bitbucket' : 'github';

  return `/orgs/${orgId}/projects/import/${provider}`;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return json({ language: localeResolution.language }, { headers: localeResponseHeaders(request, localeResolution) });
}

export async function action({ request }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);

  const actionError = (errorCode: ImportGitErrorCode, status: number) =>
    json<ImportGitActionData>({ errorCode }, { status, headers: localeResponseHeaders(request, localeResolution) });

  const body = formObject(await request.formData()) as { repositoryUrl?: string; branch?: string; name?: string };
  const repositoryUrl = body.repositoryUrl?.trim();

  if (!repositoryUrl) {
    return actionError('urlRequired', 400);
  }

  let result: { project: Project };

  try {
    const organization = await firstOrganization(request);
    result = await apiRequest<{ project: Project }>(request, importEndpointForUrl(organization.id, repositoryUrl), {
      method: 'POST',
      body: JSON.stringify({
        repositoryUrl,
        branch: body.branch?.trim() || undefined,
        name: body.name?.trim() || undefined,
      }),
    });

    return redirect(
      projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
    );
  } catch (error) {
    /*
     * A 3xx re-auth redirect (session expiry / MFA) must be re-thrown so the
     * framework performs the redirect. Every other API failure — invalid /
     * private / missing repo (400/404), quota exceeded (402), upstream 500 —
     * arrives as a thrown `Response` and should surface inline in the form
     * instead of crashing to the route error boundary.
     */
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    if (isApiResponse(error, 400) || isApiResponse(error, 404)) {
      return actionError('inaccessible', error.status);
    }

    if (isApiResponse(error, 402) || isApiResponse(error, 429)) {
      return actionError('quota', error.status);
    }

    return actionError('importFailed', error instanceof Response ? error.status : 500);
  }
}

export default function ImportGithubPage() {
  const { i18n } = useTranslation();
  const copy = getImportRoutesCopy(i18n.resolvedLanguage ?? i18n.language);
  const actionData = useActionData<typeof action>() as ImportGitActionData | undefined;
  const navigation = useNavigation();
  const importing = navigation.state === 'submitting';
  const actionError = actionData?.errorCode ? copy[`importRoutes.git.error.${actionData.errorCode}`] : null;

  return (
    <AppShell title={copy['importRoutes.git.page.title']} description={copy['importRoutes.git.page.description']}>
      <div className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
        <Github className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {actionError ? (
          <p role="alert" className="mb-4 text-sm text-[var(--status-error-text)]">
            {actionError}
          </p>
        ) : null}
        <Form method="post" className="grid min-w-0 gap-4">
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            {copy['importRoutes.git.form.repositoryUrl']}
            <input
              className="min-h-11 w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none sm:text-sm"
              name="repositoryUrl"
              type="url"
              required
              placeholder={copy['importRoutes.git.form.repositoryPlaceholder']}
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            {copy['importRoutes.git.form.branch']}
            <input
              className="min-h-11 w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none sm:text-sm"
              name="branch"
              placeholder={copy['importRoutes.git.form.branchPlaceholder']}
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            {copy['importRoutes.git.form.projectName']}
            <input
              className="min-h-11 w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none sm:text-sm"
              name="name"
              placeholder={copy['importRoutes.git.form.projectPlaceholder']}
            />
          </label>
          <Button
            type="submit"
            className="min-h-11 w-full whitespace-normal sm:w-fit"
            disabled={importing}
            aria-busy={importing}
          >
            {importing ? copy['importRoutes.git.form.importing'] : copy['importRoutes.git.form.submit']}
          </Button>
          {importing ? (
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1"
              role="progressbar"
              aria-label={copy['importRoutes.git.form.progress']}
            >
              <div className="h-full w-full animate-pulse rounded-full bg-[var(--vc-ide-accent-action)]" />
            </div>
          ) : null}
        </Form>
      </div>
    </AppShell>
  );
}
