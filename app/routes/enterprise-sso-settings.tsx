import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  firstOrganizationOrNull,
  formObject,
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
  const body = formObject(await request.formData()) as Record<string, string>;

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  if (body.type === 'saml') {
    await apiRequest(request, `/orgs/${body.orgId}/sso/saml`, {
      method: 'PUT',
      body: JSON.stringify({
        entityId: body.entityId,
        ssoUrl: body.ssoUrl,
        x509Certificate: body.x509Certificate,
        enabled: body.enabled === 'true',
      }),
    });
  } else {
    await apiRequest(request, `/orgs/${body.orgId}/sso/oidc`, {
      method: 'PUT',
      body: JSON.stringify({
        issuer: body.issuer,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        authorizationUrl: body.authorizationUrl || undefined,
        tokenUrl: body.tokenUrl || undefined,
        jwksUrl: body.jwksUrl || undefined,
        enabled: body.enabled === 'true',
      }),
    });
  }

  return json({ status: 'SSO settings saved.' });
}

export default function EnterpriseSsoSettingsPage() {
  const { orgId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Enterprise SSO settings"
      description="Configure OIDC, Microsoft Entra ID or SAML identity providers for Enterprise plans."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
        <SelectField
          label="Provider type"
          name="type"
          defaultValue="oidc"
          options={[
            { value: 'oidc', label: 'OIDC / Entra ID' },
            { value: 'saml', label: 'SAML' },
          ]}
        />
        <TextField label="Issuer" name="issuer" type="url" />
        <TextField label="Entity ID" name="entityId" />
        <TextField label="Authorization URL" name="authorizationUrl" type="url" />
        <TextField label="Token URL" name="tokenUrl" type="url" />
        <TextField label="JWKS URL" name="jwksUrl" type="url" />
        <TextField label="SSO URL" name="ssoUrl" type="url" />
        <TextField label="Client ID" name="clientId" />
        <TextField label="Client secret" name="clientSecret" type="password" />
        <TextField label="SAML X.509 certificate" name="x509Certificate" />
        <input type="hidden" name="enabled" value="true" />
        <PrimaryButton>Save SSO settings</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
