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
  const body = formObject(await request.formData()) as { orgId?: string; format?: string };

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  const result = await apiRequest(request, `/orgs/${body.orgId}/audit-logs/export?format=${body.format ?? 'json'}`);

  return json({
    status: 'Audit export loaded.',
    exportPreview: typeof result === 'string' ? result.slice(0, 1000) : JSON.stringify(result).slice(0, 1000),
  });
}

export default function AuditLogsPage() {
  const { orgId } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>() as
    | { status?: string; error?: string; exportPreview?: string }
    | undefined;

  return (
    <EnterpriseFormPage
      title="Audit logs"
      description="Review and export security-relevant organization events to CSV, JSON or SIEM webhooks."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
        <SelectField
          label="Export format"
          name="format"
          defaultValue="json"
          options={[
            { value: 'json', label: 'JSON' },
            { value: 'csv', label: 'CSV' },
          ]}
        />
        <PrimaryButton>Export audit logs</PrimaryButton>
      </Form>
      {actionData?.exportPreview ? (
        <pre className="mt-6 max-h-72 overflow-auto rounded-md border border-bolt-elements-borderColor p-3 text-xs">
          {actionData.exportPreview}
        </pre>
      ) : null}
    </EnterpriseFormPage>
  );
}
