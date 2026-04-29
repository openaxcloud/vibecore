import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData } from '@remix-run/react';
import { Globe2, Rocket } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type DeploymentsData = {
  deployments: Array<{ id: string; provider: string; url?: string; status: string; createdAt?: string }>;
};

export const meta: MetaFunction = () => [{ title: 'Project deployments - VibeCore' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<DeploymentsData>(args, (projectId) => `/projects/${projectId}/deployments`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/deployments`, {
        method: 'POST',
        body: JSON.stringify({ provider: body.provider || 'preview', url: body.url || undefined }),
      });
      return redirect(`/projects/${projectId}/deployments`);
    },
  });

export default function ProjectDeploymentsPage() {
  const { project, data } = useLoaderData<typeof loader>();

  return (
    <ProjectShell
      projectId={project.id}
      title="Deployments"
      description="Deploy previews and production builds while enforcing deployment quotas."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ActivityList
          items={
            data.deployments.length
              ? data.deployments.map((deployment) => ({
                  title: `${deployment.provider} ${deployment.status}`,
                  detail:
                    deployment.url ??
                    (deployment.createdAt ? new Date(deployment.createdAt).toLocaleString() : 'No URL recorded'),
                  icon: Globe2,
                }))
              : [
                  {
                    title: 'No deployments yet',
                    detail: 'Create a deployment record after a successful build or preview.',
                    icon: Rocket,
                  },
                ]
          }
        />
        <Form
          method="post"
          className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        >
          <Field label="Provider" name="provider" placeholder="preview" />
          <Field label="URL" name="url" placeholder="https://preview.example.com" />
          <Button type="submit">New deployment</Button>
        </Form>
      </div>
    </ProjectShell>
  );
}

function Field(props: { label: string; name: string; placeholder?: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {props.label}
      <input
        className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        placeholder={props.placeholder}
      />
    </label>
  );
}
