import { Users } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { handleCollaboratorActionError } from '~/lib/collaborator-action-error';
import {
  apiRequest,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { collaboratorDetail, collaboratorTitle, type ProjectCollaborator } from '~/lib/project-collaborator-display';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';
import { classNames } from '~/utils/classNames';

type CollaboratorsData = { collaborators: ProjectCollaborator[] };

export const meta: MetaFunction = () => [{ title: 'Project collaborators - E-Code' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<CollaboratorsData>(args, (projectId) => `/projects/${projectId}/collaborators`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/collaborators`, {
          method: 'POST',
          body: JSON.stringify({ email: body.email, roleKey: body.roleKey ?? 'editor' }),
        });
      } catch (error) {
        return handleCollaboratorActionError(error);
      }

      return redirect(`/projects/${projectId}/collaborators`);
    },
    remove: async ({ request, projectId, body }) => {
      if (!body.userId) {
        return handleCollaboratorActionError(new Error('Missing collaborator to remove.'));
      }

      try {
        await apiRequest(request, `/projects/${projectId}/collaborators/${encodeURIComponent(body.userId)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        return handleCollaboratorActionError(error);
      }

      return redirect(`/projects/${projectId}/collaborators`);
    },
  });

export default function ProjectCollaboratorsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submittedIntent = navigation.formData?.get('intent');
  const saving = navigation.state === 'submitting' && submittedIntent == null;

  const removingUserId =
    navigation.state === 'submitting' && submittedIntent === 'remove'
      ? (navigation.formData?.get('userId') as string | null)
      : null;

  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <ProjectShell
      projectId={project.id}
      title="Collaborators"
      description="Manage project-level access with organization RBAC enforcement."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <CollaboratorList collaborators={data.collaborators ?? []} removing={removingUserId} />
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
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Adding…' : 'Add collaborator'}
          </Button>
          {actionData?.error ? (
            <p
              className="rounded-md border border-bolt-elements-icon-error bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-icon-error"
              role="alert"
            >
              {actionData.error}
            </p>
          ) : null}
        </Form>
      </div>
    </ProjectShell>
  );
}

function CollaboratorList({
  collaborators,
  removing,
}: {
  collaborators: ProjectCollaborator[];
  removing: string | null;
}) {
  if (collaborators.length === 0) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <div className="flex gap-3 p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
            <Users className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium">No project collaborators</p>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              Add an organization member by email to grant project access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      {collaborators.map((collaborator, index) => {
        const isRemoving = removing === collaborator.userId;
        return (
          <div
            key={collaborator.id}
            className={classNames(
              'flex items-start gap-3 p-4',
              index > 0 && 'border-t border-bolt-elements-borderColor',
            )}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
              <Users className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{collaboratorTitle(collaborator)}</p>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">{collaboratorDetail(collaborator)}</p>
            </div>
            <Form method="post" className="shrink-0">
              <input type="hidden" name="intent" value="remove" />
              <input type="hidden" name="userId" value={collaborator.userId} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isRemoving}
                aria-busy={isRemoving}
                aria-label={`Remove ${collaboratorTitle(collaborator)}`}
              >
                {isRemoving ? 'Removing…' : 'Remove'}
              </Button>
            </Form>
          </div>
        );
      })}
    </div>
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
