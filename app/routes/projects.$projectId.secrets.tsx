import { KeyRound, Lock } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiErrorMessage,
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type SecretsData = { secrets: Array<{ id: string; key: string; createdAt?: string; updatedAt?: string }> };

export const meta: MetaFunction = () => [{ title: 'Project secrets - E-Code' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<SecretsData>(args, (projectId) => `/projects/${projectId}/secrets`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
        });
      } catch (error) {
        /*
         * The API validates the key against /^[A-Z0-9_]+$/ (400), enforces RBAC (403) and may fail
         * with 500. Surface the message inline instead of throwing to an error boundary.
         */
        const status = error instanceof Response ? error.status : 400;
        return json({ error: await apiErrorMessage(error, 'Failed to save secret') }, { status });
      }
      return redirect(`/projects/${projectId}/secrets`);
    },
  });

export default function ProjectSecretsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <ProjectShell
      projectId={project.id}
      title="Secrets"
      description="Encrypted project secrets with explicit runtime injection and no plain-text logs."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ActivityList
          items={
            (data.secrets ?? []).length
              ? (data.secrets ?? []).map((secret) => ({
                  title: secret.key,
                  detail: secret.updatedAt
                    ? `Encrypted, updated ${new Date(secret.updatedAt).toLocaleString()}`
                    : 'Encrypted project secret',
                  icon: Lock,
                }))
              : [
                  {
                    title: 'No project secrets',
                    detail: 'Secrets are encrypted and values are never listed in clear text.',
                    icon: KeyRound,
                  },
                ]
          }
        />
        <Form
          method="post"
          className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        >
          <Field
            label="Secret name"
            name="key"
            placeholder="STRIPE_SECRET_KEY"
            pattern="[A-Z0-9_]+"
            title="Use uppercase letters, numbers and underscores only."
            required
          />
          <Field label="Secret value" name="value" type="password" required />
          {actionData?.error ? (
            <p className="text-sm text-red-500" role="alert">
              {actionData.error}
            </p>
          ) : null}
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save secret'}
          </Button>
        </Form>
      </div>
    </ProjectShell>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  pattern?: string;
  title?: string;
  required?: boolean;
}) {
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
        type={props.type ?? 'text'}
        placeholder={props.placeholder}
        pattern={props.pattern}
        title={props.title}
        required={props.required}
      />
    </label>
  );
}
