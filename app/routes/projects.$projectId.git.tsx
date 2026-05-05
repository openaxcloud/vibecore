import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData } from '@remix-run/react';
import { GitBranch, Github } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type GitData = {
  status?: { branch?: string; changedFiles?: string[]; ahead?: number; behind?: number };
};

export const meta: MetaFunction = () => [{ title: 'Git integration - VibeCore' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<GitData>(args, (projectId) => `/projects/${projectId}/git/status`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    commit: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/commit`, {
        method: 'POST',
        body: JSON.stringify({ message: body.message || 'Update project files' }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    push: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/push`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch || 'main' }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    pull: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/pull`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch || 'main' }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    pr: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/pull-requests`, {
        method: 'POST',
        body: JSON.stringify({
          title: body.title || 'Project update',
          sourceBranch: body.sourceBranch || 'main',
          targetBranch: body.targetBranch || 'main',
          body: body.body,
        }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
  });

export default function ProjectGitPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const status = data.status ?? {};
  const branch = status.branch ?? project.gitDefaultBranch ?? 'main';

  return (
    <ProjectShell
      projectId={project.id}
      title="Git integration"
      description="Inspect status, branch selection, commits, pushes, pulls and pull request creation."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <ActivityList
          items={[
            {
              title: branch,
              detail: `${status.changedFiles?.length ?? 0} changed files, ${status.ahead ?? 0} ahead, ${status.behind ?? 0} behind`,
              icon: GitBranch,
            },
            {
              title: project.gitRepositoryUrl ?? 'No remote repository',
              detail: project.gitRepositoryUrl
                ? 'Git remote configured for this project.'
                : 'Import from GitHub or set a repository URL in settings.',
              icon: Github,
            },
          ]}
        />
        <div className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
          <Form method="post" className="grid gap-3">
            <input type="hidden" name="intent" value="commit" />
            <input
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="message"
              placeholder="Commit message"
            />
            <Button type="submit">Commit changes</Button>
          </Form>
          <BranchForm intent="pull" label="Pull from GitHub" branch={branch} />
          <BranchForm intent="push" label="Push to GitHub" branch={branch} />
          <Form method="post" className="grid gap-3">
            <input type="hidden" name="intent" value="pr" />
            <input
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="title"
              placeholder="PR title"
            />
            <input
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="sourceBranch"
              defaultValue={branch}
            />
            <input
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="targetBranch"
              defaultValue="main"
            />
            <Button type="submit" variant="outline">
              Create PR
            </Button>
          </Form>
        </div>
      </div>
    </ProjectShell>
  );
}

function BranchForm({ intent, label, branch }: { intent: string; label: string; branch: string }) {
  return (
    <Form method="post" className="flex gap-2">
      <input type="hidden" name="intent" value={intent} />
      <input
        className="h-10 min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
        name="branch"
        defaultValue={branch}
      />
      <Button type="submit" variant="outline">
        {label}
      </Button>
    </Form>
  );
}
