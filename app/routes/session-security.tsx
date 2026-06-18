import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return json({ orgId: organization.id });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    orgId?: string;
    sessionDurationMinutes?: string;
    ipAllowlist?: string;
  };

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  try {
    await apiRequest(request, `/orgs/${body.orgId}/enterprise-settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        sessionDurationMinutes: body.sessionDurationMinutes ? Number(body.sessionDurationMinutes) : undefined,
        ipAllowlist: body.ipAllowlist
          ? body.ipAllowlist
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
      }),
    });

    return json({ status: 'Session security policy saved.' });
  } catch (error) {
    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Failed to save session security policy.') },
        { status: error.status },
      );
    }

    return json({ error: 'Saving session security policy is temporarily unavailable. Please try again in a moment.' });
  }
}

export default function SessionSecurityPage() {
  const { orgId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Session security"
      description="Inspect active devices, revoke sessions and manage organization session duration policy."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
        <TextField label="Session duration minutes" name="sessionDurationMinutes" type="number" />
        <TextField label="IP allowlist" name="ipAllowlist" placeholder="203.0.113.10,198.51.100.0/24" />
        <PrimaryButton>Save policy</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
