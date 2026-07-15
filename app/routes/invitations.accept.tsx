import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  formObject,
  isApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';
import { userFacingLabel } from '~/lib/user-facing-labels';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return json({ token });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { token?: string };

  if (!body.token) {
    return json({ error: 'Invitation token is required.' }, { status: 400 });
  }

  try {
    const result = await apiRequest<{ organizationId: string; roleKey: string }>(request, '/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: body.token }),
    });

    return json({ status: `Invitation accepted. You now have ${userFacingLabel(result.roleKey)} access.` });
  } catch (error) {
    /*
     * `/invitations/accept` is a page navigation, not an `/api/` call, so
     * `apiRequest` honours `redirectOn401` and throws a framework `redirect()`
     * Response (302 to /login, or /mfa-setup for a platform-admin MFA gate) on
     * an expired session. Re-throw those so the framework performs the re-auth
     * redirect — `isApiResponse` matches any Response (including 3xx), so it
     * would otherwise swallow the redirect into a generic inline error.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json({ error: await apiErrorMessage(error, 'Failed to accept invitation.') }, { status: error.status });
    }

    return json({ error: 'Accepting invitations is temporarily unavailable. Please try again in a moment.' });
  }
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
