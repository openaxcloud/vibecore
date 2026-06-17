import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData, useNavigation } from '@remix-run/react';
import { KeyRound, Lock } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
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
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
      });
      return redirect(`/projects/${projectId}/secrets`);
    },
  });

export default function ProjectSecretsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';

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
          <Field label="Secret name" name="key" placeholder="STRIPE_SECRET_KEY" required />
          <Field label="Secret value" name="value" type="password" required />
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save secret'}
          </Button>
        </Form>
      </div>
    </ProjectShell>
  );
}

function Field(props: { label: string; name: string; type?: string; placeholder?: string; required?: boolean }) {
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
        required={props.required}
      />
    </label>
  );
}
