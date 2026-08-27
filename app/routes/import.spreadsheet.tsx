import { Table2 } from 'lucide-react';
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
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatImportSpreadsheetCopy, getImportSpreadsheetCopy } from '~/lib/i18n/catalogs/import-spreadsheet';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { buildSpreadsheetProject, parseDelimited } from '~/lib/import-spreadsheet';
import { isReauthRedirect } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

const IMPORT_SPREADSHEET_CANONICAL_URL = 'https://e-code.ai/import/spreadsheet';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getImportSpreadsheetCopy(language);
  const title = copy['importSpreadsheet.meta.title'];
  const description = copy['importSpreadsheet.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: IMPORT_SPREADSHEET_CANONICAL_URL },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: IMPORT_SPREADSHEET_CANONICAL_URL },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: `${IMPORT_SPREADSHEET_CANONICAL_URL}?lang=en`,
    },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: `${IMPORT_SPREADSHEET_CANONICAL_URL}?lang=fr`,
    },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: IMPORT_SPREADSHEET_CANONICAL_URL },
  ];
};

type Project = { id: string; slug?: string };

const MAX_CELLS = 50_000;

export async function loader({ request }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return json({ language: localeResolution.language }, { headers: localeResponseHeaders(request, localeResolution) });
}

type ImportSpreadsheetErrorCode = 'dataRequired' | 'malformed' | 'tooLarge' | 'createFailed';
type ImportSpreadsheetActionData = { errorCode: ImportSpreadsheetErrorCode; limit?: number };

/**
 * Turn pasted/uploaded CSV or TSV into a REAL, previewable data app: a static,
 * dependency-free sortable table (index.html + data.json). Validation runs
 * before anything is created — an empty or malformed sheet returns an inline,
 * recoverable error. The generated files are zipped and pushed through the same
 * proven `import/zip` pipeline (staging + secret scan) as every other import.
 */
export async function action({ request }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const language = localeResolution.language;
  const copy = getImportSpreadsheetCopy(language);

  const actionError = (errorCode: ImportSpreadsheetErrorCode, status: number, limit?: number) =>
    json<ImportSpreadsheetActionData>(
      { errorCode, ...(limit === undefined ? {} : { limit }) },
      { status, headers: localeResponseHeaders(request, localeResolution) },
    );

  const body = formObject(await request.formData()) as { csv?: string; name?: string };
  const raw = (body.csv ?? '').trim();

  if (!raw) {
    return actionError('dataRequired', 400);
  }

  const parsed = parseDelimited(raw, language);

  if (parsed.rows.length === 0 || parsed.headers.length === 0) {
    return actionError('malformed', 400);
  }

  if (parsed.headers.length * parsed.rows.length > MAX_CELLS) {
    return actionError('tooLarge', 413, MAX_CELLS);
  }

  const name = body.name?.trim() || copy['importSpreadsheet.generated.defaultName'];

  try {
    const organization = await firstOrganization(request);

    const zipBase64 = await buildSpreadsheetProject({
      name,
      headers: parsed.headers,
      rows: parsed.rows,
      language,
    });
    const result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/import/zip`, {
      method: 'POST',
      body: JSON.stringify({ name, zipBase64 }),
    });

    return redirect(
      projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
    );
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    return actionError('createFailed', error instanceof Response ? error.status : 500);
  }
}

export default function ImportSpreadsheetPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getImportSpreadsheetCopy(language);
  const actionData = useActionData<typeof action>() as ImportSpreadsheetActionData | undefined;
  const navigation = useNavigation();
  const importing = navigation.state === 'submitting';

  const actionError = actionData?.errorCode
    ? formatImportSpreadsheetCopy(copy[`importSpreadsheet.error.${actionData.errorCode}`], {
        count: new Intl.NumberFormat(language.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US').format(
          actionData.limit ?? MAX_CELLS,
        ),
      })
    : null;

  return (
    <AppShell title={copy['importSpreadsheet.page.title']} description={copy['importSpreadsheet.page.description']}>
      <Form
        method="post"
        className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
      >
        <Table2 className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {actionError ? (
          <p role="alert" className="mb-4 text-sm text-[var(--status-error-text)]">
            {actionError}
          </p>
        ) : null}
        <label className="grid gap-2 text-sm font-medium">
          {copy['importSpreadsheet.form.projectName']}
          <input
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none sm:text-sm"
            name="name"
            placeholder={copy['importSpreadsheet.form.projectPlaceholder']}
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          {copy['importSpreadsheet.form.data']}
          <textarea
            name="csv"
            rows={10}
            className="w-full min-w-0 max-w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 font-mono text-xs outline-none"
            placeholder={copy['importSpreadsheet.form.dataPlaceholder']}
          />
        </label>
        <p className="mt-2 text-xs font-normal text-bolt-elements-textTertiary">
          {copy['importSpreadsheet.form.help']}
        </p>
        <div className="mt-5">
          <Button
            type="submit"
            className="min-h-11 w-full whitespace-normal sm:w-auto"
            disabled={importing}
            aria-busy={importing}
          >
            {importing ? copy['importSpreadsheet.form.generating'] : copy['importSpreadsheet.form.create']}
          </Button>
          {importing ? (
            <div
              className="mt-3 h-1 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1"
              role="progressbar"
              aria-label={copy['importSpreadsheet.form.progress']}
            >
              <div className="h-full w-full animate-pulse rounded-full bg-[var(--vc-ide-accent-action)]" />
            </div>
          ) : null}
        </div>
      </Form>
    </AppShell>
  );
}
