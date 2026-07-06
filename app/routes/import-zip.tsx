import { FileArchive } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData } from 'react-router';
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
import { resolveImportActionError } from '~/lib/import-action-error';
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

  let result: { project: Project };

  try {
    result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/import/zip`, {
      method: 'POST',
      body: JSON.stringify({ name, zipBase64: base64FromArrayBuffer(await archive.arrayBuffer()) }),
    });
  } catch (error) {
    const resolved = await resolveImportActionError(error, 'Failed to import zip.');

    if (resolved.rethrow) {
      throw error;
    }

    return { error: resolved.error };
  }

  return redirect(
    projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
  );
}

export default function ImportZipPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');

  return (
    <AppShell title="Import zip" description="Upload an archive and convert it into a persistent E-Code project.">
      <Form
        className="w-full max-w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
        method="post"
        encType="multipart/form-data"
      >
        <FileArchive className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {actionData?.error ? (
          <p role="alert" className="mb-4 text-sm text-[var(--status-error-text)]">
            {actionData.error}
          </p>
        ) : null}
        <div className="grid gap-2 text-sm font-medium">
          <span>Project archive</span>
          {/* Custom themed file picker (English) so the native browser button/label
              (localised, e.g. "Choisir un fichier / aucun fichier") never renders and
              the control can't push its intrinsic width past the card at 390. */}
          <input
            ref={fileInputRef}
            className="hidden"
            name="archive"
            type="file"
            accept=".zip"
            onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? '')}
          />
          <div className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 rounded bg-bolt-elements-background-depth-3 px-3 py-1.5 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-borderColor focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              Choose file
            </button>
            <span className="min-w-0 flex-1 truncate text-sm text-bolt-elements-textSecondary">
              {fileName || 'No file selected'}
            </span>
          </div>
        </div>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          Project name
          <input
            className="h-10 w-full max-w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none sm:text-sm"
            name="name"
            placeholder="Zip import"
          />
        </label>
        <div className="mt-5">
          <Button type="submit" className="w-full sm:w-auto">
            Import zip
          </Button>
        </div>
      </Form>
    </AppShell>
  );
}
