import type { MetaFunction } from '@remix-run/cloudflare';
import { Github } from 'lucide-react';
import { AppShell, SettingsForm } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Import GitHub - VibeCore' }];

export default function ImportGithubPage() {
  return (
    <AppShell
      title="Import GitHub"
      description="Import a repository into a persistent project, then open it in the Bolt IDE."
    >
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
        <Github className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        <SettingsForm
          submitLabel="Import repository"
          fields={[
            { label: 'Repository URL', name: 'repositoryUrl', placeholder: 'https://github.com/org/repo' },
            { label: 'Branch', name: 'branch', placeholder: 'main' },
            { label: 'Project name', name: 'name', placeholder: 'Imported app' },
          ]}
        />
      </div>
    </AppShell>
  );
}
