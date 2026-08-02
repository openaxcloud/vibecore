import { Table2 } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useNavigation } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { buildSpreadsheetProject, parseDelimited } from '~/lib/import-spreadsheet';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

export const meta: MetaFunction = () => [{ title: 'Import spreadsheet - E-Code' }];

type Project = { id: string; slug?: string };

const MAX_CELLS = 50_000;

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return null;
}

/**
 * Turn pasted/uploaded CSV or TSV into a REAL, previewable data app: a static,
 * dependency-free sortable table (index.html + data.json). Validation runs
 * before anything is created — an empty or malformed sheet returns an inline,
 * recoverable error. The generated files are zipped and pushed through the same
 * proven `import/zip` pipeline (staging + secret scan) as every other import.
 */
export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const body = formObject(await request.formData()) as { csv?: string; name?: string };
  const raw = (body.csv ?? '').trim();

  if (!raw) {
    return { error: 'Paste some CSV or TSV data first.' };
  }

  const parsed = parseDelimited(raw);

  if (parsed.rows.length === 0 || parsed.headers.length === 0) {
    return { error: 'Could not find a header row and at least one data row. Check the delimiter and try again.' };
  }

  if (parsed.headers.length * parsed.rows.length > MAX_CELLS) {
    return { error: `That sheet is too large to import here (over ${MAX_CELLS.toLocaleString('en-US')} cells).` };
  }

  const name = body.name?.trim() || 'Spreadsheet app';
  const zipBase64 = await buildSpreadsheetProject({ name, headers: parsed.headers, rows: parsed.rows });

  let result: { project: Project };

  try {
    result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/import/zip`, {
      method: 'POST',
      body: JSON.stringify({ name, zipBase64 }),
    });
  } catch (error) {
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return { error: await apiErrorMessage(error, 'Could not create a project from this spreadsheet.') };
    }

    throw error;
  }

  return redirect(
    projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
  );
}

export default function ImportSpreadsheetPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const navigation = useNavigation();
  const importing = navigation.state === 'submitting';

  return (
    <AppShell
      title="Import spreadsheet"
      description="Paste CSV or TSV and generate a real, sortable data app you can open in the IDE and extend with the agent."
    >
      <Form
        method="post"
        className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
      >
        <Table2 className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {actionData?.error ? (
          <p role="alert" className="mb-4 text-sm text-[var(--status-error-text)]">
            {actionData.error}
          </p>
        ) : null}
        <label className="grid gap-2 text-sm font-medium">
          Project name
          <input
            className="h-10 w-full min-w-0 max-w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none sm:text-sm"
            name="name"
            placeholder="Spreadsheet app"
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          CSV or TSV data
          <textarea
            name="csv"
            rows={10}
            className="w-full min-w-0 max-w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 font-mono text-xs outline-none"
            placeholder={'name,role,city\nAda Lovelace,Engineer,London\nGrace Hopper,Admiral,New York'}
          />
        </label>
        <p className="mt-2 text-xs font-normal text-bolt-elements-textTertiary">
          The first row is used as column headers. Delimiter (comma or tab) is detected automatically.
        </p>
        <div className="mt-5">
          <Button type="submit" className="w-full sm:w-auto" disabled={importing} aria-busy={importing}>
            {importing ? 'Generating app…' : 'Create data app'}
          </Button>
          {importing ? (
            <div
              className="mt-3 h-1 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1"
              role="progressbar"
              aria-label="Generating data app"
            >
              <div className="h-full w-full animate-pulse rounded-full bg-[var(--vc-ide-accent-action)]" />
            </div>
          ) : null}
        </div>
      </Form>
    </AppShell>
  );
}
