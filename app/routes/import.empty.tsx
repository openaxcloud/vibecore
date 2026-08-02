import { FilePlus2 } from 'lucide-react';
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
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

export const meta: MetaFunction = () => [{ title: 'Empty project - E-Code' }];

type Project = { id: string; slug?: string };

const PROJECT_QUOTA_MESSAGE =
  'Your workspace has reached its project limit. Upgrade the plan or ask an admin for a quota override before creating another project.';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return null;
}

/**
 * Create a genuinely blank workspace — no agent prompt, no framework, no
 * scaffolding beyond the minimal files the runtime needs to boot. This is the
 * power-user path (Replit-parity "empty" import source): the project opens
 * straight in the IDE, ready to edit, with no generation step.
 */
export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const body = formObject(await request.formData()) as { name?: string };
  const name = body.name?.trim() || 'Empty project';

  let result: { project: Project };

  try {
    result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  } catch (error) {
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error, 402) || isApiResponse(error, 429)) {
      const message = await apiErrorMessage(error, '');
      return { error: /quota exceeded for projects\.count/i.test(message) ? PROJECT_QUOTA_MESSAGE : message };
    }

    if (isApiResponse(error)) {
      return { error: await apiErrorMessage(error, 'Could not create an empty project.') };
    }

    throw error;
  }

  return redirect(
    projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
  );
}

export default function ImportEmptyPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const navigation = useNavigation();
  const creating = navigation.state === 'submitting';

  return (
    <AppShell
      title="Empty project"
      description="Start from a blank workspace — no agent, no framework, no scaffolding. The project opens straight in the IDE, ready to edit."
    >
      <Form
        method="post"
        className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
      >
        <FilePlus2 className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
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
            placeholder="Empty project"
            defaultValue=""
            aria-label="Project name"
          />
        </label>
        <p className="mt-2 text-xs font-normal text-bolt-elements-textTertiary">
          A blank workspace with only the minimal files the runtime needs to start. Nothing is generated.
        </p>
        <div className="mt-5">
          <Button type="submit" className="w-full sm:w-auto" disabled={creating} aria-busy={creating}>
            {creating ? 'Creating…' : 'Create empty project'}
          </Button>
        </div>
      </Form>
    </AppShell>
  );
}
