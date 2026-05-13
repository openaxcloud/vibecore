import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData } from '@remix-run/react';
import { GitBranch, GitCommit, Github, GitMerge, GitPullRequest, Layers } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction } from '~/lib/project-route.server';

type GitData = {
  status?: {
    branch?: string;
    changedFiles?: string[];
    fileStatuses?: Array<{ path: string; status: string }>;
    conflicts?: Array<{ path: string; status: string }>;
    ahead?: number;
    behind?: number;
  };
  branches?: string[];
  commits?: Array<{
    sha: string;
    shortSha: string;
    parents: string[];
    author: string;
    date: string;
    message: string;
    refs?: string;
  }>;
  stashes?: Array<{ id: string; branch?: string; message: string }>;
};

export const meta: MetaFunction = () => [{ title: 'Git integration - VibeCore' }];
export async function loader(args: EnterpriseLoaderArgs) {
  const projectId = args.params.projectId;

  if (!projectId) {
    throw redirect('/projects');
  }

  const [projectResult, status, branches, graph, stashes] = await Promise.all([
    apiRequest<any>(args.request, `/projects/${projectId}`),
    apiRequest<any>(args.request, `/projects/${projectId}/git/status`),
    apiRequest<any>(args.request, `/projects/${projectId}/git/branches`),
    apiRequest<any>(args.request, `/projects/${projectId}/git/graph`).catch(() => ({ commits: [] })),
    apiRequest<any>(args.request, `/projects/${projectId}/git/stashes`).catch(() => ({ stashes: [] })),
  ]);

  return json({
    project: projectResult.project,
    data: {
      ...(status as any),
      ...(branches as any),
      ...(graph as any),
      ...(stashes as any),
    } satisfies GitData,
  });
}
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
    'checkout-branch': async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/branches/checkout`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch || 'main', create: false }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    'create-branch': async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/branches/checkout`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch, create: true, startPoint: body.startPoint || undefined }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    stash: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/stash`, {
        method: 'POST',
        body: JSON.stringify({ message: body.message || undefined }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    'apply-stash': async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/stash/apply`, {
        method: 'POST',
        body: JSON.stringify({ stashRef: body.stashRef, drop: false }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    'pop-stash': async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/stash/apply`, {
        method: 'POST',
        body: JSON.stringify({ stashRef: body.stashRef, drop: true }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    'cherry-pick': async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/cherry-pick`, {
        method: 'POST',
        body: JSON.stringify({ sha: body.sha }),
      });
      return redirect(`/projects/${projectId}/git`);
    },
    'resolve-conflict': async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/git/conflicts/resolve`, {
        method: 'POST',
        body: JSON.stringify({ filePath: body.filePath, strategy: body.strategy === 'theirs' ? 'theirs' : 'ours' }),
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
  const fileStatuses = status.fileStatuses ?? status.changedFiles?.map((path: string) => ({ path, status: 'M' })) ?? [];
  const conflicts = status.conflicts ?? [];
  const branches = data.branches ?? [];
  const commits = data.commits ?? [];
  const stashes = data.stashes ?? [];

  return (
    <ProjectShell
      projectId={project.id}
      title="Git integration"
      description="Inspect status, branch selection, commits, pushes, pulls and pull request creation."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
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
            {
              title: `${commits.length} commits indexed`,
              detail: commits[0] ? `${commits[0].shortSha} ${commits[0].message}` : 'No commit graph available yet.',
              icon: GitCommit,
            },
            {
              title: `${conflicts.length} merge conflicts`,
              detail: conflicts.length
                ? 'Resolve files with current or incoming changes.'
                : 'Working tree has no unresolved merge conflict.',
              icon: GitMerge,
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
          <Form method="post" className="grid gap-2 rounded-md border border-bolt-elements-borderColor p-3">
            <input type="hidden" name="intent" value="checkout-branch" />
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-branch-switch">
              Switch branch
            </label>
            <select
              id="git-branch-switch"
              name="branch"
              defaultValue={branch}
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
            >
              {[branch, ...branches.filter((item: string) => item !== branch)].map((item: string) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Switch branch
            </Button>
          </Form>
          <Form method="post" className="grid gap-2 rounded-md border border-bolt-elements-borderColor p-3">
            <input type="hidden" name="intent" value="create-branch" />
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-new-branch">
              New branch name
            </label>
            <input
              id="git-new-branch"
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="branch"
              placeholder="feature/invoice-flow"
              required
            />
            <input
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="startPoint"
              defaultValue={branch}
              aria-label="Start point"
            />
            <Button type="submit" variant="outline">
              Create branch
            </Button>
          </Form>
          <Form method="post" className="grid gap-2 rounded-md border border-bolt-elements-borderColor p-3">
            <input type="hidden" name="intent" value="stash" />
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-stash-message">
              Stash message
            </label>
            <input
              id="git-stash-message"
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="message"
              placeholder="WIP before switching branches"
            />
            <Button type="submit" variant="outline">
              Stash changes
            </Button>
          </Form>
          {stashes.map((stash: { id: string; branch?: string; message: string }) => (
            <div key={stash.id} className="grid gap-2 rounded-md border border-bolt-elements-borderColor p-3 text-sm">
              <div className="font-medium">{stash.id}</div>
              <div className="text-bolt-elements-textSecondary">{stash.message}</div>
              <div className="flex gap-2">
                <StashAction intent="apply-stash" stashRef={stash.id} label="Apply" />
                <StashAction intent="pop-stash" stashRef={stash.id} label="Pop" />
              </div>
            </div>
          ))}
          <Form method="post" className="grid gap-2 rounded-md border border-bolt-elements-borderColor p-3">
            <input type="hidden" name="intent" value="cherry-pick" />
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-cherry-pick">
              Commit SHA
            </label>
            <input
              id="git-cherry-pick"
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="sha"
              placeholder="abc1234"
              required
            />
            <Button type="submit" variant="outline">
              Cherry-pick
            </Button>
          </Form>
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
        <section className="lg:col-span-2 grid gap-4">
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4" />
              Working tree
            </h2>
            {fileStatuses.length ? (
              <div className="grid gap-2">
                {fileStatuses.map((file: { path: string; status: string }) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm"
                  >
                    <span className="truncate">{file.path}</span>
                    <span className="rounded bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs">
                      {file.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-bolt-elements-textSecondary">No changed files.</div>
            )}
          </div>
          {conflicts.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-500">
                <GitMerge className="h-4 w-4" />
                Conflict resolution
              </h2>
              <div className="grid gap-2">
                {conflicts.map((conflict: { path: string; status: string }) => (
                  <div
                    key={conflict.path}
                    className="grid gap-2 rounded-md border border-red-500/30 bg-bolt-elements-background-depth-1 p-3"
                  >
                    <div className="text-sm font-medium">{conflict.path}</div>
                    <div className="flex gap-2">
                      <ResolveConflictAction filePath={conflict.path} strategy="ours" label="Keep current" />
                      <ResolveConflictAction filePath={conflict.path} strategy="theirs" label="Keep incoming" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <GitPullRequest className="h-4 w-4" />
              Commit graph
            </h2>
            {commits.length ? (
              <div className="grid gap-2">
                {commits.map((commit: NonNullable<GitData['commits']>[number], index: number) => (
                  <div
                    key={commit.sha}
                    className="grid grid-cols-[24px_92px_minmax(0,1fr)_160px] items-start gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm"
                  >
                    <div className="relative flex justify-center">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-bolt-elements-item-contentAccent" />
                      {index < commits.length - 1 && (
                        <span className="absolute top-4 h-8 w-px bg-bolt-elements-borderColor" />
                      )}
                    </div>
                    <code className="text-xs text-bolt-elements-textSecondary">{commit.shortSha}</code>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{commit.message}</div>
                      <div className="truncate text-xs text-bolt-elements-textSecondary">
                        {commit.refs || commit.parents.join(', ') || 'root commit'}
                      </div>
                    </div>
                    <div className="truncate text-right text-xs text-bolt-elements-textSecondary">{commit.author}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-bolt-elements-textSecondary">No commit graph available.</div>
            )}
          </div>
        </section>
      </div>
    </ProjectShell>
  );
}

function StashAction({ intent, stashRef, label }: { intent: string; stashRef: string; label: string }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="stashRef" value={stashRef} />
      <Button type="submit" variant="outline">
        {label}
      </Button>
    </Form>
  );
}

function ResolveConflictAction({
  filePath,
  strategy,
  label,
}: {
  filePath: string;
  strategy: 'ours' | 'theirs';
  label: string;
}) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="resolve-conflict" />
      <input type="hidden" name="filePath" value={filePath} />
      <input type="hidden" name="strategy" value={strategy} />
      <Button type="submit" variant="outline">
        {label}
      </Button>
    </Form>
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
