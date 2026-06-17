import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return json({ token });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { token?: string };

  if (!body.token) {
    return json({ error: 'Invitation token is required.' }, { status: 400 });
  }

  const result = await apiRequest<{ organizationId: string; roleKey: string }>(request, '/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token: body.token }),
  });

  return json({ status: `Invitation accepted for ${result.organizationId} as ${result.roleKey}.` });
}

export default function AcceptInvitationPage() {
  const { token } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Accept invitation"
      description="Join an organization with a pending invitation token."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Invitation token" name="token" defaultValue={token} required />
        <PrimaryButton>Accept invitation</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
