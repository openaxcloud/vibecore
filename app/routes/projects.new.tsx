import type { MetaFunction } from '@remix-run/cloudflare';
import { useActionData } from '@remix-run/react';
import { Github, Sparkles, Upload } from 'lucide-react';
import { AppShell, LinkButton, SettingsForm, TemplateGallery } from '~/components/dashboard/SaaSLayout';
import {
  apiRequest,
  firstOrganization,
  formObject,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Create project - VibeCore' }];

type Project = { id: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  await firstOrganization(request);
  return null;
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const body = formObject(await request.formData()) as { name?: string; prompt?: string };
  const name = body.name?.trim();
  const prompt = body.prompt?.trim();

  if (!name) {
    return { error: 'Project name is required' };
  }

  const result = prompt
    ? await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/from-ai`, {
        method: 'POST',
        body: JSON.stringify({ name, prompt }),
      })
    : await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

  const ideUrl = prompt
    ? `/projects/${result.project.id}/ide?prompt=${encodeURIComponent(prompt)}`
    : `/projects/${result.project.id}/ide`;

  return redirect(ideUrl);
}

export default function NewProjectPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <AppShell
      title="Create project"
      description="Create a persistent Bolt project from a template, AI prompt, GitHub repository or zip archive."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
            <h2 className="mb-4 text-lg font-semibold">Project details</h2>
            {actionData?.error ? (
              <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {actionData.error}
              </p>
            ) : null}
            <SettingsForm
              submitLabel="Create project"
              fields={[
                { label: 'Project name', name: 'name', placeholder: 'Customer portal' },
                {
                  label: 'AI prompt',
                  name: 'prompt',
                  placeholder: 'Build a SaaS dashboard with billing and support pages',
                },
              ]}
            />
          </div>
          <TemplateGallery compact mode="authenticated" />
        </div>
        <div className="space-y-3">
          <LinkButton to="/import-github" variant="outline">
            <span className="inline-flex items-center gap-2">
              <Github className="h-4 w-4" aria-hidden />
              Import GitHub
            </span>
          </LinkButton>
          <LinkButton to="/import-zip" variant="outline">
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" aria-hidden />
              Import zip
            </span>
          </LinkButton>
          <LinkButton to="/dashboard/templates" variant="outline">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" aria-hidden />
              Browse templates
            </span>
          </LinkButton>
        </div>
      </div>
    </AppShell>
  );
}
