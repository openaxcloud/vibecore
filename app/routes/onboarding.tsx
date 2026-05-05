import type { MetaFunction } from '@remix-run/cloudflare';
import { CheckCircle2, Github, Sparkles, Users } from 'lucide-react';
import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Onboarding - VibeCore' }];

export default function OnboardingPage() {
  return (
    <AppShell title="Onboarding" description="Set up your organization, first project, runtime and billing guardrails.">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <ActivityList
          items={[
            {
              title: 'Create your first project',
              detail: 'Start from a template, prompt, GitHub repository or zip upload.',
              icon: Sparkles,
            },
            {
              title: 'Invite teammates',
              detail: 'Add members with backend-enforced RBAC before sharing workspaces.',
              icon: Users,
            },
            {
              title: 'Connect GitHub',
              detail: 'Import repositories, push changes and create pull requests from projects.',
              icon: Github,
            },
            {
              title: 'Review quotas',
              detail: 'Confirm runtime, AI and storage limits before heavy usage.',
              icon: CheckCircle2,
            },
          ]}
        />
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
          <h2 className="font-semibold">Recommended next step</h2>
          <p className="mt-2 text-sm text-bolt-elements-textSecondary">
            Create a persistent project and open it in the preserved Bolt IDE.
          </p>
          <div className="mt-5">
            <LinkButton to="/projects/new">Create project</LinkButton>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
