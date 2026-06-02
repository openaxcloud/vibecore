import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData } from '@remix-run/react';
import { Users } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type CollaboratorsData = { collaborators: Array<{ id: string; userId: string; roleKey: string; createdAt?: string }> };

export const meta: MetaFunction = () => [{ title: 'Project collaborators - VibeCore' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<CollaboratorsData>(args, (projectId) => `/projects/${projectId}/collaborators`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/collaborators`, {
        method: 'POST',
        body: JSON.stringify({ email: body.email, roleKey: body.roleKey ?? 'editor' }),
      });
      return redirect(`/projects/${projectId}/collaborators`);
    },
  });

export default function ProjectCollaboratorsPage() {
  const { project, data } = useLoaderData<typeof loader>();

  return (
    <ProjectShell
      projectId={project.id}
      title="Collaborators"
      description="Manage project-level access with organization RBAC enforcement."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ActivityList
          items={
            data.collaborators.length
              ? data.collaborators.map((collaborator) => ({
                  title: collaborator.userId,
                  detail: `Role: ${collaborator.roleKey}`,
                  icon: Users,
                }))
              : [
                  {
                    title: 'No project collaborators',
                    detail: 'Add an organization member by email to grant project access.',
                    icon: Users,
                  },
                ]
          }
        />
        <Form
          method="post"
          className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        >
          <Field label="Email" name="email" type="email" required />
          <label className="grid gap-2 text-sm font-medium">
            Role
            <select
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
              name="roleKey"
              defaultValue="editor"
            >
              <option value="owner">Owner</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <Button type="submit">Add collaborator</Button>
        </Form>
      </div>
    </ProjectShell>
  );
}

function Field(props: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {props.label}
      <input
        className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        type={props.type ?? 'text'}
        required={props.required}
      />
    </label>
  );
}
