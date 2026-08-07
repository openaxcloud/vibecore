import { FilePlus2 } from 'lucide-react';
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

const IMPORT_EMPTY_CANONICAL_URL = 'https://e-code.ai/import/empty';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getImportRoutesCopy(language);
  const title = copy['importRoutes.empty.meta.title'];
  const description = copy['importRoutes.empty.meta.description'];
  const french = language === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: IMPORT_EMPTY_CANONICAL_URL },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: IMPORT_EMPTY_CANONICAL_URL },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${IMPORT_EMPTY_CANONICAL_URL}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${IMPORT_EMPTY_CANONICAL_URL}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: IMPORT_EMPTY_CANONICAL_URL },
  ];
};

type Project = { id: string; slug?: string };
type ImportEmptyErrorCode = 'quota' | 'createFailed';
type ImportEmptyActionData = { errorCode: ImportEmptyErrorCode };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return json({ language: localeResolution.language }, { headers: localeResponseHeaders(request, localeResolution) });
}

/**
 * Create a genuinely blank workspace — no agent prompt, no framework, no
 * scaffolding beyond the minimal files the runtime needs to boot. This is the
 * power-user path (Replit-parity "empty" import source): the project opens
 * straight in the IDE, ready to edit, with no generation step.
 */
export async function action({ request }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const copy = getImportRoutesCopy(localeResolution.language);

  const actionError = (errorCode: ImportEmptyErrorCode, status: number) =>
    json<ImportEmptyActionData>({ errorCode }, { status, headers: localeResponseHeaders(request, localeResolution) });

  const body = formObject(await request.formData()) as { name?: string };
  const name = body.name?.trim() || copy['importRoutes.empty.generated.defaultName'];

  let result: { project: Project };

  try {
    const organization = await firstOrganization(request);
    result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    return redirect(
      projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
    );
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    if (isApiResponse(error, 402) || isApiResponse(error, 429)) {
      return actionError('quota', error.status);
    }

    return actionError('createFailed', error instanceof Response ? error.status : 500);
  }
}

export default function ImportEmptyPage() {
  const { i18n } = useTranslation();
  const copy = getImportRoutesCopy(i18n.resolvedLanguage ?? i18n.language);
  const actionData = useActionData<typeof action>() as ImportEmptyActionData | undefined;
  const navigation = useNavigation();
  const creating = navigation.state === 'submitting';
  const actionError = actionData?.errorCode ? copy[`importRoutes.empty.error.${actionData.errorCode}`] : null;

  return (
    <AppShell title={copy['importRoutes.empty.page.title']} description={copy['importRoutes.empty.page.description']}>
      <Form
        method="post"
        className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
      >
        <FilePlus2 className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {actionError ? (
          <p role="alert" className="mb-4 text-sm text-[var(--status-error-text)]">
            {actionError}
          </p>
        ) : null}
        <label className="grid gap-2 text-sm font-medium">
          {copy['importRoutes.empty.form.projectName']}
          <input
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none sm:text-sm"
            name="name"
            placeholder={copy['importRoutes.empty.form.projectPlaceholder']}
            defaultValue=""
            aria-label={copy['importRoutes.empty.form.projectName']}
          />
        </label>
        <p className="mt-2 text-xs font-normal text-bolt-elements-textTertiary">
          {copy['importRoutes.empty.form.help']}
        </p>
        <div className="mt-5">
          <Button
            type="submit"
            className="min-h-11 w-full whitespace-normal sm:w-auto"
            disabled={creating}
            aria-busy={creating}
          >
            {creating ? copy['importRoutes.empty.form.creating'] : copy['importRoutes.empty.form.submit']}
          </Button>
          {creating ? (
            <div
              className="mt-3 h-1 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1"
              role="progressbar"
              aria-label={copy['importRoutes.empty.form.progress']}
            >
              <div className="h-full w-full animate-pulse rounded-full bg-[var(--vc-ide-accent-action)]" />
            </div>
          ) : null}
        </div>
      </Form>
    </AppShell>
  );
}
