import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData, useNavigation } from '@remix-run/react';
import { Braces } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type EnvData = { envVars: Array<{ id: string; key: string; value: string; updatedAt?: string }> };

export const meta: MetaFunction = () => [{ title: 'Environment variables - E-Code' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<EnvData>(args, (projectId) => `/projects/${projectId}/env-vars`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
      });
      return redirect(`/projects/${projectId}/env`);
    },
  });

export default function ProjectEnvPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';

  return (
    <ProjectShell
      projectId={project.id}
      title="Environment variables"
      description="Manage non-secret runtime configuration for development, preview and production environments."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ActivityList
          items={
            data.envVars.length
              ? data.envVars.map((item) => ({
                  title: item.key,
                  detail: item.updatedAt
                    ? `Updated ${new Date(item.updatedAt).toLocaleString()}`
                    : 'Stored in project metadata',
                  icon: Braces,
                }))
              : [
                  {
                    title: 'No environment variables',
                    detail: 'Add the first project environment variable.',
                    icon: Braces,
                  },
                ]
          }
        />
        <Form
          method="post"
          className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        >
          <Field label="Variable name" name="key" placeholder="VITE_API_URL" required />
          <Field label="Value" name="value" placeholder="https://api.example.com" />
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save variable'}
          </Button>
        </Form>
      </div>
    </ProjectShell>
  );
}

function Field(props: { label: string; name: string; placeholder?: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>
        {props.label}
        {props.required ? (
          <span className="ml-0.5 text-red-500" aria-hidden>
            *
          </span>
        ) : null}
      </span>
      <input
        className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        placeholder={props.placeholder}
        required={props.required}
      />
    </label>
  );
}
