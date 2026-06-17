import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useActionData } from '@remix-run/react';
import { FileArchive } from 'lucide-react';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectIdePath } from '~/utils/project-url';

export const meta: MetaFunction = () => [{ title: 'Import zip - E-Code' }];

type Project = { id: string; slug?: string };

function base64FromArrayBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);

  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return null;
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const formData = await request.formData();
  const archive = formData.get('archive');
  const name = String(formData.get('name') ?? '').trim() || undefined;

  if (!(archive instanceof File) || archive.size === 0) {
    return { error: 'A zip archive is required.' };
  }

  const result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/import/zip`, {
    method: 'POST',
    body: JSON.stringify({ name, zipBase64: base64FromArrayBuffer(await archive.arrayBuffer()) }),
  });

  return redirect(
    projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
  );
}

export default function ImportZipPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <AppShell title="Import zip" description="Upload an archive and convert it into a persistent Bolt project.">
      <Form
        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        method="post"
        encType="multipart/form-data"
      >
        <FileArchive className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {actionData?.error ? (
          <p role="alert" className="mb-4 text-sm text-red-500">
            {actionData.error}
          </p>
        ) : null}
        <label className="grid gap-2 text-sm font-medium">
          Project archive
          <input
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm"
            name="archive"
            type="file"
            accept=".zip"
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          Project name
          <input
            className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
            name="name"
            placeholder="Zip import"
          />
        </label>
        <div className="mt-5">
          <Button type="submit">Import zip</Button>
        </div>
      </Form>
    </AppShell>
  );
}
