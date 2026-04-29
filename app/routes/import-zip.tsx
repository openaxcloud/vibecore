import type { MetaFunction } from '@remix-run/cloudflare';
import { FileArchive } from 'lucide-react';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';

export const meta: MetaFunction = () => [{ title: 'Import zip - VibeCore' }];

export default function ImportZipPage() {
  return (
    <AppShell title="Import zip" description="Upload an archive and convert it into a persistent Bolt project.">
      <form
        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        method="post"
        encType="multipart/form-data"
      >
        <FileArchive className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
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
      </form>
    </AppShell>
  );
}
